-- Medidas biometricas del Cliente (altura/pecho/cintura/tiro en cm),
-- necesarias para determinar si una prenda le queda (CU11). Nullable: un
-- cliente puede no haberlas cargado todavia.
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "altura" INTEGER;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "pecho" INTEGER;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cintura" INTEGER;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "tiro" INTEGER;
