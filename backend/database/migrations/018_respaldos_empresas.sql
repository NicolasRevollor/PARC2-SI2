-- 018_respaldos_empresas.sql
-- Migracion ADITIVA: registro de respaldos (backups) por empresa.
--
-- Por que respaldos POR EMPRESA y no un pg_dump: la base es compartida
-- (columna discriminante "idTenant", migracion 014). Un pg_dump respalda a
-- TODAS las empresas juntas y no sirve para entregarle o restaurarle sus datos
-- a una sola. Cada respaldo es un export JSON comprimido (.json.gz) con
-- unicamente las filas de esa empresa (app/services/respaldos.py).
--
-- Esta tabla guarda el REGISTRO de cada respaldo; el archivo vive en un
-- bucket PRIVADO de Supabase Storage (o en disco local en desarrollo).
--
-- Idempotente: CREATE TABLE / INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "respaldo" (
    "idRespaldo"     BIGSERIAL PRIMARY KEY,
    "idTenant"       INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "tipo"           VARCHAR(12) NOT NULL,
    "estado"         VARCHAR(12) NOT NULL,
    "almacenamiento" VARCHAR(10) NOT NULL,
    "ruta"           VARCHAR(255),
    "tamanoBytes"    BIGINT  NOT NULL DEFAULT 0,
    "filas"          INTEGER NOT NULL DEFAULT 0,
    "error"          VARCHAR(500),
    "creadoEn"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- NULL en los automaticos (los dispara el cron, no una persona).
    "idUsuario"      INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_respaldo_tipo" CHECK ("tipo" IN ('manual', 'automatico')),
    CONSTRAINT "chk_respaldo_estado" CHECK ("estado" IN ('Completado', 'Fallido')),
    CONSTRAINT "chk_respaldo_almacenamiento" CHECK ("almacenamiento" IN ('supabase', 'local'))
);

CREATE INDEX IF NOT EXISTS "idx_respaldo_tenant_fecha" ON "respaldo" ("idTenant", "creadoEn" DESC);
