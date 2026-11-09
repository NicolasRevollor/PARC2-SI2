-- Imagen frontal de la prenda sin fondo para el probador de la app.
-- Es independiente de la foto principal y no reemplaza las imagenes existentes.
ALTER TABLE producto ADD COLUMN IF NOT EXISTS imagen_probador_url TEXT;
