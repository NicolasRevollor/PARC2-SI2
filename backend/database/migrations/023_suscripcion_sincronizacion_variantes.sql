-- 023_suscripcion_sincronizacion_variantes.sql
-- Ajustes del modelo de datos pedidos en la revision del examen:
--
--   1. Planes: se quita el plan "Free Lite" y la columna "soloLocal", que el
--      examen no contempla. Las empresas que estaban en Free Lite pasan a
--      Basico (tiene limites mayores: no pierden nada).
--   2. Suscripcion (seccion 9.5): tabla "suscripcion" con fecha de inicio,
--      fecha de vencimiento y estado; una suscripcion vigente por empresa y el
--      historial de las anteriores (cambios de plan).
--   3. Sincronizacion (CU14-CU17, RF05, RNF05, RNF10): "Venta" y "Reserva"
--      llevan el UUID de la operacion (idempotencia), su origen (en linea o
--      sin conexion), estado, fecha real en el dispositivo y fecha de
--      sincronizacion; "registro_sincronizacion" guarda el log de cada
--      operacion recibida (aplicada, duplicada o rechazada).
--   4. Variantes: "modelo_producto" agrupa las variantes; cada fila de
--      "producto" es una variante (SKU) del modelo con su talla y color.
--      "detalle_reserva" guarda las prendas de cada reserva.
--
-- Corre igual en el SQL Editor de Supabase (sentencia por sentencia) y en
-- psql, y es re-ejecutable.

-- ---------------------------------------------------------------------------
-- 1. Planes: sin Free Lite ni soloLocal
-- ---------------------------------------------------------------------------
UPDATE "tenant"
SET "idPlan" = (SELECT "idPlan" FROM "plan" WHERE "codigo" = 'basico')
WHERE "idPlan" IN (SELECT "idPlan" FROM "plan" WHERE "codigo" = 'free_lite')
  AND EXISTS (SELECT 1 FROM "plan" WHERE "codigo" = 'basico');

DELETE FROM "plan"
WHERE "codigo" = 'free_lite'
  AND NOT EXISTS (SELECT 1 FROM "tenant" t WHERE t."idPlan" = "plan"."idPlan");

ALTER TABLE "plan" DROP COLUMN IF EXISTS "soloLocal";

-- ---------------------------------------------------------------------------
-- 2. Suscripcion de cada empresa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "suscripcion" (
    "idSuscripcion"    BIGSERIAL PRIMARY KEY,
    "idTenant"         INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "idPlan"           INTEGER NOT NULL REFERENCES "plan"("idPlan") ON UPDATE CASCADE,
    "fechaInicio"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "fechaVencimiento" TIMESTAMPTZ NOT NULL,
    "estado"           VARCHAR(12) NOT NULL DEFAULT 'Activa',
    -- Snapshot del precio al contratar: cambiar el precio del plan no
    -- reescribe lo que ya se cobro.
    "precioMensual"    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    "creadoEn"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "chk_suscripcion_estado" CHECK ("estado" IN ('Activa', 'Suspendida', 'Vencida', 'Finalizada')),
    CONSTRAINT "chk_suscripcion_fechas" CHECK ("fechaVencimiento" > "fechaInicio"),
    CONSTRAINT "chk_suscripcion_precio" CHECK ("precioMensual" >= 0)
);
-- Una sola suscripcion vigente (activa o suspendida) por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_suscripcion_vigente" ON "suscripcion" ("idTenant")
    WHERE "estado" IN ('Activa', 'Suspendida');
CREATE INDEX IF NOT EXISTS "idx_suscripcion_vencimiento" ON "suscripcion" ("estado", "fechaVencimiento");

-- Cada empresa existente arranca con su plan actual desde su fecha de alta;
-- el vencimiento es el fin del periodo mensual en curso.
INSERT INTO "suscripcion" ("idTenant", "idPlan", "fechaInicio", "fechaVencimiento", "estado", "precioMensual")
SELECT t."idTenant", t."idPlan", t."fechaAlta",
       t."fechaAlta" + make_interval(months => (
           (EXTRACT(YEAR FROM age(NOW(), t."fechaAlta")) * 12 + EXTRACT(MONTH FROM age(NOW(), t."fechaAlta")))::INT + 1)),
       CASE WHEN t."estado" = 'Activo' THEN 'Activa' ELSE 'Suspendida' END,
       p."precioMensual"
FROM "tenant" t
JOIN "plan" p ON p."idPlan" = t."idPlan"
WHERE NOT EXISTS (SELECT 1 FROM "suscripcion" s WHERE s."idTenant" = t."idTenant");

-- ---------------------------------------------------------------------------
-- 3. Sincronizacion de operaciones sin conexion
-- ---------------------------------------------------------------------------
-- UUID de la operacion: lo genera el dispositivo al registrarla sin conexion
-- (o el servidor si se hizo en linea). Reenviar el mismo UUID no duplica.
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "uuidOperacion" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "origenRegistro" VARCHAR(12) NOT NULL DEFAULT 'en_linea';
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "estadoSincronizacion" VARCHAR(12) NOT NULL DEFAULT 'Sincronizada';
-- Hora real en que se hizo la venta en el dispositivo y hora en que llego.
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "fechaOperacion" TIMESTAMPTZ;
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "fechaSincronizacion" TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_venta_uuid_operacion" ON "Venta" ("uuidOperacion");
ALTER TABLE "Venta" DROP CONSTRAINT IF EXISTS "chk_venta_origen_registro";
ALTER TABLE "Venta" ADD CONSTRAINT "chk_venta_origen_registro" CHECK ("origenRegistro" IN ('en_linea', 'sin_conexion'));
ALTER TABLE "Venta" DROP CONSTRAINT IF EXISTS "chk_venta_estado_sincronizacion";
ALTER TABLE "Venta" ADD CONSTRAINT "chk_venta_estado_sincronizacion" CHECK (
    "estadoSincronizacion" IN ('Pendiente', 'Sincronizada', 'Conflicto'));

ALTER TABLE "Reserva" ADD COLUMN IF NOT EXISTS "uuidOperacion" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "Reserva" ADD COLUMN IF NOT EXISTS "origenRegistro" VARCHAR(12) NOT NULL DEFAULT 'en_linea';
ALTER TABLE "Reserva" ADD COLUMN IF NOT EXISTS "estadoSincronizacion" VARCHAR(12) NOT NULL DEFAULT 'Sincronizada';
ALTER TABLE "Reserva" ADD COLUMN IF NOT EXISTS "fechaOperacion" TIMESTAMPTZ;
ALTER TABLE "Reserva" ADD COLUMN IF NOT EXISTS "fechaSincronizacion" TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_reserva_uuid_operacion" ON "Reserva" ("uuidOperacion");
ALTER TABLE "Reserva" DROP CONSTRAINT IF EXISTS "chk_reserva_origen_registro";
ALTER TABLE "Reserva" ADD CONSTRAINT "chk_reserva_origen_registro" CHECK ("origenRegistro" IN ('en_linea', 'sin_conexion'));
ALTER TABLE "Reserva" DROP CONSTRAINT IF EXISTS "chk_reserva_estado_sincronizacion";
ALTER TABLE "Reserva" ADD CONSTRAINT "chk_reserva_estado_sincronizacion" CHECK (
    "estadoSincronizacion" IN ('Pendiente', 'Sincronizada', 'Conflicto'));

-- Log de sincronizacion (RNF10): una fila por cada operacion que el servidor
-- recibe de la cola de un dispositivo, con su resultado.
CREATE TABLE IF NOT EXISTS "registro_sincronizacion" (
    "idRegistro"     BIGSERIAL PRIMARY KEY,
    "uuidOperacion"  UUID NOT NULL,
    "tipoOperacion"  VARCHAR(12) NOT NULL,
    "resultado"      VARCHAR(12) NOT NULL,
    "detalle"        VARCHAR(255),
    -- idVenta o codigoReserva que produjo (o que ya existia, si fue duplicada).
    "idReferencia"   INTEGER,
    "fechaOperacion" TIMESTAMPTZ,
    "fechaRecepcion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "dispositivo"    VARCHAR(120),
    "idUsuario"      INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    "idTenant"       INTEGER REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chk_registro_sync_tipo" CHECK ("tipoOperacion" IN ('venta', 'reserva', 'devolucion')),
    CONSTRAINT "chk_registro_sync_resultado" CHECK ("resultado" IN ('Aplicada', 'Duplicada', 'Rechazada'))
);
CREATE INDEX IF NOT EXISTS "idx_registro_sync_tenant" ON "registro_sincronizacion" ("idTenant", "fechaRecepcion");
CREATE INDEX IF NOT EXISTS "idx_registro_sync_uuid" ON "registro_sincronizacion" ("uuidOperacion");

-- ---------------------------------------------------------------------------
-- 4. Modelos y variantes de producto, detalle de reserva
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "modelo_producto" (
    "idModelo"    SERIAL PRIMARY KEY,
    "nombre"      VARCHAR(120) NOT NULL,
    "tipo"        VARCHAR(50),
    "descripcion" TEXT,
    "idTenant"    INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "uq_modelo_tenant_nombre" UNIQUE ("idTenant", "nombre")
);

-- Cada producto es una variante (talla + color) de un modelo.
ALTER TABLE "producto" ADD COLUMN IF NOT EXISTS "idModelo" INTEGER
    REFERENCES "modelo_producto"("idModelo") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "idx_producto_modelo" ON "producto" ("idModelo");

-- Un modelo por tipo de prenda de cada empresa ("Polera Oversize" agrupa
-- todos sus colores y tallas; "Jeans" igual).
INSERT INTO "modelo_producto" ("nombre", "tipo", "idTenant")
SELECT DISTINCT COALESCE(p."tipo", p."nombre"), p."tipo", p."idTenant"
FROM "producto" p
WHERE p."idTenant" IS NOT NULL
ON CONFLICT ("idTenant", "nombre") DO NOTHING;

UPDATE "producto" p
SET "idModelo" = m."idModelo"
FROM "modelo_producto" m
WHERE p."idModelo" IS NULL AND m."idTenant" = p."idTenant" AND m."nombre" = COALESCE(p."tipo", p."nombre");

CREATE TABLE IF NOT EXISTS "detalle_reserva" (
    "idDetalleReserva" BIGSERIAL PRIMARY KEY,
    "codigoReserva"    INTEGER NOT NULL REFERENCES "Reserva"("codigoReserva") ON DELETE CASCADE ON UPDATE CASCADE,
    "idProducto"       INTEGER NOT NULL REFERENCES "producto"("idProducto") ON UPDATE CASCADE,
    "cantidad"         INTEGER NOT NULL DEFAULT 1,
    -- Precio de la prenda al reservar (snapshot).
    "precioUnitario"   NUMERIC(12,2) NOT NULL,
    CONSTRAINT "chk_detalle_reserva_cantidad" CHECK ("cantidad" > 0),
    CONSTRAINT "chk_detalle_reserva_precio" CHECK ("precioUnitario" >= 0),
    CONSTRAINT "uq_detalle_reserva_producto" UNIQUE ("codigoReserva", "idProducto")
);
CREATE INDEX IF NOT EXISTS "idx_detalle_reserva_producto" ON "detalle_reserva" ("idProducto");

-- Las reservas existentes tenian una sola prenda.
INSERT INTO "detalle_reserva" ("codigoReserva", "idProducto", "cantidad", "precioUnitario")
SELECT r."codigoReserva", r."idProducto", 1, p."venta"
FROM "Reserva" r
JOIN "producto" p ON p."idProducto" = r."idProducto"
ON CONFLICT ("codigoReserva", "idProducto") DO NOTHING;
