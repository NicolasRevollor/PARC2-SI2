-- 029_tercera_empresa_avanzado.sql
-- Pedido de la ingeniera: cada plan de suscripcion debe tener COMO MINIMO 3
-- empresas. Basico tenia 14 e Intermedio 3, pero Avanzado solo 2 (YouShop
-- Collective y El Socavon). Se agrega una tercera empresa al plan Avanzado:
--
--   Sopocachi (La Paz) - plan Avanzado
--     admin@sopocachi.bo, encargado@sopocachi.bo, cajero@sopocachi.bo
--     (contrasena: la misma que el resto del seed)
--     3 sucursales, suscripcion activa, el catalogo de la tienda (26 prendas con
--     sus medidas), stock inicial y ventas de los ultimos 30 dias para que el
--     dashboard, los reportes y los modelos de IA no arranquen vacios.
--
-- No borra ni modifica nada de lo existente. Re-ejecutable: cada paso se salta
-- si ya esta hecho. Depende de 020 (catalogo), 023 (suscripcion y modelos),
-- 024 (usuario_sucursal), 025 (medidas) y 027 (NIT).

BEGIN;

INSERT INTO "tenant" ("nombre", "slug", "estado", "idPlan", "nit")
SELECT 'Sopocachi', 'sopocachi', 'Activo', p."idPlan", '1029384017'
FROM "plan" p
WHERE p."codigo" = 'avanzado'
  AND NOT EXISTS (SELECT 1 FROM "tenant" t WHERE t."slug" = 'sopocachi');

-- Suscripcion vigente: arranca hoy y vence en un mes.
INSERT INTO "suscripcion" ("idTenant", "idPlan", "fechaInicio", "fechaVencimiento", "estado", "precioMensual")
SELECT t."idTenant", t."idPlan", now(), now() + INTERVAL '1 month', 'Activa', p."precioMensual"
FROM "tenant" t JOIN "plan" p ON p."idPlan" = t."idPlan"
WHERE t."slug" = 'sopocachi'
  AND NOT EXISTS (SELECT 1 FROM "suscripcion" s WHERE s."idTenant" = t."idTenant");

INSERT INTO "Usuario" ("nombre", "correo", "contraseña", "codigoRol", "idTenant")
SELECT u.nombre, u.correo, '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C', r."codigoRol", t."idTenant"
FROM (
    VALUES
        ('Admin Sopocachi',     'admin@sopocachi.bo',     'Administrador'),
        ('Encargado Sopocachi', 'encargado@sopocachi.bo', 'Encargado de Sucursal'),
        ('Cajero Sopocachi',    'cajero@sopocachi.bo',    'Cajero')
) AS u(nombre, correo, rol)
JOIN "rol" r ON r."nombreRol" = u.rol
JOIN "tenant" t ON t."slug" = 'sopocachi'
WHERE NOT EXISTS (SELECT 1 FROM "Usuario" x WHERE lower(x."correo") = lower(u.correo));

INSERT INTO "Sucursal" ("nombre", "direccion", "idCiudad", "idTenant")
SELECT s.nombre, s.direccion, c."idCiudad", t."idTenant"
FROM (
    VALUES
        ('Sopocachi Plaza Abaroa', 'Av. 20 de Octubre #2210'),
        ('Sopocachi Av. Ecuador',  'Av. Ecuador #1945'),
        ('Sopocachi Montículo',    'Calle Rosendo Gutiérrez #480')
) AS s(nombre, direccion)
JOIN "tenant" t ON t."slug" = 'sopocachi'
JOIN "Ciudad" c ON c."nombCiudad" = 'La Paz'
WHERE NOT EXISTS (SELECT 1 FROM "Sucursal" x WHERE x."nombre" = s.nombre AND x."idTenant" = t."idTenant");

-- [CU24] El encargado y el cajero trabajan en la primera sucursal.
INSERT INTO "usuario_sucursal" ("idUser", "codigoSucursal")
SELECT u."idUser", su."codigoSucursal"
FROM "Usuario" u
JOIN "tenant" t ON t."idTenant" = u."idTenant" AND t."slug" = 'sopocachi'
JOIN "Sucursal" su ON su."idTenant" = t."idTenant" AND su."nombre" = 'Sopocachi Plaza Abaroa'
WHERE u."correo" IN ('encargado@sopocachi.bo', 'cajero@sopocachi.bo')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_tenant INTEGER;
    v_origen INTEGER;
    v_prov_polera INTEGER;
    v_prov_jeans INTEGER;
    v_temporada INTEGER;
    v_col_polera INTEGER;
    v_col_jeans INTEGER;
    v_clientes INTEGER[];
    v_cajero INTEGER;
    s RECORD;
    v_prod RECORD;
    v_k INTEGER;
    v_l INTEGER;
    v_fecha TIMESTAMPTZ;
    v_pago INTEGER;
    v_venta INTEGER;
    v_total NUMERIC(12, 2);
    v_lineas INTEGER;
    v_cant INTEGER;
    v_inv INTEGER;
    v_cliente INTEGER;
BEGIN
    SELECT "idTenant" INTO v_tenant FROM "tenant" WHERE "slug" = 'sopocachi';
    IF v_tenant IS NULL THEN
        RETURN;
    END IF;

    -- Catalogo: el mismo de El Socavon (o, si no esta, el de la empresa 1).
    IF NOT EXISTS (SELECT 1 FROM "producto" WHERE "idTenant" = v_tenant) THEN
        SELECT COALESCE(
            (SELECT t."idTenant" FROM "tenant" t WHERE t."slug" = 'el-socavon'
              AND EXISTS (SELECT 1 FROM "producto" p WHERE p."idTenant" = t."idTenant")), 1)
        INTO v_origen;

        INSERT INTO "Proveedor" ("nombre", "telefono", "correo", "idTenant")
        VALUES ('Textiles Andinos S.A.', '+591 33445566', 'ventas@textilesandinos.bo', v_tenant)
        RETURNING "idProveedor" INTO v_prov_polera;
        INSERT INTO "Proveedor" ("nombre", "telefono", "correo", "idTenant")
        VALUES ('Denim Bolivia SRL', '+591 44556677', 'pedidos@denimbolivia.bo', v_tenant)
        RETURNING "idProveedor" INTO v_prov_jeans;
        INSERT INTO "Temporada" ("nombreTemporada", "fecha_ini", "fecha_fin", "idTenant")
        VALUES ('Colección Esencial 2026', DATE '2026-01-01', DATE '2026-12-31', v_tenant)
        RETURNING "idTemporada" INTO v_temporada;
        INSERT INTO "Colecciones" ("nombre_coleccion", "idTemporada", "idTenant")
        VALUES ('Poleras Oversize', v_temporada, v_tenant) RETURNING "idColeccion" INTO v_col_polera;
        INSERT INTO "Colecciones" ("nombre_coleccion", "idTemporada", "idTenant")
        VALUES ('Jeans', v_temporada, v_tenant) RETURNING "idColeccion" INTO v_col_jeans;

        INSERT INTO "modelo_producto" ("nombre", "tipo", "idTenant")
        VALUES ('Polera Oversize', 'Polera Oversize', v_tenant), ('Jeans', 'Jeans', v_tenant)
        ON CONFLICT ("idTenant", "nombre") DO NOTHING;

        INSERT INTO "producto" (
            "nombre", "descripcion", "costo", "venta", "tipo", "talla", "color", "idProveedor", "idColeccion",
            "imagen_url", "imagenes_secundarias", "idTenant", "idModelo", "medidaPechoCm", "medidaLargoCm", "medidaCinturaCm"
        )
        SELECT p."nombre", p."descripcion", p."costo", p."venta", p."tipo", p."talla", p."color",
               CASE WHEN p."tipo" = 'Jeans' THEN v_prov_jeans ELSE v_prov_polera END,
               CASE WHEN p."tipo" = 'Jeans' THEN v_col_jeans ELSE v_col_polera END,
               p."imagen_url", p."imagenes_secundarias", v_tenant, m."idModelo",
               p."medidaPechoCm", p."medidaLargoCm", p."medidaCinturaCm"
        FROM "producto" p
        JOIN "modelo_producto" m ON m."idTenant" = v_tenant AND m."nombre" = p."tipo"
        WHERE p."idTenant" = v_origen AND p."tipo" IN ('Polera Oversize', 'Jeans')
        ORDER BY p."idProducto";

        INSERT INTO "Inventario" ("cantidad_actual", "cantidad_reservada", "codigoSucursal", "idProducto")
        SELECT 12 + ((p."idProducto" * 7 + su."codigoSucursal" * 13) % 30), 0, su."codigoSucursal", p."idProducto"
        FROM "producto" p JOIN "Sucursal" su ON su."idTenant" = p."idTenant"
        WHERE p."idTenant" = v_tenant
        ON CONFLICT DO NOTHING;

        INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv")
        SELECT 'entrada_lote', i."cantidad_actual", now() - INTERVAL '35 days', 'Ingreso de lote inicial - Colección Esencial 2026', i."idInv"
        FROM "Inventario" i JOIN "producto" p ON p."idProducto" = i."idProducto"
        WHERE p."idTenant" = v_tenant;
    END IF;

    -- Ventas de ejemplo de los ultimos 30 dias (14 por sucursal, como Avanzado en 020).
    IF NOT EXISTS (
        SELECT 1 FROM "detalle_venta" dv JOIN "producto" p ON p."idProducto" = dv."idProducto" WHERE p."idTenant" = v_tenant
    ) THEN
        PERFORM setseed(0.2029);
        SELECT array_agg("idCliente" ORDER BY "idCliente") INTO v_clientes FROM "Cliente";
        SELECT "idUser" INTO v_cajero FROM "Usuario" WHERE "correo" = 'cajero@sopocachi.bo';
        IF v_clientes IS NULL THEN
            RETURN;
        END IF;

        FOR s IN SELECT "codigoSucursal" FROM "Sucursal" WHERE "idTenant" = v_tenant ORDER BY "codigoSucursal" LOOP
            FOR v_k IN 1..14 LOOP
                v_fecha := (((now() AT TIME ZONE 'America/La_Paz')::DATE - (floor(random() * 30))::INT)
                           + make_interval(hours => 9 + (floor(random() * 10))::INT, mins => (floor(random() * 60))::INT))::TIMESTAMP
                           AT TIME ZONE 'America/La_Paz';
                IF v_fecha > now() THEN
                    v_fecha := v_fecha - INTERVAL '1 day';
                END IF;
                v_cliente := v_clientes[1 + floor(random() * array_length(v_clientes, 1))::INT];

                INSERT INTO "metodo_pago" ("tipo", "estado", "fecha", "monto", "consumidoEn")
                VALUES (CASE WHEN random() < 0.6 THEN 'Efectivo' ELSE 'QR / Transferencia' END, 'Activo', v_fecha, 0, v_fecha)
                RETURNING "idMetPago" INTO v_pago;
                INSERT INTO "Venta" ("fecha", "total", "idCliente", "idMetPago")
                VALUES (v_fecha, 0, v_cliente, v_pago) RETURNING "idVenta" INTO v_venta;

                v_total := 0;
                v_lineas := 0;
                FOR v_l IN 1..(1 + floor(random() * 2))::INT LOOP
                    SELECT p."idProducto", p."venta" INTO v_prod
                    FROM "producto" p
                    WHERE p."idTenant" = v_tenant
                      AND p."tipo" = CASE WHEN random() < 0.7 THEN 'Polera Oversize' ELSE 'Jeans' END
                      AND NOT EXISTS (SELECT 1 FROM "detalle_venta" d WHERE d."idVenta" = v_venta AND d."idProducto" = p."idProducto")
                    ORDER BY random() LIMIT 1;
                    CONTINUE WHEN v_prod."idProducto" IS NULL;
                    v_cant := CASE WHEN random() < 0.8 THEN 1 ELSE 2 END;
                    UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" - v_cant
                    WHERE "codigoSucursal" = s."codigoSucursal" AND "idProducto" = v_prod."idProducto"
                      AND "cantidad_actual" - "cantidad_reservada" >= v_cant
                    RETURNING "idInv" INTO v_inv;
                    CONTINUE WHEN v_inv IS NULL;
                    INSERT INTO "detalle_venta" ("cantidad", "precio_unitario", "idProducto", "idVenta")
                    VALUES (v_cant, v_prod."venta", v_prod."idProducto", v_venta);
                    -- El motivo es exactamente "Venta N": asi la atribuyen a su sucursal los reportes.
                    INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv")
                    VALUES ('venta', -v_cant, v_fecha, 'Venta ' || v_venta, v_inv);
                    INSERT INTO "historial" ("fecha", "idProducto", "idCliente", "idVenta")
                    VALUES (v_fecha, v_prod."idProducto", v_cliente, v_venta);
                    v_total := v_total + v_prod."venta" * v_cant;
                    v_lineas := v_lineas + 1;
                    v_inv := NULL;
                END LOOP;

                IF v_lineas = 0 THEN
                    DELETE FROM "Venta" WHERE "idVenta" = v_venta;
                    DELETE FROM "metodo_pago" WHERE "idMetPago" = v_pago;
                ELSE
                    UPDATE "Venta" SET "total" = v_total WHERE "idVenta" = v_venta;
                    UPDATE "metodo_pago" SET "monto" = v_total WHERE "idMetPago" = v_pago;
                END IF;
            END LOOP;
        END LOOP;
    END IF;
END
$$;

COMMIT;

-- Verificacion: empresas por plan (todas deben tener 3 o mas).
--   SELECT p."nombre", count(t."idTenant") FROM "plan" p LEFT JOIN "tenant" t ON t."idPlan" = p."idPlan"
--   WHERE p."activo" GROUP BY p."nombre" ORDER BY 2;
