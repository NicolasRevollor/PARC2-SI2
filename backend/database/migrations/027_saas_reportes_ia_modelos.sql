-- 027_saas_reportes_ia_modelos.sql
-- [CU21] a [CU30]: plataforma SaaS, reportes generativos y modelos de IA.
-- Ademas corrige un dato del [CU14] (ver punto 0).
--
--   0. [CU14] Las ventas sin conexion dejaban el movimiento de stock con el motivo
--      "Venta N (sin conexion)". Los reportes por sucursal, el CU1 y el CU11 buscan
--      exactamente "Venta N", asi que esas ventas quedaban SIN sucursal.
--   1. [CU21] Empresa con NIT; [CU23] plan que se puede desactivar.
--   2. [CU22] Suscripcion: estados "Gracia" y "Cancelada", motivo de suspension,
--      pagos simulados y fin de la renovacion automatica.
--   3. [CU24] Usuario: baja (activo, fechaBaja) y cuenta pendiente de activacion.
--   4. [CU26] [CU27] [CU28] Solicitudes de reportes y exportaciones.
--   5. [CU29] [CU30] Versiones de los modelos de Machine Learning.
--   6. Avisos nuevos y permisos reporte.ia e ia.modelos.
--
-- Corre igual en el SQL Editor de Supabase y en psql, y es re-ejecutable.

-- ---------------------------------------------------------------------------
-- 0. [CU14] Motivo del movimiento de las ventas sin conexion
-- ---------------------------------------------------------------------------
UPDATE "Movimiento"
SET "motivo" = regexp_replace("motivo", ' \(sin conexion\)$', ''),
    "referencia" = COALESCE("referencia", 'sin_conexion')
WHERE "tipo" = 'venta' AND "motivo" LIKE 'Venta % (sin conexion)';

-- ---------------------------------------------------------------------------
-- 1. Empresa y plan
-- ---------------------------------------------------------------------------
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "nit" VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_nit" ON "tenant" ("nit") WHERE "nit" IS NOT NULL;

-- Un plan con empresas no se borra: se desactiva para nuevas contrataciones (CU23 alt. 2).
ALTER TABLE "plan" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- 2. Suscripcion
-- ---------------------------------------------------------------------------
ALTER TABLE "suscripcion" DROP CONSTRAINT IF EXISTS "chk_suscripcion_estado";
ALTER TABLE "suscripcion" ADD CONSTRAINT "chk_suscripcion_estado" CHECK (
    "estado" IN ('Activa', 'Gracia', 'Suspendida', 'Cancelada', 'Vencida', 'Finalizada'));
ALTER TABLE "suscripcion" ADD COLUMN IF NOT EXISTS "motivoSuspension" VARCHAR(255);

-- La vigente puede estar activa, en gracia o suspendida.
DROP INDEX IF EXISTS "uq_suscripcion_vigente";
CREATE UNIQUE INDEX "uq_suscripcion_vigente" ON "suscripcion" ("idTenant")
    WHERE "estado" IN ('Activa', 'Gracia', 'Suspendida');

-- Antes la suscripcion se renovaba sola al vencer. Ahora la renueva el
-- Administrador de plataforma (CU22): las vencidas arrancan con un mes mas
-- para que ninguna empresa quede bloqueada el dia del despliegue.
UPDATE "suscripcion"
SET "fechaVencimiento" = NOW() + INTERVAL '1 month'
WHERE "estado" = 'Activa' AND "fechaVencimiento" <= NOW();

-- Pago simulado de cada renovacion (CU22 paso 4): no hay pasarela de cobro de planes.
CREATE TABLE IF NOT EXISTS "pago_suscripcion" (
    "idPago"          BIGSERIAL PRIMARY KEY,
    "idSuscripcion"   BIGINT NOT NULL REFERENCES "suscripcion"("idSuscripcion") ON DELETE CASCADE ON UPDATE CASCADE,
    "idTenant"        INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "meses"           INTEGER NOT NULL,
    "monto"           NUMERIC(12,2) NOT NULL,
    "vencimientoAnterior" TIMESTAMPTZ NOT NULL,
    "vencimientoNuevo"    TIMESTAMPTZ NOT NULL,
    "fecha"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "idUsuario"       INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_pago_suscripcion" CHECK ("meses" BETWEEN 1 AND 24 AND "monto" >= 0)
);
CREATE INDEX IF NOT EXISTS "idx_pago_suscripcion_tenant" ON "pago_suscripcion" ("idTenant", "fecha");

-- ---------------------------------------------------------------------------
-- 3. Usuario: baja y activacion
-- ---------------------------------------------------------------------------
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "fechaBaja" TIMESTAMPTZ;
-- Falso mientras el usuario no defina su contrasena con el enlace de activacion (CU21, CU24).
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "cuentaActivada" BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- 4. Reportes generativos y exportaciones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "reporte_solicitud" (
    "idSolicitud"    BIGSERIAL PRIMARY KEY,
    "idTenant"       INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "idUsuario"      INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    "texto"          VARCHAR(500) NOT NULL,
    "origen"         VARCHAR(5) NOT NULL DEFAULT 'texto',
    "motor"          VARCHAR(40) NOT NULL,
    -- Lo que entendio la IA ya validado: metricas, agrupaciones, filtros, orden, limite.
    "interpretacion" JSONB,
    "titulo"         VARCHAR(150),
    "estado"         VARCHAR(12) NOT NULL,
    "filas"          INTEGER NOT NULL DEFAULT 0,
    "favorita"       BOOLEAN NOT NULL DEFAULT FALSE,
    "fecha"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "chk_reporte_origen" CHECK ("origen" IN ('texto', 'voz')),
    CONSTRAINT "chk_reporte_estado" CHECK ("estado" IN ('Generado', 'SinDatos', 'Aclaracion', 'Rechazado'))
);
CREATE INDEX IF NOT EXISTS "idx_reporte_solicitud_usuario" ON "reporte_solicitud" ("idTenant", "idUsuario", "fecha");

CREATE TABLE IF NOT EXISTS "reporte_exportacion" (
    "idExportacion" BIGSERIAL PRIMARY KEY,
    "idTenant"      INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "idUsuario"     INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    "titulo"        VARCHAR(150) NOT NULL,
    "formato"       VARCHAR(5) NOT NULL,
    "estado"        VARCHAR(12) NOT NULL DEFAULT 'EnProceso',
    "filas"         INTEGER NOT NULL DEFAULT 0,
    "nombreArchivo" VARCHAR(160),
    "archivo"       BYTEA,
    "error"         VARCHAR(255),
    "fecha"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "chk_exportacion_formato" CHECK ("formato" IN ('pdf', 'xlsx')),
    CONSTRAINT "chk_exportacion_estado" CHECK ("estado" IN ('EnProceso', 'Lista', 'Fallida'))
);
CREATE INDEX IF NOT EXISTS "idx_exportacion_usuario" ON "reporte_exportacion" ("idTenant", "idUsuario", "fecha");

-- ---------------------------------------------------------------------------
-- 5. Modelos de Machine Learning
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "modelo_ia" (
    "idModeloIA"      BIGSERIAL PRIMARY KEY,
    "idTenant"        INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "tipo"            VARCHAR(20) NOT NULL,
    "version"         INTEGER NOT NULL,
    "estado"          VARCHAR(12) NOT NULL,
    "algoritmo"       VARCHAR(60),
    "metricas"        JSONB NOT NULL DEFAULT '{}'::jsonb,
    "cumpleUmbral"    BOOLEAN NOT NULL DEFAULT FALSE,
    "filasReales"     INTEGER NOT NULL DEFAULT 0,
    "filasSinteticas" INTEGER NOT NULL DEFAULT 0,
    -- Variables usadas y parametros de los datos sinteticos.
    "parametros"      JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Lo que usa el dashboard (CU30): predicciones, segmentos o anomalias.
    "resultados"      JSONB NOT NULL DEFAULT '{}'::jsonb,
    "error"           VARCHAR(500),
    "fechaEntrenamiento" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "fechaPublicacion"   TIMESTAMPTZ,
    "idUsuario"       INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_modelo_tipo" CHECK ("tipo" IN ('demanda', 'devolucion', 'segmentacion', 'anomalias')),
    CONSTRAINT "chk_modelo_estado" CHECK ("estado" IN ('Entrenado', 'Publicado', 'Retirado', 'Fallido')),
    CONSTRAINT "uq_modelo_version" UNIQUE ("idTenant", "tipo", "version")
);
-- Una sola version publicada por tipo y empresa.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_modelo_publicado" ON "modelo_ia" ("idTenant", "tipo") WHERE "estado" = 'Publicado';

-- ---------------------------------------------------------------------------
-- 6. Avisos y permisos
-- ---------------------------------------------------------------------------
ALTER TABLE "notificacion" DROP CONSTRAINT IF EXISTS "chk_notificacion_tipo";
ALTER TABLE "notificacion" ADD CONSTRAINT "chk_notificacion_tipo" CHECK ("tipo" IN (
    'envio', 'reembolso', 'devolucion', 'venta_sin_conexion', 'sincronizacion', 'reserva',
    'suscripcion', 'reporte', 'caja'));

INSERT INTO "permiso" ("nombrePermiso")
SELECT p.nombre
FROM (VALUES ('reporte.ia'), ('ia.modelos')) AS p(nombre)
WHERE NOT EXISTS (SELECT 1 FROM "permiso" WHERE "nombrePermiso" = p.nombre);

-- El Encargado de sucursal es actor de CU26, CU27, CU28 y CU30: ve los reportes
-- de SUS sucursales (el backend recorta el resto).
INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT r."codigoRol", pe."idPermiso"
FROM (
    VALUES
        ('Administrador', 'reporte.ia'),
        ('Administrador', 'ia.modelos'),
        ('Encargado de Sucursal', 'reporte.ia'),
        ('Encargado de Sucursal', 'reporte.ver')
) AS d(rol, permiso)
JOIN "rol" r ON r."nombreRol" = d.rol
JOIN "permiso" pe ON pe."nombrePermiso" = d.permiso
WHERE NOT EXISTS (
    SELECT 1 FROM "asignacion_permiso" a
    WHERE a."codigoRol" = r."codigoRol" AND a."idPermiso" = pe."idPermiso"
);
