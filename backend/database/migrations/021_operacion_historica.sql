-- 021_operacion_historica.sql
-- Historia de operacion para que cada empresa parezca una tienda que ya
-- vende hace meses: dashboard, reportes, indicadores, bitacora y analisis
-- con IA con datos de verdad. Depende de la 020 (catalogo, stock, empresas).
--
-- Por empresa (las 19; se salta la que ya tenga esta historia):
--   1) Ventas de los ultimos 150 dias: tendencia de crecimiento, mas venta
--      los viernes y sabados, cada sucursal con su ritmo y su color de
--      polera favorito; en la empresa con vitrina (la que tiene clientes
--      registrados) ~12% son compras en linea del propio cliente.
--   2) Reposiciones mensuales de proveedor que cubren esas ventas: el stock
--      actual no cambia y el kardex queda consistente (la suma de
--      movimientos de cada inventario sigue siendo igual a su stock).
--   3) Operacion reciente que SI mueve el stock actual:
--        - la sucursal que mas vende agota su polera favorita en M y L
--          (quiebre real), mientras otra sucursal recibio un lote grande del
--          mismo producto (exceso) -> el analisis propone transferencias;
--        - traspasos entre sucursales, devoluciones y cambios de talla dentro
--          de las 24 h, y una merma de inventario.
--   4) Bitacora de TODOS los usuarios: inicios y cierres de sesion, intentos
--      fallidos, ventas, traspasos, devoluciones, ajustes e ingresos.
--
-- Un solo bloque DO: corre igual en el SQL Editor de Supabase (que ejecuta
-- sentencia por sentencia) y en psql. Re-ejecutable: una empresa con
-- reposiciones "REP-" ya tiene su historia y se salta.

DO $$
DECLARE
    t RECORD;
    s RECORD;
    u RECORD;
    fila RECORD;
    v_colores TEXT[] := ARRAY['Blanco', 'Negro', 'Guinda', 'Gris'];
    v_clientes INT[];
    v_vitrina INT[];
    v_vitrina_usr INT[];
    v_mov_desde BIGINT;
    v_base NUMERIC;
    v_cajero INT;
    v_admin INT;
    v_hot_suc INT;
    v_hot_fav TEXT;
    v_dia DATE;
    v_d INT;
    v_n INT;
    v_k INT;
    v_l INT;
    v_lineas INT;
    v_trend NUMERIC;
    v_wd NUMERIC;
    v_fecha TIMESTAMPTZ;
    v_local TIMESTAMP;
    v_pago INT;
    v_venta INT;
    v_total NUMERIC(12, 2);
    v_tipo TEXT;
    v_color TEXT;
    v_talla TEXT;
    v_r NUMERIC;
    v_prod INT;
    v_precio NUMERIC(12, 2);
    v_inv INT;
    v_inv2 INT;
    v_cant INT;
    v_disp INT;
    v_objetivo INT;
    v_cli_idx INT;
    v_cliente INT;
    v_online BOOLEAN;
    v_actor INT;
    v_ip TEXT;
    v_ref TEXT;
    v_prod_nuevo INT;
    v_talla_nueva TEXT;
    v_motivo TEXT;
    v_empresas INT := 0;
    -- "Hoy" en Bolivia: el SQL Editor de Supabase corre en UTC.
    v_hoy DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
BEGIN
    PERFORM setseed(0.021);

    SELECT array_agg(c."idCliente" ORDER BY c."idCliente") INTO v_clientes FROM "Cliente" c;
    IF v_clientes IS NULL THEN
        RAISE NOTICE '021: no hay clientes, no se genera historia';
        RETURN;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS _perfil (codigo INT PRIMARY KEY, nombre TEXT, factor NUMERIC, favorito TEXT) ON COMMIT DROP;

    FOR t IN
        SELECT te."idTenant", te."nombre", pl."codigo" AS plan
        FROM "tenant" te JOIN "plan" pl ON pl."idPlan" = te."idPlan"
        ORDER BY te."idTenant"
    LOOP
        -- Solo empresas con el catalogo de la 020 y todavia sin historia.
        CONTINUE WHEN NOT EXISTS (
            SELECT 1 FROM "producto" WHERE "idTenant" = t."idTenant" AND "tipo" IN ('Polera Oversize', 'Jeans')
        );
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM "Movimiento" m
            JOIN "Inventario" i ON i."idInv" = m."idInv"
            JOIN "Sucursal" su ON su."codigoSucursal" = i."codigoSucursal"
            WHERE su."idTenant" = t."idTenant" AND m."referencia" LIKE 'REP-%'
        );
        v_empresas := v_empresas + 1;

        v_base := CASE t.plan WHEN 'free_lite' THEN 1.3 WHEN 'basico' THEN 1.7 WHEN 'intermedio' THEN 2.2 ELSE 2.5 END;

        SELECT us."idUser" INTO v_cajero
        FROM "Usuario" us JOIN "rol" r ON r."codigoRol" = us."codigoRol"
        WHERE us."idTenant" = t."idTenant" AND r."nombreRol" IN ('Cajero', 'Encargado de Sucursal', 'Administrador')
        ORDER BY CASE r."nombreRol" WHEN 'Cajero' THEN 1 WHEN 'Encargado de Sucursal' THEN 2 ELSE 3 END, us."idUser"
        LIMIT 1;
        SELECT us."idUser" INTO v_admin
        FROM "Usuario" us JOIN "rol" r ON r."codigoRol" = us."codigoRol"
        WHERE us."idTenant" = t."idTenant" AND r."nombreRol" IN ('Administrador', 'Encargado de Sucursal')
        ORDER BY CASE r."nombreRol" WHEN 'Encargado de Sucursal' THEN 1 ELSE 2 END, us."idUser"
        LIMIT 1;
        v_admin := COALESCE(v_admin, v_cajero);
        CONTINUE WHEN v_cajero IS NULL;

        -- Perfil de cada sucursal: ritmo de venta y color de polera favorito.
        -- Clientes registrados en la vitrina de esta empresa (compras en linea).
        SELECT array_agg(c."idCliente" ORDER BY c."idCliente"), array_agg(c."idUser" ORDER BY c."idCliente")
        INTO v_vitrina, v_vitrina_usr
        FROM "Cliente" c JOIN "Usuario" us ON us."idUser" = c."idUser"
        WHERE us."idTenant" = t."idTenant";

        DELETE FROM _perfil;
        INSERT INTO _perfil
        SELECT su."codigoSucursal", su."nombre", round((0.75 + random() * 0.6)::NUMERIC, 2), v_colores[1 + floor(random() * 4)::INT]
        FROM "Sucursal" su WHERE su."idTenant" = t."idTenant";

        -- ------------------------------------------------------------------
        -- 1) Ventas de los ultimos 150 dias. No tocan el stock actual: las
        --    cubren las reposiciones del paso 2.
        -- ------------------------------------------------------------------
        SELECT COALESCE(MAX("idMov"), 0) INTO v_mov_desde FROM "Movimiento";
        FOR s IN SELECT * FROM _perfil ORDER BY codigo LOOP
            FOR v_d IN 0..150 LOOP
                v_dia := v_hoy - v_d;
                v_trend := 0.6 + 0.4 * (150 - v_d) / 120.0;
                v_wd := CASE extract(isodow FROM v_dia)
                            WHEN 1 THEN 0.8 WHEN 2 THEN 0.85 WHEN 3 THEN 0.9 WHEN 4 THEN 1.0
                            WHEN 5 THEN 1.25 WHEN 6 THEN 1.55 ELSE 0.7 END;
                v_n := floor(v_base * s.factor * v_trend * v_wd + random())::INT;

                FOR v_k IN 1..v_n LOOP
                    v_fecha := (v_dia + make_interval(hours => 9 + floor(random() * 11)::INT,
                                                      mins => floor(random() * 60)::INT))::TIMESTAMP
                               AT TIME ZONE 'America/La_Paz';
                    CONTINUE WHEN v_fecha > now();
                    v_online := v_vitrina IS NOT NULL AND random() < 0.12;
                    IF v_online THEN
                        v_cli_idx := 1 + floor(random() * array_length(v_vitrina, 1))::INT;
                        v_cliente := v_vitrina[v_cli_idx];
                        v_actor := v_vitrina_usr[v_cli_idx];
                    ELSE
                        v_cli_idx := 1 + floor(random() * array_length(v_clientes, 1))::INT;
                        v_cliente := v_clientes[v_cli_idx];
                        v_actor := v_cajero;
                    END IF;

                    v_r := random();
                    INSERT INTO "metodo_pago" ("tipo", "estado", "fecha", "monto", "origen", "idUserPago", "consumidoEn")
                    VALUES (CASE WHEN v_online THEN 'Tarjeta (Stripe)'
                                 WHEN v_r < 0.5 THEN 'Efectivo'
                                 WHEN v_r < 0.85 THEN 'QR / Transferencia'
                                 ELSE 'Tarjeta de débito' END,
                            'Activo', v_fecha, 0,
                            CASE WHEN v_online THEN 'tarjeta_stripe' END,
                            CASE WHEN v_online THEN v_actor END,
                            v_fecha)
                    RETURNING "idMetPago" INTO v_pago;

                    INSERT INTO "Venta" ("fecha", "total", "idCliente", "idMetPago")
                    VALUES (v_fecha, 0, v_cliente, v_pago)
                    RETURNING "idVenta" INTO v_venta;

                    v_total := 0;
                    v_lineas := 0;
                    FOR v_l IN 1..(1 + (random() < 0.35)::INT + (random() < 0.1)::INT) LOOP
                        IF random() < 0.68 THEN
                            v_tipo := 'Polera Oversize';
                            v_color := CASE WHEN random() < 0.45 THEN s.favorito ELSE v_colores[1 + floor(random() * 4)::INT] END;
                            v_r := random();
                            v_talla := CASE WHEN v_r < 0.15 THEN 'S' WHEN v_r < 0.50 THEN 'M' WHEN v_r < 0.83 THEN 'L' ELSE 'XL' END;
                        ELSE
                            v_tipo := 'Jeans';
                            v_color := CASE WHEN random() < 0.6 THEN 'Negro' ELSE 'Blanco' END;
                            v_r := random();
                            v_talla := CASE WHEN v_r < 0.10 THEN '28' WHEN v_r < 0.35 THEN '30' WHEN v_r < 0.67 THEN '32'
                                            WHEN v_r < 0.90 THEN '34' ELSE '36' END;
                        END IF;

                        SELECT p."idProducto", p."venta" INTO v_prod, v_precio
                        FROM "producto" p
                        WHERE p."idTenant" = t."idTenant" AND p."tipo" = v_tipo AND p."color" = v_color AND p."talla" = v_talla
                        ORDER BY p."idProducto" LIMIT 1;
                        CONTINUE WHEN v_prod IS NULL;
                        CONTINUE WHEN EXISTS (SELECT 1 FROM "detalle_venta" WHERE "idVenta" = v_venta AND "idProducto" = v_prod);
                        SELECT "idInv" INTO v_inv FROM "Inventario" WHERE "codigoSucursal" = s.codigo AND "idProducto" = v_prod;
                        CONTINUE WHEN v_inv IS NULL;

                        v_cant := CASE WHEN random() < 0.85 THEN 1 ELSE 2 END;
                        INSERT INTO "detalle_venta" ("cantidad", "precio_unitario", "idProducto", "idVenta")
                        VALUES (v_cant, v_precio, v_prod, v_venta);
                        INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv")
                        VALUES ('venta', -v_cant, v_fecha, 'Venta ' || v_venta, v_inv);
                        INSERT INTO "historial" ("fecha", "idProducto", "idCliente", "idVenta")
                        VALUES (v_fecha, v_prod, v_cliente, v_venta);
                        v_total := v_total + v_precio * v_cant;
                        v_lineas := v_lineas + 1;
                    END LOOP;

                    IF v_lineas = 0 THEN
                        DELETE FROM "Venta" WHERE "idVenta" = v_venta;
                        DELETE FROM "metodo_pago" WHERE "idMetPago" = v_pago;
                    ELSE
                        UPDATE "Venta" SET "total" = v_total WHERE "idVenta" = v_venta;
                        UPDATE "metodo_pago" SET "monto" = v_total WHERE "idMetPago" = v_pago;
                        v_local := v_fecha AT TIME ZONE 'America/La_Paz';
                        v_ip := CASE WHEN v_online THEN '181.115.' || (1 + v_cli_idx % 250) || '.' || (10 + v_venta % 200)
                                     ELSE '10.' || (t."idTenant" % 250) || '.' || (s.codigo % 250) || '.20' END;
                        INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
                        VALUES ('Venta ' || v_venta || ' creada', v_local::TIME, v_local::DATE, v_ip::INET, v_actor);
                    END IF;
                END LOOP;
            END LOOP;
        END LOOP;

        -- ------------------------------------------------------------------
        -- 2) Reposicion mensual de proveedor: por inventario y por mes, un
        --    ingreso igual a lo vendido ese mes en el paso 1, justo antes de la
        --    primera venta del mes. Asi el saldo historico nunca es negativo y
        --    el stock actual no cambia (las ventas de la 020 ya lo descontaron).
        -- ------------------------------------------------------------------
        INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv", "referencia")
        SELECT 'entrada_lote', SUM(-m."cantidad"), MIN(m."fecha") - INTERVAL '3 hours',
               'Reposición mensual - ' || pr."nombre",
               m."idInv", 'REP-' || to_char(MIN(m."fecha") AT TIME ZONE 'America/La_Paz', 'YYYYMM')
        FROM "Movimiento" m
        JOIN "Inventario" i ON i."idInv" = m."idInv"
        JOIN "Sucursal" su ON su."codigoSucursal" = i."codigoSucursal"
        JOIN "producto" p ON p."idProducto" = i."idProducto"
        JOIN "Proveedor" pr ON pr."idProveedor" = p."idProveedor"
        WHERE su."idTenant" = t."idTenant"
          AND m."tipo" = 'venta'
          AND m."idMov" > v_mov_desde
        GROUP BY m."idInv", pr."nombre", date_trunc('month', m."fecha" AT TIME ZONE 'America/La_Paz')
        HAVING SUM(-m."cantidad") > 0;

        INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
        SELECT 'Ingreso de lote: reposicion mensual de ' || COUNT(*) || ' producto(s) en ' || su."nombre",
               (MIN(m."fecha") AT TIME ZONE 'America/La_Paz')::TIME, (MIN(m."fecha") AT TIME ZONE 'America/La_Paz')::DATE,
               ('10.' || (t."idTenant" % 250) || '.' || (su."codigoSucursal" % 250) || '.10')::INET, v_admin
        FROM "Movimiento" m
        JOIN "Inventario" i ON i."idInv" = m."idInv"
        JOIN "Sucursal" su ON su."codigoSucursal" = i."codigoSucursal"
        WHERE su."idTenant" = t."idTenant" AND m."referencia" LIKE 'REP-%'
        GROUP BY su."codigoSucursal", su."nombre", m."referencia";

        -- ------------------------------------------------------------------
        -- 3a) Prenda estrella agotada: en la sucursal que mas vende, la polera
        --     de su color favorito en M y L se vende hasta quedar en 1-4
        --     unidades (ventas de los ultimos 14 dias, stock real).
        -- ------------------------------------------------------------------
        SELECT codigo, favorito INTO v_hot_suc, v_hot_fav FROM _perfil ORDER BY factor DESC, codigo LIMIT 1;

        FOR fila IN
            SELECT i."idInv", i."idProducto", p."venta", p."nombre", p."talla",
                   i."cantidad_actual" - i."cantidad_reservada" AS disp
            FROM "Inventario" i JOIN "producto" p ON p."idProducto" = i."idProducto"
            WHERE i."codigoSucursal" = v_hot_suc AND p."tipo" = 'Polera Oversize'
              AND p."color" = v_hot_fav AND p."talla" IN ('M', 'L')
        LOOP
            v_disp := fila.disp;
            v_objetivo := 1 + floor(random() * 4)::INT;
            WHILE v_disp > v_objetivo LOOP
                v_cant := LEAST(v_disp - v_objetivo, 1 + floor(random() * 2)::INT);
                v_fecha := ((v_hoy - floor(random() * 14)::INT)
                            + make_interval(hours => 9 + floor(random() * 11)::INT, mins => floor(random() * 60)::INT))::TIMESTAMP
                           AT TIME ZONE 'America/La_Paz';
                IF v_fecha > now() THEN
                    v_fecha := v_fecha - INTERVAL '1 day';
                END IF;
                v_cli_idx := 1 + floor(random() * array_length(v_clientes, 1))::INT;
                v_cliente := v_clientes[v_cli_idx];

                INSERT INTO "metodo_pago" ("tipo", "estado", "fecha", "monto", "consumidoEn")
                VALUES (CASE WHEN random() < 0.55 THEN 'Efectivo' ELSE 'QR / Transferencia' END, 'Activo', v_fecha,
                        fila."venta" * v_cant, v_fecha)
                RETURNING "idMetPago" INTO v_pago;
                INSERT INTO "Venta" ("fecha", "total", "idCliente", "idMetPago")
                VALUES (v_fecha, fila."venta" * v_cant, v_cliente, v_pago)
                RETURNING "idVenta" INTO v_venta;
                INSERT INTO "detalle_venta" ("cantidad", "precio_unitario", "idProducto", "idVenta")
                VALUES (v_cant, fila."venta", fila."idProducto", v_venta);
                UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" - v_cant WHERE "idInv" = fila."idInv";
                INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv")
                VALUES ('venta', -v_cant, v_fecha, 'Venta ' || v_venta, fila."idInv");
                INSERT INTO "historial" ("fecha", "idProducto", "idCliente", "idVenta")
                VALUES (v_fecha, fila."idProducto", v_cliente, v_venta);
                v_local := v_fecha AT TIME ZONE 'America/La_Paz';
                INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
                VALUES ('Venta ' || v_venta || ' creada', v_local::TIME, v_local::DATE,
                        ('10.' || (t."idTenant" % 250) || '.' || (v_hot_suc % 250) || '.20')::INET, v_cajero);
                v_disp := v_disp - v_cant;
            END LOOP;
        END LOOP;

        -- 3b) Exceso del mismo producto en las otras sucursales: lote grande
        --     recibido hace 3 dias (stock real). Con 3a, el analisis encuentra
        --     quiebre en una sucursal y sobrante en otra.
        FOR fila IN
            SELECT i."idInv", su."nombre" AS sucursal, su."codigoSucursal", p."nombre", p."talla", pr."nombre" AS proveedor
            FROM "Inventario" i
            JOIN "Sucursal" su ON su."codigoSucursal" = i."codigoSucursal"
            JOIN "producto" p ON p."idProducto" = i."idProducto"
            JOIN "Proveedor" pr ON pr."idProveedor" = p."idProveedor"
            WHERE su."idTenant" = t."idTenant" AND su."codigoSucursal" <> v_hot_suc
              AND p."tipo" = 'Polera Oversize' AND p."color" = v_hot_fav AND p."talla" IN ('M', 'L')
        LOOP
            v_cant := 18 + floor(random() * 12)::INT;
            v_fecha := now() - INTERVAL '3 days';
            UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" + v_cant WHERE "idInv" = fila."idInv";
            INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv", "referencia")
            VALUES ('entrada_lote', v_cant, v_fecha, 'Ingreso de lote - ' || fila.proveedor, fila."idInv",
                    'REP-' || to_char(v_fecha AT TIME ZONE 'America/La_Paz', 'YYYYMM'));
            v_local := v_fecha AT TIME ZONE 'America/La_Paz';
            INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
            VALUES (left('Ingreso de lote: +' || v_cant || ' de ' || fila."nombre" || ' talla ' || fila."talla" || ' en ' || fila.sucursal, 150),
                    v_local::TIME, v_local::DATE, ('10.' || (t."idTenant" % 250) || '.' || (fila."codigoSucursal" % 250) || '.10')::INET, v_admin);
        END LOOP;

        -- 3c) Traspasos entre sucursales (solo empresas con mas de una):
        --     jeans de donde sobra hacia donde hay menos.
        IF (SELECT COUNT(*) FROM _perfil) > 1 THEN
            FOR v_k IN 1..2 LOOP
                SELECT o."idInv" AS inv_origen, d."idInv" AS inv_destino, so."nombre" AS origen, sd."nombre" AS destino,
                       p."nombre", p."talla",
                       o."cantidad_actual" - o."cantidad_reservada" AS disp_origen
                INTO fila
                FROM "Inventario" o
                JOIN "Inventario" d ON d."idProducto" = o."idProducto" AND d."codigoSucursal" <> o."codigoSucursal"
                JOIN "Sucursal" so ON so."codigoSucursal" = o."codigoSucursal"
                JOIN "Sucursal" sd ON sd."codigoSucursal" = d."codigoSucursal"
                JOIN "producto" p ON p."idProducto" = o."idProducto"
                WHERE so."idTenant" = t."idTenant" AND sd."idTenant" = t."idTenant" AND p."tipo" = 'Jeans'
                  AND o."cantidad_actual" - o."cantidad_reservada" >= 20
                ORDER BY (o."cantidad_actual" - d."cantidad_actual") DESC, random()
                LIMIT 1;
                EXIT WHEN fila.inv_origen IS NULL;

                v_cant := 4 + floor(random() * 4)::INT;
                v_fecha := now() - make_interval(days => 5 + v_k * 6, hours => floor(random() * 6)::INT);
                v_ref := 'DSP-' || to_char(v_fecha AT TIME ZONE 'UTC', 'YYYYMMDD-HH24MISS') || lpad((t."idTenant" * 10 + v_k)::TEXT, 6, '0');
                UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" - v_cant WHERE "idInv" = fila.inv_origen;
                UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" + v_cant WHERE "idInv" = fila.inv_destino;
                INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv", "referencia") VALUES
                    ('salida_traspaso', -v_cant, v_fecha, 'Equilibrio de stock entre sucursales', fila.inv_origen, v_ref),
                    ('entrada_traspaso', v_cant, v_fecha, 'Equilibrio de stock entre sucursales', fila.inv_destino, v_ref);
                v_local := v_fecha AT TIME ZONE 'America/La_Paz';
                INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
                VALUES (left('Traspaso ' || v_ref || ': ' || v_cant || ' unidad(es) de ' || fila.origen || ' a ' || fila.destino, 150),
                        v_local::TIME, v_local::DATE, ('10.' || (t."idTenant" % 250) || '.0.10')::INET, v_admin);
            END LOOP;
        END IF;

        -- 3d) Devoluciones y cambios de talla dentro de las 24 h de ventas
        --     recientes (stock real: vuelve la prenda, sale la de reemplazo).
        FOR fila IN
            SELECT v."idVenta", v."fecha", v."idCliente", dv."idProducto", dv."precio_unitario",
                   p."talla", p."color", p."nombre", i."idInv", i."codigoSucursal"
            FROM "Venta" v
            JOIN "detalle_venta" dv ON dv."idVenta" = v."idVenta"
            JOIN "producto" p ON p."idProducto" = dv."idProducto"
            JOIN "Movimiento" m ON m."motivo" = 'Venta ' || v."idVenta" AND m."tipo" = 'venta'
            JOIN "Inventario" i ON i."idInv" = m."idInv" AND i."idProducto" = dv."idProducto"
            WHERE p."idTenant" = t."idTenant" AND p."tipo" = 'Polera Oversize'
              AND v."fecha" BETWEEN now() - INTERVAL '20 days' AND now() - INTERVAL '6 hours'
              AND NOT EXISTS (SELECT 1 FROM "devolucion" de WHERE de."idVenta" = v."idVenta")
            ORDER BY random()
            LIMIT 3
        LOOP
            v_fecha := fila."fecha" + INTERVAL '3 hours';
            v_talla_nueva := CASE fila."talla" WHEN 'S' THEN 'M' WHEN 'M' THEN 'L' WHEN 'L' THEN 'XL' ELSE 'L' END;
            SELECT p."idProducto", i."idInv" INTO v_prod_nuevo, v_inv2
            FROM "producto" p JOIN "Inventario" i ON i."idProducto" = p."idProducto"
            WHERE p."idTenant" = t."idTenant" AND p."tipo" = 'Polera Oversize' AND p."color" = fila."color"
              AND p."talla" = v_talla_nueva AND i."codigoSucursal" = fila."codigoSucursal"
              AND i."cantidad_actual" - i."cantidad_reservada" >= 1
            LIMIT 1;

            UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" + 1 WHERE "idInv" = fila."idInv";
            INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv", "referencia")
            VALUES ('devolucion', 1, v_fecha, 'Devolucion venta ' || fila."idVenta", fila."idInv", 'DEV-' || fila."idVenta");

            IF v_prod_nuevo IS NOT NULL AND random() < 0.7 THEN
                UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" - 1 WHERE "idInv" = v_inv2;
                INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv", "referencia")
                VALUES ('cambio_talla', -1, v_fecha, 'Cambio de talla venta ' || fila."idVenta", v_inv2, 'CAM-' || fila."idVenta");
                INSERT INTO "devolucion" ("tipo", "cantidad", "motivo", "estado", "fecha", "fechaVenta", "tallaOriginal",
                                          "tallaNueva", "montoDevuelto", "idVenta", "idProducto", "idProductoNuevo",
                                          "idCliente", "codigoSucursal", "idUsuario", "idTenant")
                VALUES ('cambio_talla', 1, 'Le quedo chica, prefiere mas holgada', 'Completada', v_fecha, fila."fecha",
                        fila."talla", v_talla_nueva, 0, fila."idVenta", fila."idProducto", v_prod_nuevo,
                        fila."idCliente", fila."codigoSucursal", v_cajero, t."idTenant");
                v_motivo := 'cambio_talla';
            ELSE
                INSERT INTO "devolucion" ("tipo", "cantidad", "motivo", "estado", "fecha", "fechaVenta", "tallaOriginal",
                                          "montoDevuelto", "idVenta", "idProducto", "idCliente", "codigoSucursal",
                                          "idUsuario", "idTenant")
                VALUES ('devolucion', 1, 'No le convencio el color', 'Completada', v_fecha, fila."fecha", fila."talla",
                        fila."precio_unitario", fila."idVenta", fila."idProducto", fila."idCliente",
                        fila."codigoSucursal", v_cajero, t."idTenant");
                v_motivo := 'devolucion';
            END IF;
            v_local := v_fecha AT TIME ZONE 'America/La_Paz';
            INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
            VALUES (v_motivo || ' registrado sobre la venta ' || fila."idVenta" || ' (producto ' || fila."idProducto" || ')',
                    v_local::TIME, v_local::DATE, ('10.' || (t."idTenant" % 250) || '.' || (fila."codigoSucursal" % 250) || '.20')::INET, v_cajero);
            v_prod_nuevo := NULL;
            v_inv2 := NULL;
        END LOOP;

        -- 3e) Una merma: prenda con falla de fabrica dada de baja.
        SELECT i."idInv", i."cantidad_actual", i."codigoSucursal" INTO fila
        FROM "Inventario" i JOIN "Sucursal" su ON su."codigoSucursal" = i."codigoSucursal"
        WHERE su."idTenant" = t."idTenant" AND i."cantidad_actual" - i."cantidad_reservada" >= 8
        ORDER BY random() LIMIT 1;
        IF fila."idInv" IS NOT NULL THEN
            v_fecha := now() - INTERVAL '7 days';
            UPDATE "Inventario" SET "cantidad_actual" = "cantidad_actual" - 1 WHERE "idInv" = fila."idInv";
            INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv")
            VALUES ('ajuste', -1, v_fecha, 'Merma: prenda con falla de fabrica', fila."idInv");
            v_local := v_fecha AT TIME ZONE 'America/La_Paz';
            INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
            VALUES ('Ajuste de stock del inventario #' || fila."idInv" || ': ' || fila."cantidad_actual" || ' -> '
                    || (fila."cantidad_actual" - 1) || ' unidades (Merma: prenda con falla de fabrica)',
                    v_local::TIME, v_local::DATE, ('10.' || (t."idTenant" % 250) || '.' || (fila."codigoSucursal" % 250) || '.10')::INET, v_admin);
        END IF;

        -- ------------------------------------------------------------------
        -- 4) Bitacora de sesiones de TODO el personal de la empresa en los
        --    ultimos 150 dias (el Cajero no trabaja la mitad de los domingos).
        -- ------------------------------------------------------------------
        FOR u IN
            SELECT us."idUser", r."nombreRol" AS rol
            FROM "Usuario" us JOIN "rol" r ON r."codigoRol" = us."codigoRol"
            WHERE us."idTenant" = t."idTenant" AND r."nombreRol" <> 'Cliente'
        LOOP
            FOR v_d IN 0..150 LOOP
                v_dia := v_hoy - v_d;
                CONTINUE WHEN random() > CASE u.rol
                    WHEN 'Cajero' THEN CASE WHEN extract(isodow FROM v_dia) = 7 THEN 0.45 ELSE 0.9 END
                    WHEN 'Encargado de Sucursal' THEN 0.8
                    WHEN 'Administrador' THEN 0.7
                    WHEN 'Superadministrador' THEN 0.35
                    ELSE 0.08 END;
                v_fecha := (v_dia + make_interval(hours => 7 + floor(random() * 3)::INT, mins => floor(random() * 60)::INT))::TIMESTAMP
                           AT TIME ZONE 'America/La_Paz';
                CONTINUE WHEN v_fecha > now();
                v_ip := '10.' || (t."idTenant" % 250) || '.' || (u."idUser" % 250) || '.' || (2 + v_d % 200);
                IF random() < 0.08 THEN
                    v_local := (v_fecha - INTERVAL '1 minute') AT TIME ZONE 'America/La_Paz';
                    INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
                    VALUES ('Intento de inicio de sesion fallido', v_local::TIME, v_local::DATE, v_ip::INET, u."idUser");
                END IF;
                v_local := v_fecha AT TIME ZONE 'America/La_Paz';
                INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
                VALUES ('Inicio de sesion exitoso', v_local::TIME, v_local::DATE, v_ip::INET, u."idUser");
                IF random() < 0.55 THEN
                    v_fecha := v_fecha + make_interval(hours => 6 + floor(random() * 5)::INT);
                    IF v_fecha < now() THEN
                        v_local := v_fecha AT TIME ZONE 'America/La_Paz';
                        INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
                        VALUES ('Cierre de sesion', v_local::TIME, v_local::DATE, v_ip::INET, u."idUser");
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    -- Sesiones de los clientes de la vitrina (empresa 1): entran a mirar el
    -- catalogo, reservar o comprar en linea. Solo si todavia no tienen.
    FOR u IN
        SELECT us."idUser" FROM "Usuario" us JOIN "rol" r ON r."codigoRol" = us."codigoRol"
        WHERE r."nombreRol" = 'Cliente'
          AND NOT EXISTS (SELECT 1 FROM "Bitacora" b WHERE b."idUser" = us."idUser" AND b."accion" = 'Inicio de sesion exitoso')
    LOOP
        FOR v_d IN 0..150 LOOP
            CONTINUE WHEN random() > 0.12;
            v_fecha := ((v_hoy - v_d) + make_interval(hours => 12 + floor(random() * 10)::INT, mins => floor(random() * 60)::INT))::TIMESTAMP
                       AT TIME ZONE 'America/La_Paz';
            CONTINUE WHEN v_fecha > now();
            v_local := v_fecha AT TIME ZONE 'America/La_Paz';
            INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
            VALUES ('Inicio de sesion exitoso', v_local::TIME, v_local::DATE,
                    ('181.115.' || (1 + u."idUser" % 250) || '.' || (2 + v_d % 250))::INET, u."idUser");
        END LOOP;
    END LOOP;

    RAISE NOTICE '021: historia generada para % empresa(s)', v_empresas;
END
$$;
