-- 010_add_metodo_pago_binding_consumo.sql
-- Migracion ADITIVA (correccion review cu12-reserva-deposito-stripe).
-- Agrega a "metodo_pago" tres columnas nullable:
--   - "idProducto"/"codigoSucursal" — a que producto/sucursal quedo ligado un
--     anticipo de reserva verificado (proposito=reserva_deposito). NULL para
--     filas de venta/POS, que no tienen esa semantica de un-solo-producto.
--     Sin esto, un anticipo verificado para un producto barato podia usarse
--     para reservar cualquier otro producto/sucursal (mismo idMetPago).
--   - "consumidoEn" — marca atomica de un-solo-uso. Reemplaza el chequeo
--     anterior (dos SELECT sueltos sobre Venta/Reserva antes del commit, que
--     dejaba una ventana de carrera entre dos requests concurrentes con el
--     mismo idMetPago). El guard ahora hace un UPDATE...WHERE consumidoEn IS
--     NULL...RETURNING atomico: Postgres serializa la fila y solo un
--     request puede "reclamarla".
-- Debe aplicarse manualmente sobre el contenedor ropaDocker, despues de 009.

ALTER TABLE "metodo_pago"
    ADD COLUMN IF NOT EXISTS "idProducto" INTEGER
        REFERENCES "producto" ("idProducto") ON UPDATE CASCADE;

ALTER TABLE "metodo_pago"
    ADD COLUMN IF NOT EXISTS "codigoSucursal" INTEGER
        REFERENCES "Sucursal" ("codigoSucursal") ON UPDATE CASCADE;

ALTER TABLE "metodo_pago"
    ADD COLUMN IF NOT EXISTS "consumidoEn" TIMESTAMPTZ;
