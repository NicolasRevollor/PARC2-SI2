-- 002_add_imagenes_producto.sql
-- Migracion ADITIVA obligatoria para el backend.
-- La tabla "producto" no tiene campo de imagen en backend/database/base.sql.
-- Se agregan dos columnas NULLABLES (no rompen datos existentes):
--   - imagen_url         : URL de la imagen principal del producto
--   - imagenes_secundarias: array de URLs de imagenes adicionales
-- Debe aplicarse manualmente sobre el contenedor ropaDocker, despues del base.sql.

ALTER TABLE "producto"
    ADD COLUMN IF NOT EXISTS "imagen_url" TEXT NULL,
    ADD COLUMN IF NOT EXISTS "imagenes_secundarias" TEXT[] NULL DEFAULT '{}';
