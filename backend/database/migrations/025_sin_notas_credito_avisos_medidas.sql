-- 025_sin_notas_credito_avisos_medidas.sql
-- Correcciones de la ingeniera (segunda revision):
--
--   1. YA NO HAY NOTAS DE CREDITO. Si al cliente le sobra plata en un cambio o
--      devolucion, SIEMPRE se le devuelve en dinero y se le entrega una
--      "Nota de devolucion" (el comprobante del reembolso, CU7). Se borran las
--      tablas nota_credito y nota_credito_movimiento y las columnas que las usaban.
--   2. AVISOS "TIPO PUSH O CORREO": tabla "notificacion" (bandeja en la web y la
--      app movil + correo). Ej.: "Su prenda sera enviada el viernes 06/11",
--      "Le devolvemos Bs 120 de su compra sin conexion".
--   3. DISTINCION ENTRE TALLAS: medidas reales en cm de cada prenda (pecho,
--      largo, cintura) para decir si una "L" es mas grande o mas chica que otra.
--
-- ATENCION: el punto 1 BORRA los datos de las notas de credito (no se puede
-- deshacer). Los casos que eran "nota_credito" quedan como "devolucion".
--
-- Corre igual en el SQL Editor de Supabase (sentencia por sentencia) y en psql,
-- y es re-ejecutable.

-- ---------------------------------------------------------------------------
-- 1. Quitar las notas de credito
-- ---------------------------------------------------------------------------

-- Los casos viejos resueltos con nota de credito pasan a ser "devolucion".
UPDATE "devolucion" SET "tipo" = 'devolucion' WHERE "tipo" = 'nota_credito';
UPDATE "devolucion" SET "metodoReembolso" = 'efectivo' WHERE "metodoReembolso" = 'nota_credito';

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_tipo";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_tipo" CHECK ("tipo" IN (
    'cambio_talla', 'cambio_color', 'cambio_medida', 'cambio_producto', 'devolucion'));

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_reembolso";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_reembolso" CHECK (
    ("metodoReembolso" IS NULL OR "metodoReembolso" IN ('efectivo', 'qr', 'tarjeta'))
    AND ("estadoReembolso" IS NULL OR "estadoReembolso" IN ('Completado', 'EnProceso', 'Pendiente', 'TransferenciaPendiente')));

ALTER TABLE "devolucion" DROP COLUMN IF EXISTS "idNotaCredito";

DROP TABLE IF EXISTS "nota_credito_movimiento";
DROP TABLE IF EXISTS "nota_credito";

-- La politica ya no elige "nota o dinero" ni la vigencia de las notas.
ALTER TABLE "politica_devolucion" DROP CONSTRAINT IF EXISTS "chk_politica_saldo";
ALTER TABLE "politica_devolucion" DROP CONSTRAINT IF EXISTS "chk_politica_positivos";
ALTER TABLE "politica_devolucion" DROP COLUMN IF EXISTS "saldoAFavor";
ALTER TABLE "politica_devolucion" DROP COLUMN IF EXISTS "vigenciaNotaCreditoDias";
ALTER TABLE "politica_devolucion" ADD CONSTRAINT "chk_politica_positivos" CHECK (
    "maxCambiosPorPrenda" >= 1 AND "umbralAutorizacion" >= 0
    AND "maxDevolucionesMes" >= 1 AND "diasEntregaEnLinea" BETWEEN 1 AND 60 AND "diasRetiroCambio" BETWEEN 1 AND 60
    AND "costoAjusteMedida" >= 0);

-- ---------------------------------------------------------------------------
-- 2. Avisos al cliente y al personal (bandeja + correo)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "notificacion" (
    "idNotificacion" BIGSERIAL PRIMARY KEY,
    "idUser"         INTEGER NOT NULL REFERENCES "Usuario"("idUser") ON DELETE CASCADE ON UPDATE CASCADE,
    "idTenant"       INTEGER REFERENCES "tenant"("idTenant") ON UPDATE CASCADE,
    "tipo"           VARCHAR(20)  NOT NULL,
    "titulo"         VARCHAR(150) NOT NULL,
    "mensaje"        VARCHAR(600) NOT NULL,
    "referencia"     VARCHAR(40),
    "leida"          BOOLEAN NOT NULL DEFAULT FALSE,
    "porCorreo"      BOOLEAN NOT NULL DEFAULT TRUE,
    "correoEnviado"  BOOLEAN NOT NULL DEFAULT FALSE,
    "fecha"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "chk_notificacion_tipo" CHECK ("tipo" IN ('envio', 'reembolso', 'devolucion', 'venta_sin_conexion'))
);
CREATE INDEX IF NOT EXISTS "idx_notificacion_usuario" ON "notificacion" ("idUser", "fecha");

-- ---------------------------------------------------------------------------
-- 3. Medidas reales de cada prenda (cm)
-- ---------------------------------------------------------------------------

ALTER TABLE "producto" ADD COLUMN IF NOT EXISTS "medidaPechoCm"   INTEGER;
ALTER TABLE "producto" ADD COLUMN IF NOT EXISTS "medidaLargoCm"   INTEGER;
ALTER TABLE "producto" ADD COLUMN IF NOT EXISTS "medidaCinturaCm" INTEGER;

-- Medidas de ejemplo para el catalogo actual (solo donde todavia no hay datos).
-- Poleras OVERSIZE: son mas anchas que una polera comun de la misma talla.
UPDATE "producto" SET
    "medidaPechoCm" = CASE "talla" WHEN 'S' THEN 112 WHEN 'M' THEN 118 WHEN 'L' THEN 124 WHEN 'XL' THEN 130 END,
    "medidaLargoCm" = CASE "talla" WHEN 'S' THEN 70  WHEN 'M' THEN 72  WHEN 'L' THEN 74  WHEN 'XL' THEN 76  END
WHERE "tipo" = 'Polera Oversize' AND "talla" IN ('S', 'M', 'L', 'XL') AND "medidaPechoCm" IS NULL;

-- Jeans: la talla es la cintura en pulgadas; en cm queda pulgadas x 2.54.
UPDATE "producto" SET
    "medidaCinturaCm" = ROUND(CAST("talla" AS NUMERIC) * 2.54),
    "medidaLargoCm"   = 104
WHERE "tipo" = 'Jeans' AND "talla" IN ('28', '30', '32', '34', '36') AND "medidaCinturaCm" IS NULL;
