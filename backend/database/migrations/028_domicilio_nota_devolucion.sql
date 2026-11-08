-- 028_domicilio_nota_devolucion.sql
-- [CU31] Recoger a domicilio la prenda devuelta
-- [CU32] Entregar a domicilio la prenda del cambio
-- [CU7]  Emitir nota de devolucion (sin restos de las notas de credito)
--
--   1. Devolucion: como entrega el cliente la prenda y recibe la nueva ("sucursal" o
--      "domicilio"), el costo del delivery y el estado "EnvioDomicilio" (la prenda
--      nueva va en camino; el caso se completa cuando el repartidor la entrega).
--   2. Politica: si la empresa ofrece delivery y cuanto cuesta cada viaje.
--   3. Tabla entrega_domicilio: cada viaje del repartidor (un recojo o una entrega).
--   4. El pago de la venta de un cambio por otro producto ya no se llama "credito":
--      es el valor de la prenda devuelta.
--
-- Corre igual en el SQL Editor de Supabase y en psql, y es re-ejecutable.

-- ---------------------------------------------------------------------------
-- 1. Devolucion
-- ---------------------------------------------------------------------------
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "modalidadEntrega" VARCHAR(10) NOT NULL DEFAULT 'sucursal';
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "costoDomicilio" NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_modalidad";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_modalidad" CHECK ("modalidadEntrega" IN ('sucursal', 'domicilio'));
ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_costo_domicilio";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_costo_domicilio" CHECK ("costoDomicilio" >= 0);

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_estado";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_estado" CHECK ("estado" IN (
    'PendienteEntrega', 'EnInspeccion', 'EnRevision', 'Aprobada', 'CambioPendiente', 'EnvioDomicilio',
    'Completada', 'Rechazada', 'Anulada', 'Cancelada'));

-- ---------------------------------------------------------------------------
-- 2. Politica de devoluciones
-- ---------------------------------------------------------------------------
ALTER TABLE "politica_devolucion" ADD COLUMN IF NOT EXISTS "permiteDomicilio" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "politica_devolucion" ADD COLUMN IF NOT EXISTS "costoDomicilio" NUMERIC(12, 2) NOT NULL DEFAULT 15.00;
ALTER TABLE "politica_devolucion" DROP CONSTRAINT IF EXISTS "chk_politica_costo_domicilio";
ALTER TABLE "politica_devolucion" ADD CONSTRAINT "chk_politica_costo_domicilio" CHECK ("costoDomicilio" >= 0);

-- ---------------------------------------------------------------------------
-- 3. Viajes del repartidor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "entrega_domicilio" (
    "idEntrega"         BIGSERIAL PRIMARY KEY,
    "idDevolucion"      BIGINT        NOT NULL,
    "idTenant"          INTEGER       NOT NULL,
    "tipo"              VARCHAR(10)   NOT NULL,              -- recojo | entrega
    "estado"            VARCHAR(12)   NOT NULL DEFAULT 'Solicitado',
    "codigoSucursal"    INTEGER,                              -- de donde sale / a donde vuelve el repartidor
    "direccion"         VARCHAR(255)  NOT NULL,
    "referencia"        VARCHAR(255),
    "telefono"          VARCHAR(20)   NOT NULL,
    "fechaPreferida"    DATE,
    "franja"            VARCHAR(10),                          -- manana | tarde
    "fechaProgramada"   DATE,
    "repartidor"        VARCHAR(100),
    "costo"             NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "intentos"          INTEGER       NOT NULL DEFAULT 0,
    "observaciones"     VARCHAR(255),
    "fechaRegistro"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    "fechaCompletado"   TIMESTAMPTZ,
    "idUsuario"         INTEGER,                              -- quien programo o cerro el viaje
    CONSTRAINT "fk_entrega_devolucion" FOREIGN KEY ("idDevolucion") REFERENCES "devolucion"("idDevolucion") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_entrega_tenant"     FOREIGN KEY ("idTenant") REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_entrega_sucursal"   FOREIGN KEY ("codigoSucursal") REFERENCES "Sucursal"("codigoSucursal") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fk_entrega_usuario"    FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_entrega_tipo"      CHECK ("tipo" IN ('recojo', 'entrega')),
    CONSTRAINT "chk_entrega_estado"    CHECK ("estado" IN ('Solicitado', 'Programado', 'Completado', 'Fallido', 'Cancelado')),
    CONSTRAINT "chk_entrega_franja"    CHECK ("franja" IS NULL OR "franja" IN ('manana', 'tarde')),
    CONSTRAINT "chk_entrega_costo"     CHECK ("costo" >= 0)
);
CREATE INDEX IF NOT EXISTS "idx_entrega_tenant_estado" ON "entrega_domicilio" ("idTenant", "estado", "fechaProgramada");
CREATE INDEX IF NOT EXISTS "idx_entrega_devolucion" ON "entrega_domicilio" ("idDevolucion");

-- ---------------------------------------------------------------------------
-- 4. Sin "credito": el pago de la venta de cambio es el valor de la prenda devuelta
-- ---------------------------------------------------------------------------
UPDATE "metodo_pago"
SET "origen" = 'prenda_devuelta',
    "tipo"   = regexp_replace("tipo", '^Credito por devolucion', 'Valor de prenda devuelta')
WHERE "origen" = 'credito_devolucion';
