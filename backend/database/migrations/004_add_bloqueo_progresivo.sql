-- 004_add_bloqueo_progresivo.sql
-- Migracion ADITIVA obligatoria para el backend.
-- Agrega a la tabla "Usuario" las columnas necesarias para el bloqueo
-- progresivo de cuenta (30s -> 1min -> 5min -> 15min -> bloqueo permanente
-- hasta que un administrador reactive la cuenta):
--   - vecesBloqueado    : cuantas veces se bloqueo la cuenta consecutivamente
--   - requiereActivacion: TRUE cuando el bloqueo ya es permanente y requiere
--                         que un administrador la reactive manualmente
-- Debe aplicarse manualmente sobre el contenedor ropaDocker, despues del base.sql.

ALTER TABLE "Usuario"
    ADD COLUMN IF NOT EXISTS "vecesBloqueado" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "requiereActivacion" BOOLEAN NOT NULL DEFAULT FALSE;
