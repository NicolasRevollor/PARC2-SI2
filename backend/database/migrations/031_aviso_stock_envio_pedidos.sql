-- 031_aviso_stock_envio_pedidos.sql
-- [CU34] Avisar cuando vuelve el stock de una talla
-- [CU35] Entregar a domicilio una compra en linea
--
--   1. aviso_stock: el cliente pide que le avisen cuando una talla agotada vuelva.
--   2. Trigger en "Inventario": cuando una fila queda con stock disponible, la
--      BASE avisa a los clientes que esperaban esa prenda (aviso en la app y por
--      correo) y marca el pedido como avisado. Asi funciona venga de donde venga
--      el stock: ingreso de lote, traslado, devolucion, reserva cancelada o una
--      correccion manual en Supabase.
--   3. entrega_domicilio (migracion 028) tambien sirve para el envio de una compra
--      en linea: el viaje de tipo "pedido" va ligado a la venta.
--   4. Avisos de tipo "stock" y "pedido".
--
-- Corre igual en el SQL Editor de Supabase y en psql, y es re-ejecutable.

-- ---------------------------------------------------------------------------
-- 1. Avisos de reposicion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "aviso_stock" (
    "idAviso"        BIGSERIAL PRIMARY KEY,
    "idTenant"       INTEGER     NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "idCliente"      INTEGER     NOT NULL REFERENCES "Cliente"("idCliente") ON DELETE CASCADE ON UPDATE CASCADE,
    "idProducto"     INTEGER     NOT NULL REFERENCES "producto"("idProducto") ON DELETE CASCADE ON UPDATE CASCADE,
    "estado"         VARCHAR(10) NOT NULL DEFAULT 'Pendiente',
    "fechaRegistro"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    "fechaAviso"     TIMESTAMPTZ,
    "codigoSucursal" INTEGER     REFERENCES "Sucursal"("codigoSucursal") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_aviso_stock_estado" CHECK ("estado" IN ('Pendiente', 'Avisado', 'Cancelado'))
);
-- Un solo pedido pendiente por cliente y prenda.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_aviso_stock_pendiente" ON "aviso_stock" ("idCliente", "idProducto") WHERE "estado" = 'Pendiente';
CREATE INDEX IF NOT EXISTS "idx_aviso_stock_producto" ON "aviso_stock" ("idProducto", "estado");

ALTER TABLE "notificacion" DROP CONSTRAINT IF EXISTS "chk_notificacion_tipo";
ALTER TABLE "notificacion" ADD CONSTRAINT "chk_notificacion_tipo" CHECK ("tipo" IN (
    'envio', 'reembolso', 'devolucion', 'venta_sin_conexion', 'sincronizacion', 'reserva',
    'suscripcion', 'reporte', 'caja', 'cupon', 'stock', 'pedido'));

-- ---------------------------------------------------------------------------
-- 2. La base avisa cuando vuelve el stock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "fn_avisar_reposicion"() RETURNS TRIGGER AS $$
DECLARE
    a RECORD;
    v_producto TEXT;
    v_sucursal TEXT;
BEGIN
    -- Solo cuando la fila TIENE disponible y antes no tenia (o es nueva).
    IF NEW."cantidad_actual" - NEW."cantidad_reservada" <= 0 THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."cantidad_actual" - OLD."cantidad_reservada" > 0 THEN
        RETURN NEW;
    END IF;

    SELECT p."nombre" || ' talla ' || COALESCE(p."talla", '-') INTO v_producto FROM "producto" p WHERE p."idProducto" = NEW."idProducto";
    SELECT s."nombre" INTO v_sucursal FROM "Sucursal" s WHERE s."codigoSucursal" = NEW."codigoSucursal";

    FOR a IN
        SELECT av."idAviso", av."idTenant", c."idUser"
        FROM "aviso_stock" av
        JOIN "Cliente" c ON c."idCliente" = av."idCliente"
        WHERE av."idProducto" = NEW."idProducto" AND av."estado" = 'Pendiente'
        FOR UPDATE OF av SKIP LOCKED
    LOOP
        IF a."idUser" IS NOT NULL THEN
            INSERT INTO "notificacion" ("idUser", "idTenant", "tipo", "titulo", "mensaje", "referencia", "porCorreo")
            VALUES (
                a."idUser", a."idTenant", 'stock',
                left('Volvio ' || v_producto, 150),
                left('Ya hay stock de ' || v_producto || ' en ' || COALESCE(v_sucursal, 'la tienda')
                     || '. Compralo antes de que se agote.', 600),
                'STK-' || a."idAviso", TRUE
            );
        END IF;
        UPDATE "aviso_stock"
        SET "estado" = 'Avisado', "fechaAviso" = now(), "codigoSucursal" = NEW."codigoSucursal"
        WHERE "idAviso" = a."idAviso";
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_avisar_reposicion" ON "Inventario";
CREATE TRIGGER "trg_avisar_reposicion"
AFTER INSERT OR UPDATE OF "cantidad_actual", "cantidad_reservada" ON "Inventario"
FOR EACH ROW EXECUTE FUNCTION "fn_avisar_reposicion"();

-- ---------------------------------------------------------------------------
-- 3. Envio a domicilio de una compra en linea (viaje de tipo "pedido")
-- ---------------------------------------------------------------------------
ALTER TABLE "entrega_domicilio" ALTER COLUMN "idDevolucion" DROP NOT NULL;
ALTER TABLE "entrega_domicilio" ADD COLUMN IF NOT EXISTS "idVenta" INTEGER;
ALTER TABLE "entrega_domicilio" DROP CONSTRAINT IF EXISTS "fk_entrega_venta";
ALTER TABLE "entrega_domicilio" ADD CONSTRAINT "fk_entrega_venta"
    FOREIGN KEY ("idVenta") REFERENCES "Venta"("idVenta") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_entrega_venta" ON "entrega_domicilio" ("idVenta") WHERE "idVenta" IS NOT NULL;

ALTER TABLE "entrega_domicilio" DROP CONSTRAINT IF EXISTS "chk_entrega_tipo";
ALTER TABLE "entrega_domicilio" ADD CONSTRAINT "chk_entrega_tipo" CHECK ("tipo" IN ('recojo', 'entrega', 'pedido'));
ALTER TABLE "entrega_domicilio" DROP CONSTRAINT IF EXISTS "chk_entrega_origen";
ALTER TABLE "entrega_domicilio" ADD CONSTRAINT "chk_entrega_origen" CHECK (
    ("tipo" = 'pedido' AND "idVenta" IS NOT NULL) OR ("tipo" <> 'pedido' AND "idDevolucion" IS NOT NULL));
