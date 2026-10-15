-- 014_multitenant_planes.sql
-- Migracion ADITIVA: multitenencia (SaaS) + catalogo de planes de suscripcion.
--
-- Estrategia de multitenencia elegida: BASE DE DATOS COMPARTIDA, ESQUEMA
-- COMPARTIDO, COLUMNA DISCRIMINANTE ("idTenant"). Es la unica de las tres
-- estrategias clasicas (DB por tenant / esquema por tenant / columna
-- discriminante) que se puede aplicar ADITIVAMENTE sobre un esquema que ya
-- tiene datos y codigo en produccion: todas las filas existentes quedan
-- asignadas al tenant 1 ("YouShop Collective") via DEFAULT 1, de modo que
-- ningun INSERT/SELECT previo se rompe mientras los routers se van migrando
-- a filtrar por tenant.
--
-- Solo se marcan con "idTenant" las entidades RAIZ (las que un tenant posee
-- directamente). Las entidades hoja heredan el tenant por su FK:
--   Inventario  -> Sucursal.idTenant
--   Movimiento  -> Inventario -> Sucursal
--   Venta       -> Cliente -> Usuario.idTenant
--   Reserva     -> Sucursal.idTenant
-- Duplicar la columna en las hojas obligaria a mantener consistencia en dos
-- lugares sin ganar aislamiento real.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- INSERT ... WHERE NOT EXISTS. Re-ejecutable sin error.

-- 1) Catalogo de planes -----------------------------------------------------
-- "maxX = -1" significa ilimitado (lo interpreta app/services/tenancy.py).
CREATE TABLE IF NOT EXISTS "plan" (
    "idPlan"               SERIAL PRIMARY KEY,
    "codigo"               VARCHAR(30)  NOT NULL UNIQUE,
    "nombre"               VARCHAR(60)  NOT NULL,
    "descripcion"          VARCHAR(255),
    "precioMensual"        NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    "maxSucursales"        INTEGER NOT NULL DEFAULT 1,
    "maxUsuarios"          INTEGER NOT NULL DEFAULT 2,
    "maxProductos"         INTEGER NOT NULL DEFAULT 50,
    "permiteIA"            BOOLEAN NOT NULL DEFAULT FALSE,
    "permiteOffline"       BOOLEAN NOT NULL DEFAULT FALSE,
    "permiteMultiSucursal" BOOLEAN NOT NULL DEFAULT FALSE,
    "soloLocal"            BOOLEAN NOT NULL DEFAULT FALSE,
    "orden"                INTEGER NOT NULL DEFAULT 0
);

COMMENT ON COLUMN "plan"."soloLocal" IS
    'Free Lite: la operacion vive en la base local del dispositivo (IndexedDB en la PWA); la nube solo respalda.';

INSERT INTO "plan" (
    "codigo", "nombre", "descripcion", "precioMensual",
    "maxSucursales", "maxUsuarios", "maxProductos",
    "permiteIA", "permiteOffline", "permiteMultiSucursal", "soloLocal", "orden"
)
SELECT p.codigo, p.nombre, p.descripcion, p.precio,
       p.max_suc, p.max_usr, p.max_prod,
       p.ia, p.offline, p.multi, p.solo_local, p.orden
FROM (
    VALUES
        ('free_lite',  'Free Lite',  'Opera en la base de datos local del dispositivo, sin costo. Una sucursal.',
            0.00,    1,  2,   50, FALSE, TRUE,  FALSE, TRUE,  1),
        ('basico',     'Basico',     'Boutique afiliada: hasta 2 sucursales sincronizadas en la nube.',
            240.00,  2,  5,  300, FALSE, TRUE,  TRUE,  FALSE, 2),
        ('intermedio', 'Intermedio', 'Maison colectiva: hasta 5 sucursales y reportes consolidados con IA.',
            680.00,  5, 15, 2000, TRUE,  TRUE,  TRUE,  FALSE, 3),
        ('avanzado',   'Avanzado',   'Boveda sovereign: sucursales, usuarios y catalogo ilimitados.',
            1500.00, -1, -1,   -1, TRUE,  TRUE,  TRUE,  FALSE, 4)
) AS p(codigo, nombre, descripcion, precio, max_suc, max_usr, max_prod, ia, offline, multi, solo_local, orden)
WHERE NOT EXISTS (SELECT 1 FROM "plan" WHERE "codigo" = p.codigo);

-- 2) Tenants ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tenant" (
    "idTenant"   SERIAL PRIMARY KEY,
    "nombre"     VARCHAR(120) NOT NULL,
    "slug"       VARCHAR(60)  NOT NULL UNIQUE,
    "estado"     VARCHAR(20)  NOT NULL DEFAULT 'Activo',
    "fechaAlta"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "idPlan"     INTEGER      NOT NULL REFERENCES "plan"("idPlan") ON UPDATE CASCADE
);

-- Tenant 1 = la operacion que ya existe. Se inserta con id explicito porque
-- el DEFAULT de todas las columnas "idTenant" agregadas mas abajo es 1.
INSERT INTO "tenant" ("idTenant", "nombre", "slug", "idPlan")
SELECT 1, 'YouShop Collective', 'youshop', (SELECT "idPlan" FROM "plan" WHERE "codigo" = 'avanzado')
WHERE NOT EXISTS (SELECT 1 FROM "tenant" WHERE "idTenant" = 1);

-- Realinear la secuencia de SERIAL tras el INSERT con id explicito.
SELECT setval(
    pg_get_serial_sequence('"tenant"', 'idTenant'),
    GREATEST((SELECT COALESCE(MAX("idTenant"), 1) FROM "tenant"), 1)
);

-- 3) Columna discriminante en las entidades raiz ----------------------------
ALTER TABLE "Usuario"     ADD COLUMN IF NOT EXISTS "idTenant" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Sucursal"    ADD COLUMN IF NOT EXISTS "idTenant" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "producto"    ADD COLUMN IF NOT EXISTS "idTenant" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Proveedor"   ADD COLUMN IF NOT EXISTS "idTenant" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Temporada"   ADD COLUMN IF NOT EXISTS "idTenant" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Colecciones" ADD COLUMN IF NOT EXISTS "idTenant" INTEGER NOT NULL DEFAULT 1;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['Usuario', 'Sucursal', 'producto', 'Proveedor', 'Temporada', 'Colecciones']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || lower(t) || '_tenant'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("idTenant") '
                'REFERENCES "tenant"("idTenant") ON UPDATE CASCADE',
                t, 'fk_' || lower(t) || '_tenant'
            );
        END IF;
    END LOOP;
END
$$;

-- Indices de filtrado por tenant (toda consulta multitenant arranca por aca).
CREATE INDEX IF NOT EXISTS "idx_usuario_tenant"     ON "Usuario"     ("idTenant");
CREATE INDEX IF NOT EXISTS "idx_sucursal_tenant"    ON "Sucursal"    ("idTenant");
CREATE INDEX IF NOT EXISTS "idx_producto_tenant"    ON "producto"    ("idTenant");
CREATE INDEX IF NOT EXISTS "idx_proveedor_tenant"   ON "Proveedor"   ("idTenant");
CREATE INDEX IF NOT EXISTS "idx_temporada_tenant"   ON "Temporada"   ("idTenant");
CREATE INDEX IF NOT EXISTS "idx_colecciones_tenant" ON "Colecciones" ("idTenant");

-- 4) Permisos de administracion del tenant ----------------------------------
INSERT INTO "permiso" ("nombrePermiso")
SELECT p.nombre
FROM (VALUES ('tenant.ver'), ('tenant.admin')) AS p(nombre)
WHERE NOT EXISTS (SELECT 1 FROM "permiso" WHERE "nombrePermiso" = p.nombre);

-- Administrador (1) administra el tenant; Encargado (2) y Cajero (3) solo lo ven.
INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT d.codigoRol, pe."idPermiso"
FROM (
    VALUES
        (1, 'tenant.ver'),
        (1, 'tenant.admin'),
        (2, 'tenant.ver'),
        (3, 'tenant.ver')
) AS d(codigoRol, permiso)
JOIN "permiso" pe ON pe."nombrePermiso" = d.permiso
WHERE NOT EXISTS (
    SELECT 1 FROM "asignacion_permiso" a
    WHERE a."codigoRol" = d.codigoRol AND a."idPermiso" = pe."idPermiso"
);
