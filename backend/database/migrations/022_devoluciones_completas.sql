-- 022_devoluciones_completas.sql
-- Modulo de devoluciones y cambios segun la especificacion del documento del
-- segundo parcial (docs/iconix/2do parcial SI2.md, CU1 a CU11). Extiende la
-- devolucion/cambio de 24 h de la migracion 015 sin romperla.
--
--   CU1  Solicitud en tienda: queda "EnInspeccion" con codigo unico, motivo
--        tipificado y la resolucion que pide el cliente.
--   CU2  Solicitud desde la tienda en linea: "PendienteEntrega", con codigo
--        (QR), fecha limite de entrega y la variante pedida apartada.
--   CU3  Inspeccion: resultado (apta / defecto de fabrica / deteriorada /
--        no corresponde), lista de verificacion, codigo escaneado, fotos,
--        aprobacion parcial y revision del Administrador si hay disconformidad.
--   CU4  Cambio de talla, color o medida, con diferencia de precio.
--   CU5  Cambio por otro producto: nueva venta enlazada a la devolucion.
--   CU6  Reembolso por el mismo medio de pago, con estado del reembolso.
--   CU7  Notas de credito con sus movimientos (emision, consumo, reintegro,
--        anulacion, extension).
--   CU8  Cambio sin stock: traslado, atencion en otra sucursal o lista de
--        espera ("CambioPendiente"), con la variante apartada.
--   CU9  Politica de devoluciones VERSIONADA por empresa: cada venta usa la
--        version vigente cuando se hizo; sin version rige la de la plataforma.
--   CU10 Inventario por devolucion: lo apto vuelve a la venta; lo defectuoso o
--        deteriorado va al inventario no vendible (con reclamo al proveedor).
--   CU11 Historial: todo queda en la fila del caso.
--
-- Corre igual en el SQL Editor de Supabase (sentencia por sentencia) y en
-- psql, y es re-ejecutable: IF NOT EXISTS, DROP CONSTRAINT IF EXISTS antes de
-- cada ADD CONSTRAINT y datos de ejemplo protegidos por guardas.

-- ---------------------------------------------------------------------------
-- CU9: politica de devoluciones, una fila por version
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "politica_devolucion" (
    "idPolitica"              BIGSERIAL PRIMARY KEY,
    "idTenant"                INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON DELETE CASCADE ON UPDATE CASCADE,
    "version"                 INTEGER NOT NULL,
    "vigenteDesde"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "plazoCambioHoras"        INTEGER NOT NULL DEFAULT 24,
    "plazoGarantiaDias"       INTEGER NOT NULL DEFAULT 30,
    "accionFueraPlazo"        VARCHAR(10) NOT NULL DEFAULT 'rechazar',
    "recargoTipo"             VARCHAR(10) NOT NULL DEFAULT 'porcentaje',
    "recargoValor"            NUMERIC(12,2) NOT NULL DEFAULT 5,
    "recargoUnidad"           VARCHAR(5) NOT NULL DEFAULT 'dia',
    "categoriasNoRetornables" TEXT[] NOT NULL DEFAULT '{}',
    "maxCambiosPorPrenda"     INTEGER NOT NULL DEFAULT 2,
    "saldoAFavor"             VARCHAR(15) NOT NULL DEFAULT 'cliente_elige',
    "permiteReembolso"        BOOLEAN NOT NULL DEFAULT TRUE,
    "vigenciaNotaCreditoDias" INTEGER NOT NULL DEFAULT 90,
    "respetarPrecioOriginal"  BOOLEAN NOT NULL DEFAULT TRUE,
    "umbralAutorizacion"      NUMERIC(12,2) NOT NULL DEFAULT 500,
    "maxDevolucionesMes"      INTEGER NOT NULL DEFAULT 3,
    "accionDeterioro"         VARCHAR(10) NOT NULL DEFAULT 'rechazar',
    "descuentoDeterioroPct"   NUMERIC(5,2) NOT NULL DEFAULT 30,
    "permiteSolicitudEnLinea" BOOLEAN NOT NULL DEFAULT TRUE,
    "diasEntregaEnLinea"      INTEGER NOT NULL DEFAULT 3,
    "diasRetiroCambio"        INTEGER NOT NULL DEFAULT 7,
    "costoAjusteMedida"       NUMERIC(12,2) NOT NULL DEFAULT 20,
    "condiciones"             VARCHAR(1000) NOT NULL DEFAULT
        'La prenda debe estar sin uso, limpia, con sus etiquetas y se presenta con el comprobante de compra. Una prenda con defecto de fabrica siempre se acepta dentro del plazo de garantia.',
    "creadoEn"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "idUsuario"               INTEGER REFERENCES "Usuario"("idUser") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "uq_politica_version" UNIQUE ("idTenant", "version"),
    CONSTRAINT "chk_politica_plazo" CHECK ("plazoCambioHoras" BETWEEN 1 AND 720),
    -- El plazo de garantia no puede ser menor que el plazo de cambio.
    CONSTRAINT "chk_politica_garantia" CHECK ("plazoGarantiaDias" * 24 >= "plazoCambioHoras" AND "plazoGarantiaDias" <= 730),
    CONSTRAINT "chk_politica_fuera_plazo" CHECK ("accionFueraPlazo" IN ('rechazar', 'recargo')),
    CONSTRAINT "chk_politica_recargo" CHECK (
        "recargoTipo" IN ('porcentaje', 'monto') AND "recargoUnidad" IN ('hora', 'dia') AND "recargoValor" >= 0),
    CONSTRAINT "chk_politica_saldo" CHECK ("saldoAFavor" IN ('reembolso', 'nota_credito', 'cliente_elige')),
    CONSTRAINT "chk_politica_deterioro" CHECK (
        "accionDeterioro" IN ('rechazar', 'descuento') AND "descuentoDeterioroPct" BETWEEN 0 AND 100),
    CONSTRAINT "chk_politica_positivos" CHECK (
        "maxCambiosPorPrenda" >= 1 AND "vigenciaNotaCreditoDias" BETWEEN 1 AND 730 AND "umbralAutorizacion" >= 0
        AND "maxDevolucionesMes" >= 1 AND "diasEntregaEnLinea" BETWEEN 1 AND 60 AND "diasRetiroCambio" BETWEEN 1 AND 60
        AND "costoAjusteMedida" >= 0)
);
CREATE INDEX IF NOT EXISTS "idx_politica_tenant_vigencia" ON "politica_devolucion" ("idTenant", "vigenteDesde");

-- ---------------------------------------------------------------------------
-- CU7: notas de credito y sus movimientos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "nota_credito" (
    "idNotaCredito"    BIGSERIAL PRIMARY KEY,
    "codigo"           VARCHAR(20) NOT NULL UNIQUE,
    "monto"            NUMERIC(12,2) NOT NULL,
    "saldo"            NUMERIC(12,2) NOT NULL,
    "estado"           VARCHAR(12) NOT NULL DEFAULT 'Vigente',
    "fechaEmision"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "fechaVencimiento" TIMESTAMPTZ NOT NULL,
    "motivo"           VARCHAR(255),
    "motivoAnulacion"  VARCHAR(255),
    "idCliente"        INTEGER NOT NULL REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,
    "idDevolucion"     BIGINT REFERENCES "devolucion"("idDevolucion") ON DELETE SET NULL ON UPDATE CASCADE,
    "idUsuario"        INTEGER NOT NULL REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,
    "idTenant"         INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON UPDATE CASCADE,
    CONSTRAINT "chk_nota_monto" CHECK ("monto" > 0),
    CONSTRAINT "chk_nota_saldo" CHECK ("saldo" >= 0 AND "saldo" <= "monto"),
    -- "Vencida" no se guarda: se deduce de fechaVencimiento al leerla.
    CONSTRAINT "chk_nota_estado" CHECK ("estado" IN ('Vigente', 'Usada', 'Anulada'))
);
CREATE INDEX IF NOT EXISTS "idx_nota_credito_cliente" ON "nota_credito" ("idCliente");
CREATE INDEX IF NOT EXISTS "idx_nota_credito_tenant" ON "nota_credito" ("idTenant", "fechaEmision");

CREATE TABLE IF NOT EXISTS "nota_credito_movimiento" (
    "idMovimiento"      BIGSERIAL PRIMARY KEY,
    "idNotaCredito"     BIGINT NOT NULL REFERENCES "nota_credito"("idNotaCredito") ON DELETE CASCADE ON UPDATE CASCADE,
    "tipo"              VARCHAR(12) NOT NULL,
    "monto"             NUMERIC(12,2) NOT NULL DEFAULT 0,
    "saldoResultante"   NUMERIC(12,2) NOT NULL,
    -- Canje parcial: el resto de la venta se cobra con otro medio.
    "montoComplemento"  NUMERIC(12,2) NOT NULL DEFAULT 0,
    "metodoComplemento" VARCHAR(12),
    "idMetPago"         INTEGER REFERENCES "metodo_pago"("idMetPago") ON UPDATE CASCADE,
    "idDevolucion"      BIGINT REFERENCES "devolucion"("idDevolucion") ON DELETE SET NULL ON UPDATE CASCADE,
    "detalle"           VARCHAR(255),
    "fecha"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "idUsuario"         INTEGER NOT NULL REFERENCES "Usuario"("idUser") ON UPDATE CASCADE,
    CONSTRAINT "chk_nota_mov_tipo" CHECK ("tipo" IN ('emision', 'consumo', 'reintegro', 'anulacion', 'extension')),
    CONSTRAINT "chk_nota_mov_montos" CHECK ("monto" >= 0 AND "montoComplemento" >= 0 AND "saldoResultante" >= 0)
);
CREATE INDEX IF NOT EXISTS "idx_nota_mov_nota" ON "nota_credito_movimiento" ("idNotaCredito", "fecha");
CREATE INDEX IF NOT EXISTS "idx_nota_mov_pago" ON "nota_credito_movimiento" ("idMetPago");

-- ---------------------------------------------------------------------------
-- CU1 a CU8: columnas nuevas del caso de devolucion
-- ---------------------------------------------------------------------------
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "codigo" VARCHAR(20);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "origen" VARCHAR(10) NOT NULL DEFAULT 'tienda';
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "motivoCategoria" VARCHAR(12);
-- Precio efectivamente pagado por unidad (snapshot, como "fechaVenta").
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "precioPagado" NUMERIC(12,2);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "idPolitica" BIGINT REFERENCES "politica_devolucion"("idPolitica") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "recargo" NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "requiereAutorizacion" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "motivoAutorizacion" VARCHAR(255);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "idAutorizador" INTEGER REFERENCES "Usuario"("idUser") ON UPDATE CASCADE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "fechaAutorizacion" TIMESTAMPTZ;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "fechaLimiteEntrega" TIMESTAMPTZ;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "fotos" TEXT[] NOT NULL DEFAULT '{}';
-- CU3
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "condicion" VARCHAR(15);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "checklist" JSONB;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "codigoEscaneado" VARCHAR(40);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "notasInspeccion" VARCHAR(255);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "idInspector" INTEGER REFERENCES "Usuario"("idUser") ON UPDATE CASCADE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "fechaInspeccion" TIMESTAMPTZ;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "descuentoDeterioro" NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "motivoRechazo" VARCHAR(255);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "destinoInventario" VARCHAR(12);
-- CU4 / CU5 / CU8
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "diferencia" NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "idMetPagoDiferencia" INTEGER REFERENCES "metodo_pago"("idMetPago") ON UPDATE CASCADE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "idVentaCambio" INTEGER REFERENCES "Venta"("idVenta") ON UPDATE CASCADE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "fechaEntregaAjuste" DATE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "sucursalEntrega" INTEGER REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "idInvReservado" INTEGER REFERENCES "Inventario"("idInv") ON UPDATE CASCADE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "opcionSinStock" VARCHAR(14);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "fechaLlegadaEstimada" TIMESTAMPTZ;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "fechaLimiteRetiro" TIMESTAMPTZ;
-- CU6 / CU7
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "metodoReembolso" VARCHAR(12);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "estadoReembolso" VARCHAR(22);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "referenciaReembolso" VARCHAR(150);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "cuentaDestino" VARCHAR(120);
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "idNotaCredito" BIGINT REFERENCES "nota_credito"("idNotaCredito") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "devolucion" ADD COLUMN IF NOT EXISTS "fechaResolucion" TIMESTAMPTZ;

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_tipo";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_tipo" CHECK ("tipo" IN (
    'cambio_talla', 'cambio_color', 'cambio_medida', 'cambio_producto', 'devolucion', 'nota_credito'));

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_estado";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_estado" CHECK ("estado" IN (
    'PendienteEntrega', 'EnInspeccion', 'EnRevision', 'Aprobada', 'CambioPendiente',
    'Completada', 'Rechazada', 'Anulada', 'Cancelada'));

-- La variante de reemplazo se elige en la resolucion (CU4/CU5): solo un cambio
-- ya completado esta obligado a tenerla.
ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_cambio_destino";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_cambio_destino" CHECK (
    "estado" <> 'Completada' OR "tipo" NOT IN ('cambio_talla', 'cambio_color', 'cambio_producto')
    OR "idProductoNuevo" IS NOT NULL);

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_origen";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_origen" CHECK ("origen" IN ('tienda', 'en_linea'));

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_motivo";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_motivo" CHECK (
    "motivoCategoria" IS NULL OR "motivoCategoria" IN ('talla', 'medida', 'color', 'defecto', 'equivocado', 'no_desea'));

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_condicion";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_condicion" CHECK (
    "condicion" IS NULL OR "condicion" IN ('apta', 'defectuosa', 'deteriorada', 'no_corresponde'));

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_destino";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_destino" CHECK (
    "destinoInventario" IS NULL OR "destinoInventario" IN ('vendible', 'no_vendible'));

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_sin_stock";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_sin_stock" CHECK (
    "opcionSinStock" IS NULL OR "opcionSinStock" IN ('traslado', 'otra_sucursal', 'espera'));

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_reembolso";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_reembolso" CHECK (
    ("metodoReembolso" IS NULL OR "metodoReembolso" IN ('efectivo', 'qr', 'tarjeta', 'nota_credito'))
    AND ("estadoReembolso" IS NULL OR "estadoReembolso" IN ('Completado', 'EnProceso', 'Pendiente', 'TransferenciaPendiente')));

ALTER TABLE "devolucion" DROP CONSTRAINT IF EXISTS "chk_devolucion_montos";
ALTER TABLE "devolucion" ADD CONSTRAINT "chk_devolucion_montos" CHECK ("recargo" >= 0 AND "descuentoDeterioro" >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_devolucion_codigo" ON "devolucion" ("codigo");
CREATE INDEX IF NOT EXISTS "idx_devolucion_tenant_estado" ON "devolucion" ("idTenant", "estado");

-- ---------------------------------------------------------------------------
-- CU10: inventario no vendible (merma y reclamos al proveedor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "inventario_no_vendible" (
    "idNoVendible"   BIGSERIAL PRIMARY KEY,
    "codigoSucursal" INTEGER NOT NULL REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,
    "idProducto"     INTEGER NOT NULL REFERENCES "producto"("idProducto") ON UPDATE CASCADE,
    "cantidad"       INTEGER NOT NULL,
    "motivo"         VARCHAR(12) NOT NULL,
    "idDevolucion"   BIGINT REFERENCES "devolucion"("idDevolucion") ON DELETE SET NULL ON UPDATE CASCADE,
    -- Defecto de fabrica de un producto con proveedor: reclamo al proveedor.
    "idProveedor"    INTEGER REFERENCES "Proveedor"("idProveedor") ON UPDATE CASCADE,
    "estado"         VARCHAR(12) NOT NULL DEFAULT 'Pendiente',
    "observaciones"  VARCHAR(255),
    "fecha"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "idTenant"       INTEGER NOT NULL REFERENCES "tenant"("idTenant") ON UPDATE CASCADE,
    CONSTRAINT "chk_no_vendible_cantidad" CHECK ("cantidad" > 0),
    CONSTRAINT "chk_no_vendible_motivo" CHECK ("motivo" IN ('defecto', 'deterioro')),
    CONSTRAINT "chk_no_vendible_estado" CHECK ("estado" IN ('Pendiente', 'Reclamado', 'Repuesto', 'Desechado'))
);
CREATE INDEX IF NOT EXISTS "idx_no_vendible_tenant" ON "inventario_no_vendible" ("idTenant", "fecha");

-- ---------------------------------------------------------------------------
-- Permisos del documento: devolucion.registrar (CU1, CU4-CU6), inspeccion
-- (CU3, Encargado) y autorizacion (Encargado); la politica usa tenant.admin.
-- ---------------------------------------------------------------------------
INSERT INTO "permiso" ("nombrePermiso")
SELECT p.nombre
FROM (VALUES ('devolucion.registrar'), ('devolucion.inspeccionar'), ('devolucion.autorizar')) AS p(nombre)
WHERE NOT EXISTS (SELECT 1 FROM "permiso" WHERE "nombrePermiso" = p.nombre);

INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT r."codigoRol", pe."idPermiso"
FROM (
    VALUES
        ('Administrador', 'devolucion.registrar'),
        ('Encargado de Sucursal', 'devolucion.registrar'),
        ('Cajero', 'devolucion.registrar'),
        ('Administrador', 'devolucion.inspeccionar'),
        ('Encargado de Sucursal', 'devolucion.inspeccionar'),
        ('Administrador', 'devolucion.autorizar'),
        ('Encargado de Sucursal', 'devolucion.autorizar')
) AS d(rol, permiso)
JOIN "rol" r ON r."nombreRol" = d.rol
JOIN "permiso" pe ON pe."nombrePermiso" = d.permiso
WHERE NOT EXISTS (
    SELECT 1 FROM "asignacion_permiso" a
    WHERE a."codigoRol" = r."codigoRol" AND a."idPermiso" = pe."idPermiso"
);

-- ---------------------------------------------------------------------------
-- Datos: completar los casos existentes y casos de ejemplo
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t RECORD;
    fila RECORD;
    v_nota BIGINT;
    v_dev BIGINT;
    v_fecha TIMESTAMPTZ;
    v_local TIMESTAMP;
    v_nuevo INT;
    v_k INT;
    v_inspector INT;
BEGIN
    -- Los casos de la migracion 015/021 se inspeccionaron en el mostrador y la
    -- prenda volvio a la venta: se completa esa traza (CU3, CU6, CU10).
    UPDATE "devolucion"
    SET "codigo" = 'DEV-' || lpad("idDevolucion"::TEXT, 6, '0'),
        "motivoCategoria" = CASE "tipo" WHEN 'cambio_talla' THEN 'talla' WHEN 'cambio_medida' THEN 'medida' ELSE 'no_desea' END,
        "condicion" = 'apta',
        "idInspector" = "idUsuario",
        "fechaInspeccion" = "fecha",
        "fechaResolucion" = "fecha",
        "destinoInventario" = CASE WHEN "tipo" = 'cambio_medida' THEN NULL ELSE 'vendible' END,
        "metodoReembolso" = CASE WHEN "tipo" = 'devolucion' AND "montoDevuelto" > 0 THEN 'efectivo' END,
        "estadoReembolso" = CASE WHEN "tipo" = 'devolucion' AND "montoDevuelto" > 0 THEN 'Completado' END
    WHERE "codigo" IS NULL AND "estado" = 'Completada';
    UPDATE "devolucion" SET "codigo" = 'DEV-' || lpad("idDevolucion"::TEXT, 6, '0') WHERE "codigo" IS NULL;
    UPDATE "devolucion" d SET "precioPagado" = dv."precio_unitario"
    FROM "detalle_venta" dv
    WHERE d."precioPagado" IS NULL AND dv."idVenta" = d."idVenta" AND dv."idProducto" = d."idProducto";

    -- Casos de ejemplo, solo si todavia no hay notas de credito.
    IF EXISTS (SELECT 1 FROM "nota_credito") THEN
        RETURN;
    END IF;

    FOR t IN
        SELECT te."idTenant" FROM "tenant" te
        WHERE EXISTS (SELECT 1 FROM "devolucion" d WHERE d."idTenant" = te."idTenant")
        ORDER BY te."idTenant"
    LOOP
        SELECT us."idUser" INTO v_inspector
        FROM "Usuario" us JOIN "rol" r ON r."codigoRol" = us."codigoRol"
        WHERE us."idTenant" = t."idTenant" AND r."nombreRol" IN ('Encargado de Sucursal', 'Administrador')
        ORDER BY CASE r."nombreRol" WHEN 'Encargado de Sucursal' THEN 1 ELSE 2 END, us."idUser"
        LIMIT 1;
        CONTINUE WHEN v_inspector IS NULL;

        -- Dos ventas recientes de poleras sin devoluciones: una se resuelve con
        -- nota de credito (CU7) y la otra fue un defecto de fabrica que quedo en
        -- el inventario no vendible con reclamo al proveedor (CU10).
        v_k := 0;
        FOR fila IN
            SELECT v."idVenta", v."fecha", v."idCliente", dv."idProducto", dv."precio_unitario",
                   p."talla", p."idProveedor", i."idInv", i."codigoSucursal"
            FROM "Venta" v
            JOIN "detalle_venta" dv ON dv."idVenta" = v."idVenta"
            JOIN "producto" p ON p."idProducto" = dv."idProducto"
            JOIN "Movimiento" m ON m."motivo" = 'Venta ' || v."idVenta" AND m."tipo" = 'venta'
            JOIN "Inventario" i ON i."idInv" = m."idInv" AND i."idProducto" = dv."idProducto"
            WHERE p."idTenant" = t."idTenant" AND p."tipo" = 'Polera Oversize'
              AND v."fecha" BETWEEN now() - INTERVAL '15 days' AND now() - INTERVAL '2 days'
              AND NOT EXISTS (SELECT 1 FROM "devolucion" d WHERE d."idVenta" = v."idVenta")
            ORDER BY v."fecha" DESC
            LIMIT 2
        LOOP
            v_k := v_k + 1;
            v_fecha := fila."fecha" + INTERVAL '5 hours';
            INSERT INTO "devolucion" ("tipo", "cantidad", "motivo", "estado", "fecha", "fechaVenta", "tallaOriginal",
                                      "montoDevuelto", "idVenta", "idProducto", "idCliente", "codigoSucursal",
                                      "idUsuario", "idTenant", "origen", "motivoCategoria", "condicion",
                                      "checklist", "idInspector", "fechaInspeccion", "destinoInventario",
                                      "fechaResolucion", "notasInspeccion", "precioPagado")
            VALUES (CASE WHEN v_k = 1 THEN 'nota_credito' ELSE 'devolucion' END, 1,
                    CASE WHEN v_k = 1 THEN 'Prefiere elegir otra prenda mas adelante' ELSE 'Costura abierta en el hombro' END,
                    'Completada', v_fecha, fila."fecha", fila."talla",
                    CASE WHEN v_k = 1 THEN 0 ELSE fila."precio_unitario" END,
                    fila."idVenta", fila."idProducto", fila."idCliente", fila."codigoSucursal",
                    v_inspector, t."idTenant", 'tienda',
                    CASE WHEN v_k = 1 THEN 'no_desea' ELSE 'defecto' END,
                    CASE WHEN v_k = 1 THEN 'apta' ELSE 'defectuosa' END,
                    '{"etiquetas": true, "sinUso": true, "sinManchas": true, "sinRoturas": true, "accesorios": true}'::JSONB,
                    v_inspector, v_fecha,
                    CASE WHEN v_k = 1 THEN 'vendible' ELSE 'no_vendible' END, v_fecha,
                    CASE WHEN v_k = 1 THEN 'Con etiqueta, sin uso' ELSE 'Defecto de fabrica confirmado' END,
                    fila."precio_unitario")
            RETURNING "idDevolucion" INTO v_dev;
            UPDATE "devolucion" SET "codigo" = 'DEV-' || lpad(v_dev::TEXT, 6, '0') WHERE "idDevolucion" = v_dev;

            IF v_k = 1 THEN
                INSERT INTO "nota_credito" ("codigo", "monto", "saldo", "estado", "fechaEmision", "fechaVencimiento",
                                            "motivo", "idCliente", "idDevolucion", "idUsuario", "idTenant")
                VALUES ('TMP-' || v_dev, fila."precio_unitario", fila."precio_unitario", 'Vigente', v_fecha,
                        v_fecha + INTERVAL '90 days', 'Devolucion DEV-' || lpad(v_dev::TEXT, 6, '0'),
                        fila."idCliente", v_dev, v_inspector, t."idTenant")
                RETURNING "idNotaCredito" INTO v_nota;
                UPDATE "nota_credito" SET "codigo" = 'NC-' || lpad(v_nota::TEXT, 6, '0') WHERE "idNotaCredito" = v_nota;
                INSERT INTO "nota_credito_movimiento" ("idNotaCredito", "tipo", "monto", "saldoResultante",
                                                       "idDevolucion", "detalle", "fecha", "idUsuario")
                VALUES (v_nota, 'emision', fila."precio_unitario", fila."precio_unitario", v_dev,
                        'Saldo a favor de la devolucion', v_fecha, v_inspector);
                UPDATE "devolucion" SET "idNotaCredito" = v_nota WHERE "idDevolucion" = v_dev;
                -- La prenda apta vuelve al stock vendible.
                UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" + 1 WHERE "idInv" = fila."idInv";
                INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv", "referencia")
                VALUES ('devolucion', 1, v_fecha, 'Entrada por devolucion DEV-' || lpad(v_dev::TEXT, 6, '0'),
                        fila."idInv", 'DEV-' || lpad(v_dev::TEXT, 6, '0'));
            ELSE
                UPDATE "devolucion" SET "metodoReembolso" = 'efectivo', "estadoReembolso" = 'Completado'
                WHERE "idDevolucion" = v_dev;
                INSERT INTO "inventario_no_vendible" ("codigoSucursal", "idProducto", "cantidad", "motivo",
                                                      "idDevolucion", "idProveedor", "estado", "observaciones",
                                                      "fecha", "idTenant")
                VALUES (fila."codigoSucursal", fila."idProducto", 1, 'defecto', v_dev, fila."idProveedor",
                        'Pendiente', 'Costura abierta en el hombro', v_fecha, t."idTenant");
            END IF;

            v_local := v_fecha AT TIME ZONE 'America/La_Paz';
            INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
            VALUES ('Devolucion DEV-' || lpad(v_dev::TEXT, 6, '0') || ' resuelta sobre la venta ' || fila."idVenta",
                    v_local::TIME, v_local::DATE, '10.0.0.20'::INET, v_inspector);
        END LOOP;
    END LOOP;

    -- CU2/CU3: solicitudes desde la tienda en linea, en la empresa con clientes
    -- registrados: dos pendientes de entrega y una rechazada en la inspeccion.
    v_k := 0;
    FOR fila IN
        SELECT v."idVenta", v."fecha", v."idCliente", c."idUser" AS usuario_cliente, dv."idProducto",
               p."talla", p."color", p."tipo", p."idTenant", i."codigoSucursal"
        FROM "Venta" v
        JOIN "metodo_pago" mp ON mp."idMetPago" = v."idMetPago" AND mp."origen" = 'tarjeta_stripe'
        JOIN "Cliente" c ON c."idCliente" = v."idCliente" AND c."idUser" = mp."idUserPago"
        JOIN "detalle_venta" dv ON dv."idVenta" = v."idVenta"
        JOIN "producto" p ON p."idProducto" = dv."idProducto"
        JOIN "Movimiento" m ON m."motivo" = 'Venta ' || v."idVenta" AND m."tipo" = 'venta'
        JOIN "Inventario" i ON i."idInv" = m."idInv" AND i."idProducto" = dv."idProducto"
        WHERE p."tipo" = 'Polera Oversize' AND p."talla" IN ('S', 'M', 'L')
          AND v."fecha" BETWEEN now() - INTERVAL '12 days' AND now() - INTERVAL '1 day'
          AND NOT EXISTS (SELECT 1 FROM "devolucion" d WHERE d."idVenta" = v."idVenta")
        ORDER BY v."fecha" DESC
        LIMIT 3
    LOOP
        v_k := v_k + 1;
        v_fecha := fila."fecha" + INTERVAL '6 hours';
        IF v_k = 1 THEN
            -- Pide la talla siguiente del mismo modelo y color.
            SELECT p2."idProducto" INTO v_nuevo FROM "producto" p2
            WHERE p2."idTenant" = fila."idTenant" AND p2."tipo" = fila."tipo" AND p2."color" = fila."color"
              AND p2."talla" = CASE fila."talla" WHEN 'S' THEN 'M' WHEN 'M' THEN 'L' ELSE 'XL' END
            LIMIT 1;
            INSERT INTO "devolucion" ("tipo", "cantidad", "motivo", "estado", "fecha", "fechaVenta", "tallaOriginal",
                                      "tallaNueva", "montoDevuelto", "idVenta", "idProducto", "idProductoNuevo",
                                      "idCliente", "codigoSucursal", "idUsuario", "idTenant", "origen",
                                      "motivoCategoria", "fechaLimiteEntrega")
            SELECT 'cambio_talla', 1, 'Me quedo ajustada, quiero una talla mas', 'PendienteEntrega', v_fecha,
                   fila."fecha", fila."talla", p2."talla", 0, fila."idVenta", fila."idProducto", v_nuevo,
                   fila."idCliente", fila."codigoSucursal", fila.usuario_cliente, fila."idTenant", 'en_linea',
                   'talla', now() + INTERVAL '2 days'
            FROM "producto" p2 WHERE p2."idProducto" = v_nuevo
            RETURNING "idDevolucion" INTO v_dev;
        ELSIF v_k = 2 THEN
            INSERT INTO "devolucion" ("tipo", "cantidad", "motivo", "estado", "fecha", "fechaVenta", "tallaOriginal",
                                      "montoDevuelto", "idVenta", "idProducto", "idCliente", "codigoSucursal",
                                      "idUsuario", "idTenant", "origen", "motivoCategoria", "fechaLimiteEntrega")
            VALUES ('devolucion', 1, 'El color no es como en la foto', 'PendienteEntrega', v_fecha, fila."fecha",
                    fila."talla", 0, fila."idVenta", fila."idProducto", fila."idCliente", fila."codigoSucursal",
                    fila.usuario_cliente, fila."idTenant", 'en_linea', 'color', now() + INTERVAL '3 days')
            RETURNING "idDevolucion" INTO v_dev;
        ELSE
            INSERT INTO "devolucion" ("tipo", "cantidad", "motivo", "estado", "fecha", "fechaVenta", "tallaOriginal",
                                      "montoDevuelto", "idVenta", "idProducto", "idCliente", "codigoSucursal",
                                      "idUsuario", "idTenant", "origen", "motivoCategoria", "condicion", "checklist",
                                      "notasInspeccion", "idInspector", "fechaInspeccion", "motivoRechazo",
                                      "fechaResolucion")
            SELECT 'devolucion', 1, 'Ya no la quiero', 'Rechazada', v_fecha, fila."fecha", fila."talla", 0,
                   fila."idVenta", fila."idProducto", fila."idCliente", fila."codigoSucursal",
                   fila.usuario_cliente, fila."idTenant", 'en_linea', 'no_desea', 'deteriorada',
                   '{"etiquetas": false, "sinUso": false, "sinManchas": false, "sinRoturas": true, "accesorios": true}'::JSONB,
                   'Manchas en el frente y sin etiqueta', us."idUser", v_fecha + INTERVAL '1 day',
                   'La prenda tiene señales de uso: no cumple la politica de devoluciones', v_fecha + INTERVAL '1 day'
            FROM "Usuario" us JOIN "rol" r ON r."codigoRol" = us."codigoRol"
            WHERE us."idTenant" = fila."idTenant" AND r."nombreRol" IN ('Encargado de Sucursal', 'Administrador')
            ORDER BY us."idUser" LIMIT 1
            RETURNING "idDevolucion" INTO v_dev;
        END IF;
        UPDATE "devolucion" SET "codigo" = 'DEV-' || lpad(v_dev::TEXT, 6, '0') WHERE "idDevolucion" = v_dev;

        v_local := v_fecha AT TIME ZONE 'America/La_Paz';
        INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
        VALUES ('Solicitud de devolucion DEV-' || lpad(v_dev::TEXT, 6, '0') || ' en linea sobre la venta ' || fila."idVenta",
                v_local::TIME, v_local::DATE, ('181.115.' || (1 + fila.usuario_cliente % 250) || '.30')::INET,
                fila.usuario_cliente);
    END LOOP;

    UPDATE "devolucion" d SET "precioPagado" = dv."precio_unitario"
    FROM "detalle_venta" dv
    WHERE d."precioPagado" IS NULL AND dv."idVenta" = d."idVenta" AND dv."idProducto" = d."idProducto";
END
$$;
