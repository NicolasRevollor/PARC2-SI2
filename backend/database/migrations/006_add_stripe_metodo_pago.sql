-- 006_add_stripe_metodo_pago.sql
-- Migracion ADITIVA obligatoria para el backend.
-- Agrega a la tabla "metodo_pago" las columnas necesarias para registrar un
-- cobro con tarjeta via Stripe como una fila mas de metodo_pago:
--   - stripePaymentIntentId : id del Payment Intent en Stripe (unico cuando no es NULL)
--   - moneda                : moneda enviada a Stripe (ej. "usd")
--   - estadoStripe          : estado real devuelto por PaymentIntents.retrieve
--   - origen                : discriminador ('tarjeta_stripe'), NULL en filas legacy
-- Todas nullable, sin default: las filas seed (Efectivo, QR/Transferencia) no
-- se ven afectadas y su CRUD existente sigue funcionando igual.
-- Debe aplicarse manualmente sobre el contenedor ropaDocker, despues del base.sql.

ALTER TABLE "metodo_pago"
    ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "moneda" VARCHAR(3),
    ADD COLUMN IF NOT EXISTS "estadoStripe" VARCHAR(30),
    ADD COLUMN IF NOT EXISTS "origen" VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_metodo_pago_stripe_pi"
    ON "metodo_pago" ("stripePaymentIntentId")
    WHERE "stripePaymentIntentId" IS NOT NULL;
