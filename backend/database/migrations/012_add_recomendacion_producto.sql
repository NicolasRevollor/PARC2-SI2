-- 012_add_recomendacion_producto.sql
-- Migracion ADITIVA obligatoria para el backend.
-- Agrega "idProducto" (nullable) a "Recomendaciones": antes solo tenia un
-- campo de texto libre "nombre", sin vinculo real al catalogo. Para que las
-- recomendaciones generadas por IA (CU22) nunca referencien un producto
-- inexistente, se necesita esta FK. Nullable para no romper filas
-- existentes creadas manualmente por staff antes de esta migracion.
--
-- Debe aplicarse manualmente sobre el contenedor ropaDocker.

ALTER TABLE "Recomendaciones"
    ADD COLUMN IF NOT EXISTS "idProducto" INTEGER
        REFERENCES "producto" ("idProducto") ON UPDATE CASCADE;
