-- 008_add_metodo_pago_owner.sql
-- Migracion ADITIVA obligatoria para el backend.
-- Agrega a "metodo_pago" una columna nullable "idUserPago" (FK -> Usuario)
-- que registra que usuario verifico ese cobro (verify_payment_intent).
-- Cierra el residual descrito en design.md ("Open Questions"): sin esta
-- columna, un Cliente podia adivinar el idMetPago de otro cliente y
-- reutilizar un metodo de pago "tarjeta_stripe" todavia no consumido por
-- ninguna Venta. Con la columna, sales.py rechaza con 403 si
-- metodo_pago.idUserPago esta seteado y no coincide con el caller actual.
-- Nullable: las filas existentes (Efectivo, QR/Transferencia, cobros
-- Stripe ya verificados antes de esta migracion) quedan con idUserPago NULL
-- y su CRUD/lectura no se ve afectado.
-- Debe aplicarse manualmente sobre el contenedor ropaDocker, despues de 007.

ALTER TABLE "metodo_pago"
    ADD COLUMN IF NOT EXISTS "idUserPago" INTEGER
        REFERENCES "Usuario" ("idUser") ON UPDATE CASCADE;
