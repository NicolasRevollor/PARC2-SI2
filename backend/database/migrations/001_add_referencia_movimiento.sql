-- 001_add_referencia_movimiento.sql
-- Migracion ADITIVA obligatoria para el backend.
-- Agrega la columna 'referencia' (nullable) a la tabla "Movimiento".
-- Esta columna NO existe en backend/database/base.sql y se usa para
-- agrupar los dos movimientos de un traspaso entre sucursales (dispatches).
-- Debe aplicarse manualmente sobre el contenedor ropaDocker, despues del base.sql.

ALTER TABLE "Movimiento"
    ADD COLUMN IF NOT EXISTS "referencia" VARCHAR(50) NULL;
