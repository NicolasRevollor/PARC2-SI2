-- 003_add_bloqueo_login.sql
-- Migracion ADITIVA obligatoria para el backend.
-- Agrega a la tabla "Usuario" las columnas necesarias para el bloqueo
-- de cuenta tras multiples intentos fallidos de login:
--   - intentosFallidos : contador de intentos fallidos consecutivos
--   - bloqueadoHasta   : momento hasta el cual la cuenta queda bloqueada
-- Debe aplicarse manualmente sobre el contenedor ropaDocker, despues del base.sql.

ALTER TABLE "Usuario"
    ADD COLUMN IF NOT EXISTS "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "bloqueadoHasta" TIMESTAMP NULL;