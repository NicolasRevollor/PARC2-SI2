-- 026_caja_operacion_sin_conexion.sql
-- [CU12] a [CU20]: operacion sin conexion, sincronizacion, conflictos y caja.
--
--   1. "caja" y "movimiento_caja" (CU20): apertura, arqueo y cierre; cada
--      ingreso o egreso en efectivo es una fila.
--   2. "conflicto_sincronizacion" (CU18): operaciones sin conexion que el
--      servidor no pudo confirmar. No tocan stock ni ventas hasta resolverse.
--   3. "configuracion_operacion" (CU13, CU14, CU18, CU20): tiempos y umbrales
--      por empresa.
--   4. "devolucion" lleva UUID (CU19), "Venta" el descuento autorizado (CU18),
--      "Cliente" el CI (CU14) y "suscripcion" la fecha de suspension (CU17).
--   5. "registro_sincronizacion" admite el resultado "Conflicto", los tipos
--      nuevos y la sucursal (RNF10).
--   6. Permisos caja.operar, caja.aprobar y sync.resolver.
--
-- Corre igual en el SQL Editor de Supabase y en psql, y es re-ejecutable.

-- ---------------------------------------------------------------------------
-- 1. Caja (CU20)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "caja" (
    "idCaja"            BIGSERIAL PRIMARY KEY,
    "uuidOperacion"     UUID NOT NULL DEFAULT gen_random_uuid(),
    "origenRegistro"    VARCHAR(12) NOT NULL DEFAULT 'en_linea',
    "codigoSucursal"    INTEGER NOT NULL REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,
    "idTenant"          INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "idUsuarioApertura" INTEGER NOT NULL REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,
    "montoInicial"      NUMERIC(12,2) NOT NULL,
    "fechaApertura"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "idUsuarioCierre"   INTEGER REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,
    "fechaCierre"       TIMESTAMPTZ,
    "efectivoContado"   NUMERIC(12,2),
    "montoEsperado"     NUMERIC(12,2),
    "diferencia"        NUMERIC(12,2),
    "justificacion"     VARCHAR(255),
    "estado"            VARCHAR(20) NOT NULL DEFAULT 'Abierta',
    "idAprobador"       INTEGER REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,
    "fechaAprobacion"   TIMESTAMPTZ,
    -- UUID de las operaciones del dia que faltaba confirmar al cerrar.
    "operacionesPendientes" JSONB NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT "chk_caja_estado" CHECK ("estado" IN ('Abierta', 'CierreProvisional', 'PendienteAprobacion', 'Cerrada')),
    CONSTRAINT "chk_caja_origen" CHECK ("origenRegistro" IN ('en_linea', 'sin_conexion')),
    CONSTRAINT "chk_caja_monto" CHECK ("montoInicial" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_caja_uuid" ON "caja" ("uuidOperacion");
-- Una sola caja abierta por sucursal (CU20 flujo alternativo 3).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_caja_abierta_sucursal" ON "caja" ("codigoSucursal") WHERE "estado" = 'Abierta';
CREATE INDEX IF NOT EXISTS "idx_caja_tenant_fecha" ON "caja" ("idTenant", "fechaApertura");

CREATE TABLE IF NOT EXISTS "movimiento_caja" (
    "idMovimientoCaja" BIGSERIAL PRIMARY KEY,
    "idCaja"           BIGINT NOT NULL REFERENCES "caja"("idCaja") ON DELETE CASCADE ON UPDATE CASCADE,
    "tipo"             VARCHAR(8) NOT NULL,
    "concepto"         VARCHAR(24) NOT NULL,
    "monto"            NUMERIC(12,2) NOT NULL,
    "referencia"       VARCHAR(60),
    "uuidOperacion"    UUID,
    "fecha"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "idUsuario"        INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_mov_caja_tipo" CHECK ("tipo" IN ('ingreso', 'egreso')),
    CONSTRAINT "chk_mov_caja_monto" CHECK ("monto" > 0)
);
CREATE INDEX IF NOT EXISTS "idx_mov_caja" ON "movimiento_caja" ("idCaja", "fecha");
-- Reenviar una operacion no duplica su movimiento en caja (RNF05).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_mov_caja_uuid" ON "movimiento_caja" ("uuidOperacion", "concepto") WHERE "uuidOperacion" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Conflictos de sincronizacion (CU18)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "conflicto_sincronizacion" (
    "idConflicto"      BIGSERIAL PRIMARY KEY,
    "uuidOperacion"    UUID NOT NULL,
    "tipoOperacion"    VARCHAR(12) NOT NULL,
    "tipoConflicto"    VARCHAR(30) NOT NULL,
    "motivo"           VARCHAR(255) NOT NULL,
    -- Lo que se registro en el dispositivo y lo que dice el servidor (CU18 paso 3).
    "datosDispositivo" JSONB NOT NULL,
    "datosServidor"    JSONB NOT NULL DEFAULT '{}'::jsonb,
    "monto"            NUMERIC(12,2) NOT NULL DEFAULT 0,
    "estado"           VARCHAR(10) NOT NULL DEFAULT 'Pendiente',
    "resultado"        VARCHAR(12),
    "decision"         VARCHAR(30),
    "observaciones"    VARCHAR(255),
    "alertaDiscrepancia" BOOLEAN NOT NULL DEFAULT FALSE,
    "idReferencia"     INTEGER,
    "codigoSucursal"   INTEGER REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,
    "idUsuario"        INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    "idTenant"         INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "fechaOperacion"   TIMESTAMPTZ,
    "fechaRegistro"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "idResolvio"       INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    "fechaResolucion"  TIMESTAMPTZ,
    CONSTRAINT "chk_conflicto_estado" CHECK ("estado" IN ('Pendiente', 'Resuelto')),
    CONSTRAINT "chk_conflicto_resultado" CHECK ("resultado" IS NULL OR "resultado" IN ('Confirmada', 'Anulada'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_conflicto_uuid" ON "conflicto_sincronizacion" ("uuidOperacion");
CREATE INDEX IF NOT EXISTS "idx_conflicto_tenant" ON "conflicto_sincronizacion" ("idTenant", "estado", "fechaRegistro");

-- ---------------------------------------------------------------------------
-- 3. Configuracion de la operacion por empresa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "configuracion_operacion" (
    "idTenant"               INTEGER PRIMARY KEY REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "horasDatosVigentes"     INTEGER NOT NULL DEFAULT 24,
    "horasSesionSinConexion" INTEGER NOT NULL DEFAULT 12,
    "permiteVentaSinStock"   BOOLEAN NOT NULL DEFAULT FALSE,
    "umbralDiferenciaCaja"   NUMERIC(12,2) NOT NULL DEFAULT 50,
    "umbralConflicto"        NUMERIC(12,2) NOT NULL DEFAULT 1000,
    "horasRetiroReserva"     INTEGER NOT NULL DEFAULT 48,
    CONSTRAINT "chk_config_horas" CHECK ("horasDatosVigentes" > 0 AND "horasSesionSinConexion" > 0 AND "horasRetiroReserva" > 0),
    CONSTRAINT "chk_config_umbrales" CHECK ("umbralDiferenciaCaja" >= 0 AND "umbralConflicto" >= 0)
);

-- ---------------------------------------------------------------------------
-- 4. Columnas nuevas
-- ---------------------------------------------------------------------------
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "ci" VARCHAR(20);
CREATE INDEX IF NOT EXISTS "idx_cliente_ci" ON "Cliente" ("ci");

ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "descuentoAutorizado" NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "uuidOperacion" UUID;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "origenRegistro" VARCHAR(12) NOT NULL DEFAULT 'en_linea';
CREATE UNIQUE INDEX IF NOT EXISTS "uq_devolucion_uuid" ON "devolucion" ("uuidOperacion") WHERE "uuidOperacion" IS NOT NULL;

ALTER TABLE "suscripcion" ADD COLUMN IF NOT EXISTS "fechaSuspension" TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 5. Log de sincronizacion (RNF10)
-- ---------------------------------------------------------------------------
ALTER TABLE "registro_sincronizacion" ADD COLUMN IF NOT EXISTS "codigoSucursal" INTEGER;
ALTER TABLE "registro_sincronizacion" ALTER COLUMN "tipoOperacion" TYPE VARCHAR(20);
ALTER TABLE "registro_sincronizacion" DROP CONSTRAINT IF EXISTS "chk_registro_sync_tipo";
ALTER TABLE "registro_sincronizacion" ADD CONSTRAINT "chk_registro_sync_tipo" CHECK ("tipoOperacion" IN (
    'venta', 'reserva', 'devolucion', 'cancelar_reserva', 'cambio', 'custodia', 'caja_apertura', 'caja_cierre'));
ALTER TABLE "registro_sincronizacion" DROP CONSTRAINT IF EXISTS "chk_registro_sync_resultado";
ALTER TABLE "registro_sincronizacion" ADD CONSTRAINT "chk_registro_sync_resultado" CHECK (
    "resultado" IN ('Aplicada', 'Duplicada', 'Rechazada', 'Conflicto'));

-- Avisos nuevos: conflictos y discrepancias (sincronizacion) y reservas reasignadas.
ALTER TABLE "notificacion" DROP CONSTRAINT IF EXISTS "chk_notificacion_tipo";
ALTER TABLE "notificacion" ADD CONSTRAINT "chk_notificacion_tipo" CHECK ("tipo" IN (
    'envio', 'reembolso', 'devolucion', 'venta_sin_conexion', 'sincronizacion', 'reserva'));

-- ---------------------------------------------------------------------------
-- 6. Permisos
-- ---------------------------------------------------------------------------
INSERT INTO "permiso" ("nombrePermiso")
SELECT p.nombre
FROM (VALUES ('caja.operar'), ('caja.aprobar'), ('sync.resolver')) AS p(nombre)
WHERE NOT EXISTS (SELECT 1 FROM "permiso" WHERE "nombrePermiso" = p.nombre);

-- El Encargado tambien atiende (CU15, CU19, CU20): necesita registrar ventas y reservas.
INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT r."codigoRol", pe."idPermiso"
FROM (
    VALUES
        ('Administrador', 'caja.operar'),
        ('Administrador', 'caja.aprobar'),
        ('Administrador', 'sync.resolver'),
        ('Encargado de Sucursal', 'caja.operar'),
        ('Encargado de Sucursal', 'caja.aprobar'),
        ('Encargado de Sucursal', 'sync.resolver'),
        ('Encargado de Sucursal', 'reserva.crear'),
        ('Encargado de Sucursal', 'venta.crear'),
        ('Cajero', 'caja.operar')
) AS d(rol, permiso)
JOIN "rol" r ON r."nombreRol" = d.rol
JOIN "permiso" pe ON pe."nombrePermiso" = d.permiso
WHERE NOT EXISTS (
    SELECT 1 FROM "asignacion_permiso" a
    WHERE a."codigoRol" = r."codigoRol" AND a."idPermiso" = pe."idPermiso"
);
