-- 015_devoluciones_cambio_talla.sql
-- Migracion ADITIVA: devoluciones y cambios de talla/medida dentro de las
-- primeras 24 horas posteriores a la venta.
--
-- Regla de negocio: una prenda se puede devolver o cambiar de talla SOLO si
-- no pasaron mas de 24 horas desde "Venta".fecha. La ventana se valida en
-- app/routers/returns.py y queda auditada en la fila via "fechaVenta"
-- (snapshot inmutable de la fecha de la venta al momento de registrar el
-- cambio) — asi el reporte "el 13 de octubre este cliente cambio esta talla"
-- es reconstruible sin volver a leer la venta.
--
-- Por que "idProductoNuevo" apunta a "producto": la talla es una COLUMNA de
-- "producto" ("talla"), de modo que "la misma prenda en talla L" es otra
-- fila de "producto". Un cambio de talla es entonces: devolver stock de
-- idProducto y descontar stock de idProductoNuevo en la misma sucursal.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + INSERT ... WHERE NOT EXISTS.

CREATE TABLE IF NOT EXISTS "devolucion" (
    "idDevolucion"    BIGSERIAL PRIMARY KEY,
    "tipo"            VARCHAR(20)  NOT NULL,
    "cantidad"        INTEGER      NOT NULL DEFAULT 1,
    "motivo"          VARCHAR(255),
    "estado"          VARCHAR(20)  NOT NULL DEFAULT 'Completada',
    "fecha"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "fechaVenta"      TIMESTAMPTZ  NOT NULL,
    "tallaOriginal"   VARCHAR(20),
    "tallaNueva"      VARCHAR(20),
    "medidaOriginal"  VARCHAR(60),
    "medidaNueva"     VARCHAR(60),
    "montoDevuelto"   NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    "idVenta"         INTEGER NOT NULL REFERENCES "Venta"("idVenta") ON DELETE CASCADE ON UPDATE CASCADE,
    "idProducto"      INTEGER NOT NULL REFERENCES "producto"("idProducto") ON UPDATE CASCADE,
    "idProductoNuevo" INTEGER REFERENCES "producto"("idProducto") ON UPDATE CASCADE,
    "idCliente"       INTEGER NOT NULL REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,
    "codigoSucursal"  INTEGER REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,
    "idUsuario"       INTEGER NOT NULL REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,
    "idTenant"        INTEGER NOT NULL DEFAULT 1 REFERENCES "tenant"("idTenant") ON UPDATE CASCADE,
    CONSTRAINT "chk_devolucion_tipo"
        CHECK ("tipo" IN ('cambio_talla', 'cambio_medida', 'devolucion')),
    CONSTRAINT "chk_devolucion_cantidad" CHECK ("cantidad" > 0),
    CONSTRAINT "chk_devolucion_estado"
        CHECK ("estado" IN ('Completada', 'Rechazada')),
    -- Un cambio de talla sin prenda de reemplazo seria una devolucion, no un
    -- cambio: la integridad se garantiza en la base, no solo en el router.
    CONSTRAINT "chk_devolucion_cambio_destino"
        CHECK ("tipo" <> 'cambio_talla' OR "idProductoNuevo" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "idx_devolucion_cliente_fecha" ON "devolucion" ("idCliente", "fecha");
CREATE INDEX IF NOT EXISTS "idx_devolucion_venta"         ON "devolucion" ("idVenta");
CREATE INDEX IF NOT EXISTS "idx_devolucion_tenant_fecha"  ON "devolucion" ("idTenant", "fecha");
CREATE INDEX IF NOT EXISTS "idx_devolucion_sucursal"      ON "devolucion" ("codigoSucursal");

-- Permisos de staff. El Cliente NO recibe permiso: consulta sus propias
-- devoluciones por el mismo camino que usa en "GET /api/sales" (fallback por
-- idCliente derivado del JWT cuando no tiene "devolucion.ver").
INSERT INTO "permiso" ("nombrePermiso")
SELECT p.nombre
FROM (VALUES ('devolucion.ver'), ('devolucion.crear')) AS p(nombre)
WHERE NOT EXISTS (SELECT 1 FROM "permiso" WHERE "nombrePermiso" = p.nombre);

-- Administrador (1), Encargado de Sucursal (2) y Cajero (3) registran y consultan.
INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT d.codigoRol, pe."idPermiso"
FROM (
    VALUES
        (1, 'devolucion.ver'),
        (1, 'devolucion.crear'),
        (2, 'devolucion.ver'),
        (2, 'devolucion.crear'),
        (3, 'devolucion.ver'),
        (3, 'devolucion.crear')
) AS d(codigoRol, permiso)
JOIN "permiso" pe ON pe."nombrePermiso" = d.permiso
WHERE NOT EXISTS (
    SELECT 1 FROM "asignacion_permiso" a
    WHERE a."codigoRol" = d.codigoRol AND a."idPermiso" = pe."idPermiso"
);
