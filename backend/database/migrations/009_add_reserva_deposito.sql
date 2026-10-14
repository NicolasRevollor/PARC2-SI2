-- 009_add_reserva_deposito.sql
-- Migracion ADITIVA obligatoria para el backend (CU12).
-- Agrega a "Reserva" dos columnas nullable:
--   - "idMetPago" INTEGER REFERENCES "metodo_pago" — el MetodoPago verificado
--     (origen=tarjeta_stripe salvo caller staff) que pago el anticipo del 10%.
--   - "montoDeposito" NUMERIC(10,2) — snapshot INMUTABLE del monto cobrado
--     como deposito, tomado de MetodoPago.monto en el momento de la
--     verificacion. NUNCA se lee MetodoPago.monto en vivo en confirm_reservation:
--     esa columna es mutable via PUT /api/payment-methods/{id} bajo el permiso
--     venta.crear, que un Cliente ya posee (migracion 007) — leerla en vivo le
--     permitiria al pagador inflar el descuento despues de pagar.
-- Ambas columnas quedan NULL para toda reserva creada antes de esta migracion
-- (comportamiento sin deposito preservado: confirm_reservation calcula
-- total == Producto.venta cuando montoDeposito es NULL).
-- Debe aplicarse manualmente sobre el contenedor ropaDocker, despues de 008.

ALTER TABLE "Reserva"
    ADD COLUMN IF NOT EXISTS "idMetPago" INTEGER
        REFERENCES "metodo_pago" ("idMetPago") ON UPDATE CASCADE;

ALTER TABLE "Reserva"
    ADD COLUMN IF NOT EXISTS "montoDeposito" NUMERIC(10, 2);
