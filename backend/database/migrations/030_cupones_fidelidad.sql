-- 030_cupones_fidelidad.sql
-- [CU33] Obtener y usar cupon de descuento por compras
--
-- Regla: por cada 3 compras de un cliente en una empresa, el sistema le emite
-- un cupon del 30% de descuento para su siguiente compra de cualquier producto
-- en esa empresa. El cupon vence a los 90 dias y se usa una sola vez.
--
--   1. tenant."inicioFidelidad": desde cuando cuentan las compras. Las empresas
--      existentes arrancan HOY (si no, un cliente con 30 compras viejas recibiria
--      10 cupones de golpe). Las empresas nuevas arrancan al darse de alta.
--   2. Tabla cupon.
--   3. Avisos de tipo "cupon".
--
-- Corre igual en el SQL Editor de Supabase y en psql, y es re-ejecutable.

ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "inicioFidelidad" TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS "cupon" (
    "idCupon"          BIGSERIAL PRIMARY KEY,
    "codigo"           VARCHAR(20)   NOT NULL,
    "idTenant"         INTEGER       NOT NULL,
    "idCliente"        INTEGER       NOT NULL,
    -- 1 = primer cupon del cliente en la empresa, 2 = segundo... evita duplicados.
    "numero"           INTEGER       NOT NULL,
    "porcentaje"       NUMERIC(5, 2) NOT NULL DEFAULT 30.00,
    "estado"           VARCHAR(10)   NOT NULL DEFAULT 'Disponible',
    "fechaEmision"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    "fechaVencimiento" TIMESTAMPTZ   NOT NULL,
    "idVentaOrigen"    INTEGER,                       -- la compra que completo las 3
    "idVentaUso"       INTEGER,                       -- la compra en la que se uso
    "montoDescontado"  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "fechaUso"         TIMESTAMPTZ,
    CONSTRAINT "uq_cupon_codigo"        UNIQUE ("codigo"),
    CONSTRAINT "uq_cupon_numero"        UNIQUE ("idTenant", "idCliente", "numero"),
    CONSTRAINT "uq_cupon_venta_uso"     UNIQUE ("idVentaUso"),
    CONSTRAINT "fk_cupon_tenant"        FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_cupon_cliente"       FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_cupon_venta_origen"  FOREIGN KEY ("idVentaOrigen") REFERENCES "Venta"("idVenta") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fk_cupon_venta_uso"     FOREIGN KEY ("idVentaUso") REFERENCES "Venta"("idVenta") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_cupon_estado"       CHECK ("estado" IN ('Disponible', 'Usado', 'Vencido')),
    CONSTRAINT "chk_cupon_porcentaje"   CHECK ("porcentaje" > 0 AND "porcentaje" <= 100),
    CONSTRAINT "chk_cupon_uso"          CHECK ("estado" <> 'Usado' OR "idVentaUso" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "idx_cupon_cliente" ON "cupon" ("idCliente", "idTenant", "estado");

ALTER TABLE "notificacion" DROP CONSTRAINT IF EXISTS "chk_notificacion_tipo";
ALTER TABLE "notificacion" ADD CONSTRAINT "chk_notificacion_tipo" CHECK ("tipo" IN (
    'envio', 'reembolso', 'devolucion', 'venta_sin_conexion', 'sincronizacion', 'reserva',
    'suscripcion', 'reporte', 'caja', 'cupon'));
