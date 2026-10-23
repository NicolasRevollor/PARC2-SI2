-- 019_backfill_metodo_pago_consumido.sql
-- Correccion de datos sobre la 010.
--
-- La 010 agrego "consumidoEn" (marca de un solo uso de un metodo de pago),
-- pero no la completo para las filas que YA estaban usadas por una Venta o
-- una Reserva antes de esa migracion. Esas filas quedaban con
-- "consumidoEn" = NULL, asi que el guard (app/services/metodo_pago_guard.py)
-- las aceptaba de nuevo: un mismo pago historico podia respaldar otra venta.
-- Ademas aparecian como "disponibles" en GET /api/payment-methods y borrarlas
-- fallaba por la FK de "Venta"/"Reserva".
--
-- Idempotente: solo toca filas con "consumidoEn" IS NULL.

UPDATE "metodo_pago" mp
SET "consumidoEn" = COALESCE(
    (SELECT MIN(v."fecha") FROM "Venta" v WHERE v."idMetPago" = mp."idMetPago"),
    NOW()
)
WHERE mp."consumidoEn" IS NULL
  AND (
      EXISTS (SELECT 1 FROM "Venta" v WHERE v."idMetPago" = mp."idMetPago")
      OR EXISTS (SELECT 1 FROM "Reserva" r WHERE r."idMetPago" = mp."idMetPago")
  );
