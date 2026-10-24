-- 020_catalogo_oversize_y_empresas.sql
-- Cambio de oferta + nuevas empresas de demostracion.
--
-- 1) La tienda pasa a vender SOLO:
--      - Polera Oversize: Blanco, Negro, Guinda, Gris  | tallas S, M, L, XL
--      - Jeans:           Negro, Blanco                | tallas 28, 30, 32, 34, 36
--    Se BORRA el catalogo anterior (blazers, etc.) de TODAS las empresas junto
--    con su historial: ventas, detalle, historial de compras, reservas,
--    devoluciones, recomendaciones, movimientos e inventario de esos productos
--    y los metodos de pago que solo respaldaban esas ventas/reservas.
--    >>> NO SE PUEDE DESHACER: sacar un respaldo antes (consola de plataforma
--    >>> -> Respaldos, o pg_dump).
--
-- 2) Se agregan 15 empresas (tenants) con nombres de zonas de Bolivia, cada una
--    con su administrador, un cajero y sucursales dentro del cupo de su plan.
--    Con las 4 existentes quedan 19.
--
-- 3) Cada una de las 19 empresas recibe el catalogo nuevo (26 productos: 16
--    poleras + 10 jeans) con sus fotos (/productos/*.jpg, servidas por la web),
--    stock inicial en cada sucursal, ventas de los ultimos 30 dias y un par de
--    reservas para que el dashboard, los reportes y la app no arranquen vacios.
--
-- 4) Corrige el seed de base.sql, que asociaba el Cliente "Juan Perez" al
--    usuario del proveedor y el de "Maria Gomez" al usuario de Juan.
--
-- Contrasena de los usuarios nuevos: el MISMO hash que el resto del seed
-- (base.sql / 016).
--
-- Re-ejecutable: el borrado solo corre si quedan productos fuera de la oferta,
-- y cada carga (empresas, catalogo, ventas, reservas) se salta si ya existe.
-- Depende de 014 (tenant), 016 (empresas demo) y 010 (consumidoEn).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Ciudades que usan las empresas nuevas
-- ---------------------------------------------------------------------------
INSERT INTO "Ciudad" ("nombCiudad")
SELECT v.c
FROM (VALUES ('Cochabamba'), ('Sucre'), ('Tarija'), ('Potosí'), ('Oruro'), ('El Alto')) AS v(c)
WHERE NOT EXISTS (SELECT 1 FROM "Ciudad" x WHERE x."nombCiudad" = v.c);

-- ---------------------------------------------------------------------------
-- 1) Borrado del catalogo anterior y de todo lo que depende de el
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    n_productos INTEGER;
BEGIN
    CREATE TEMP TABLE _prod_viejos ON COMMIT DROP AS
        SELECT "idProducto" FROM "producto"
        WHERE "tipo" IS NULL OR "tipo" NOT IN ('Polera Oversize', 'Jeans');

    SELECT COUNT(*) INTO n_productos FROM _prod_viejos;
    IF n_productos = 0 THEN
        RAISE NOTICE '020: no quedan productos fuera de la oferta, no se borra nada';
        RETURN;
    END IF;

    CREATE TEMP TABLE _ventas_viejas ON COMMIT DROP AS
        SELECT DISTINCT "idVenta" FROM "detalle_venta"
        WHERE "idProducto" IN (SELECT "idProducto" FROM _prod_viejos);

    CREATE TEMP TABLE _reservas_viejas ON COMMIT DROP AS
        SELECT "codigoReserva" FROM "Reserva"
        WHERE "idProducto" IN (SELECT "idProducto" FROM _prod_viejos);

    CREATE TEMP TABLE _pagos_viejos ON COMMIT DROP AS
        SELECT "idMetPago" FROM "Venta" WHERE "idVenta" IN (SELECT "idVenta" FROM _ventas_viejas)
        UNION
        SELECT "idMetPago" FROM "Reserva"
        WHERE "codigoReserva" IN (SELECT "codigoReserva" FROM _reservas_viejas) AND "idMetPago" IS NOT NULL
        UNION
        SELECT "idMetPago" FROM "metodo_pago" WHERE "idProducto" IN (SELECT "idProducto" FROM _prod_viejos);

    DELETE FROM "devolucion"
    WHERE "idVenta" IN (SELECT "idVenta" FROM _ventas_viejas)
       OR "idProducto" IN (SELECT "idProducto" FROM _prod_viejos)
       OR "idProductoNuevo" IN (SELECT "idProducto" FROM _prod_viejos);

    -- Las recomendaciones sin producto (texto libre del seed viejo, ej.
    -- "Combinacion con Jeans Slim Fit") tambien hablan del catalogo anterior.
    DELETE FROM "Recomendaciones"
    WHERE "idProducto" IS NULL OR "idProducto" IN (SELECT "idProducto" FROM _prod_viejos);

    DELETE FROM "historial"
    WHERE "idVenta" IN (SELECT "idVenta" FROM _ventas_viejas)
       OR "idProducto" IN (SELECT "idProducto" FROM _prod_viejos);

    DELETE FROM "detalle_venta" WHERE "idVenta" IN (SELECT "idVenta" FROM _ventas_viejas);
    DELETE FROM "Venta" WHERE "idVenta" IN (SELECT "idVenta" FROM _ventas_viejas);
    DELETE FROM "Reserva" WHERE "codigoReserva" IN (SELECT "codigoReserva" FROM _reservas_viejas);

    -- Solo los pagos que ya no respalda ninguna venta/reserva restante.
    DELETE FROM "metodo_pago" mp
    WHERE mp."idMetPago" IN (SELECT "idMetPago" FROM _pagos_viejos)
      AND NOT EXISTS (SELECT 1 FROM "Venta" v WHERE v."idMetPago" = mp."idMetPago")
      AND NOT EXISTS (SELECT 1 FROM "Reserva" r WHERE r."idMetPago" = mp."idMetPago");

    DELETE FROM "Movimiento"
    WHERE "idInv" IN (SELECT "idInv" FROM "Inventario" WHERE "idProducto" IN (SELECT "idProducto" FROM _prod_viejos));
    DELETE FROM "Inventario" WHERE "idProducto" IN (SELECT "idProducto" FROM _prod_viejos);
    DELETE FROM "producto" WHERE "idProducto" IN (SELECT "idProducto" FROM _prod_viejos);

    -- Colecciones/temporadas del catalogo anterior que quedaron vacias.
    DELETE FROM "Colecciones" c
    WHERE NOT EXISTS (SELECT 1 FROM "producto" p WHERE p."idColeccion" = c."idColeccion");
    DELETE FROM "Temporada" t
    WHERE NOT EXISTS (SELECT 1 FROM "Colecciones" c WHERE c."idTemporada" = t."idTemporada");

    RAISE NOTICE '020: borrados % productos del catalogo anterior', n_productos;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) Empresas nuevas (cupo de sucursales: Free Lite 1, Basico 2, Intermedio 5)
-- ---------------------------------------------------------------------------
-- Sin tablas temporales entre sentencias: el SQL Editor de Supabase ejecuta
-- cada sentencia por separado (ignora el BEGIN), asi que una tabla
-- temporal "ON COMMIT DROP" desaparecia apenas se creaba.
INSERT INTO "tenant" ("nombre", "slug", "estado", "idPlan")
SELECT e.nombre, e.slug, 'Activo', p."idPlan"
FROM (
    VALUES
        ('Cristo Redentor',  'cristo-redentor',  'basico'),
        ('Las Palmas',       'las-palmas',       'free_lite'),
        ('Urbarí',           'urbari',           'basico'),
        ('Los Pozos',        'los-pozos',        'free_lite'),
        ('San Miguel',       'san-miguel',       'intermedio'),
        ('Miraflores',       'miraflores',       'basico'),
        ('Achumani',         'achumani',         'free_lite'),
        ('Obrajes',          'obrajes',          'basico'),
        ('Cala Cala',        'cala-cala',        'intermedio'),
        ('Queru Queru',      'queru-queru',      'basico'),
        ('Ciudad Satélite',  'ciudad-satelite',  'basico'),
        ('La Recoleta',      'la-recoleta',      'free_lite'),
        ('San Roque',        'san-roque',        'basico'),
        ('Cerro Rico',       'cerro-rico',       'free_lite'),
        ('El Socavón',       'el-socavon',       'avanzado')
) AS e(nombre, slug, plan_codigo)
JOIN "plan" p ON p."codigo" = e.plan_codigo
WHERE NOT EXISTS (SELECT 1 FROM "tenant" t WHERE t."slug" = e.slug);

-- Administrador y cajero de cada empresa nueva (mismo hash que el seed).
-- Correo: admin@<slug sin guiones>.bo, ej. admin@calacala.bo.
INSERT INTO "Usuario" ("nombre", "correo", "contraseña", "codigoRol", "idTenant")
SELECT u.nombre, u.correo,
       '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C',
       r."codigoRol", u."idTenant"
FROM (
    SELECT 'Admin ' || t."nombre" AS nombre,
           'admin@' || replace(t."slug", '-', '') || '.bo' AS correo,
           'Administrador' AS rol, t."idTenant"
    FROM "tenant" t
    UNION ALL
    SELECT 'Cajero ' || t."nombre",
           'cajero@' || replace(t."slug", '-', '') || '.bo',
           'Cajero', t."idTenant"
    FROM "tenant" t
) u
JOIN "rol" r ON r."nombreRol" = u.rol
WHERE u."idTenant" IN (
    SELECT "idTenant" FROM "tenant"
    WHERE "slug" IN ('cristo-redentor', 'las-palmas', 'urbari', 'los-pozos', 'san-miguel', 'miraflores',
                     'achumani', 'obrajes', 'cala-cala', 'queru-queru', 'ciudad-satelite', 'la-recoleta',
                     'san-roque', 'cerro-rico', 'el-socavon')
)
  AND NOT EXISTS (SELECT 1 FROM "Usuario" x WHERE lower(x."correo") = lower(u.correo));

INSERT INTO "Sucursal" ("nombre", "direccion", "idCiudad", "idTenant")
SELECT s.nombre, s.direccion, c."idCiudad", t."idTenant"
FROM (
    VALUES
        ('Cristo Redentor 4to Anillo',  'Av. Cristo Redentor #2450, 4to anillo', 'Santa Cruz de la Sierra', 'cristo-redentor'),
        ('Cristo Redentor Norte',       'Av. Cristo Redentor #5100, 7mo anillo', 'Santa Cruz de la Sierra', 'cristo-redentor'),
        ('Las Palmas Doble Vía',        'Av. Doble Vía La Guardia #340',         'Santa Cruz de la Sierra', 'las-palmas'),
        ('Urbarí Centro',               'Calle Urbarí #120',                     'Santa Cruz de la Sierra', 'urbari'),
        ('Urbarí Av. Piraí',            'Av. Piraí #880',                        'Santa Cruz de la Sierra', 'urbari'),
        ('Los Pozos Mercado',           'Calle Quijarro #455',                   'Santa Cruz de la Sierra', 'los-pozos'),
        ('San Miguel Montenegro',       'Av. Montenegro #1220',                  'La Paz',                  'san-miguel'),
        ('San Miguel Calle 21',         'Calle 21 de San Miguel #8150',          'La Paz',                  'san-miguel'),
        ('San Miguel Ballivián',        'Av. Ballivián #1500',                   'La Paz',                  'san-miguel'),
        ('Miraflores Saavedra',         'Av. Saavedra #2100',                    'La Paz',                  'miraflores'),
        ('Miraflores Busch',            'Av. Busch #1890',                       'La Paz',                  'miraflores'),
        ('Achumani Calle 16',           'Calle 16 de Achumani #340',             'La Paz',                  'achumani'),
        ('Obrajes Calle 5',             'Av. Hernando Siles esq. Calle 5 #4800', 'La Paz',                  'obrajes'),
        ('Cala Cala Av. América',       'Av. América #1050',                     'Cochabamba',              'cala-cala'),
        ('Cala Cala Plaza Quintanilla', 'Av. Simón López #345',                  'Cochabamba',              'cala-cala'),
        ('Queru Queru Av. Santa Cruz',  'Av. Santa Cruz #1460',                  'Cochabamba',              'queru-queru'),
        ('Satélite Plan 561',           'Av. Satélite #750',                     'El Alto',                 'ciudad-satelite'),
        ('Satélite Villa Adela',        'Av. Bolivia #2300',                     'El Alto',                 'ciudad-satelite'),
        ('La Recoleta Centro',          'Calle Dalence #210',                    'Sucre',                   'la-recoleta'),
        ('San Roque Plazuela',          'Calle General Trigo #640',              'Tarija',                  'san-roque'),
        ('Cerro Rico Calle Bolívar',    'Calle Bolívar #870',                    'Potosí',                  'cerro-rico'),
        ('El Socavón Plaza',            'Av. Cívica #120',                       'Oruro',                   'el-socavon'),
        ('El Socavón Norte',            'Av. 6 de Agosto #2350',                 'Oruro',                   'el-socavon'),
        ('El Socavón Terminal',         'Calle Rajka Bakovic #45',               'Oruro',                   'el-socavon')
) AS s(nombre, direccion, ciudad, slug)
JOIN "tenant" t ON t."slug" = s.slug
JOIN "Ciudad" c ON c."nombCiudad" = s.ciudad
WHERE NOT EXISTS (
    SELECT 1 FROM "Sucursal" x WHERE x."nombre" = s.nombre AND x."idTenant" = t."idTenant"
);

-- ---------------------------------------------------------------------------
-- 3) Clientes de demostracion (los clientes se registran en la vitrina, que
--    es la empresa 1) y correccion del seed de base.sql.
-- ---------------------------------------------------------------------------
-- base.sql: el Cliente "Maria Gomez" apuntaba al usuario de Juan y el de
-- "Juan Perez" al usuario del proveedor. Primero se mueve Maria (libera el
-- usuario de Juan) y despues Juan; cada paso solo si el usuario destino esta
-- libre (Cliente.idUser es UNIQUE).
UPDATE "Cliente" c SET "idUser" = u."idUser"
FROM "Usuario" u
WHERE c."nombre" = 'Maria Gomez Cliente' AND u."correo" = 'maria.gomez@gmail.com'
  AND c."idUser" <> u."idUser"
  AND NOT EXISTS (SELECT 1 FROM "Cliente" x WHERE x."idUser" = u."idUser");
UPDATE "Cliente" c SET "idUser" = u."idUser"
FROM "Usuario" u
WHERE c."nombre" = 'Juan Pérez Cliente' AND u."correo" = 'juan.perez@gmail.com'
  AND c."idUser" <> u."idUser"
  AND NOT EXISTS (SELECT 1 FROM "Cliente" x WHERE x."idUser" = u."idUser");

INSERT INTO "Usuario" ("nombre", "correo", "contraseña", "codigoRol", "idTenant")
SELECT v.nombre, v.correo,
       '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C',
       r."codigoRol", 1
FROM (
    VALUES
        ('Carla Mendoza',  'carla.mendoza@gmail.com'),
        ('Diego Rojas',    'diego.rojas@gmail.com'),
        ('Valeria Quispe', 'valeria.quispe@gmail.com'),
        ('Andrés Suárez',  'andres.suarez@gmail.com'),
        ('Camila Vargas',  'camila.vargas@gmail.com'),
        ('Luis Choque',    'luis.choque@gmail.com')
) AS v(nombre, correo)
JOIN "rol" r ON r."nombreRol" = 'Cliente'
WHERE NOT EXISTS (SELECT 1 FROM "Usuario" x WHERE lower(x."correo") = lower(v.correo));

INSERT INTO "Cliente" ("nombre", "telefono", "direccion", "idUser")
SELECT u."nombre", v.telefono, v.direccion, u."idUser"
FROM (
    VALUES
        ('carla.mendoza@gmail.com',  '+591 70011223', 'Av. Beni #455, Santa Cruz'),
        ('diego.rojas@gmail.com',    '+591 71122334', 'Calle Sagárnaga #210, La Paz'),
        ('valeria.quispe@gmail.com', '+591 72233445', 'Av. Juan Pablo II #1800, El Alto'),
        ('andres.suarez@gmail.com',  '+591 73344556', 'Av. Pando #900, Cochabamba'),
        ('camila.vargas@gmail.com',  '+591 74455667', 'Calle Arenales #75, Sucre'),
        ('luis.choque@gmail.com',    '+591 75566778', 'Av. 6 de Agosto #1300, Oruro')
) AS v(correo, telefono, direccion)
JOIN "Usuario" u ON u."correo" = v.correo
WHERE NOT EXISTS (SELECT 1 FROM "Cliente" x WHERE x."idUser" = u."idUser");

-- ---------------------------------------------------------------------------
-- 4) Catalogo nuevo, stock, ventas y reservas para cada empresa
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t RECORD;
    s RECORD;
    v_prov_polera INTEGER;
    v_prov_jeans INTEGER;
    v_temporada INTEGER;
    v_col_polera INTEGER;
    v_col_jeans INTEGER;
    v_clientes INTEGER[];
    v_cajero INTEGER;
    v_ventas_por_sucursal INTEGER;
    v_fecha TIMESTAMPTZ;
    v_pago INTEGER;
    v_venta INTEGER;
    v_total NUMERIC(12, 2);
    v_lineas INTEGER;
    v_prod RECORD;
    v_inv INTEGER;
    v_cant INTEGER;
    v_cliente INTEGER;
    v_k INTEGER;
    v_l INTEGER;
    v_reserva_estado TEXT;
BEGIN
    -- Pseudoaleatorio REPRODUCIBLE: la misma base produce los mismos datos.
    PERFORM setseed(0.2026);

    SELECT array_agg("idCliente" ORDER BY "idCliente") INTO v_clientes FROM "Cliente";

    FOR t IN SELECT "idTenant", "nombre" FROM "tenant" ORDER BY "idTenant" LOOP

        -- 4.1 Catalogo (solo si la empresa todavia no lo tiene) -----------
        IF NOT EXISTS (
            SELECT 1 FROM "producto" WHERE "idTenant" = t."idTenant" AND "tipo" IN ('Polera Oversize', 'Jeans')
        ) THEN
            INSERT INTO "Proveedor" ("nombre", "telefono", "correo", "idTenant")
            VALUES ('Textiles Andinos S.A.', '+591 33445566', 'ventas@textilesandinos.bo', t."idTenant")
            RETURNING "idProveedor" INTO v_prov_polera;
            INSERT INTO "Proveedor" ("nombre", "telefono", "correo", "idTenant")
            VALUES ('Denim Bolivia SRL', '+591 44556677', 'pedidos@denimbolivia.bo', t."idTenant")
            RETURNING "idProveedor" INTO v_prov_jeans;

            INSERT INTO "Temporada" ("nombreTemporada", "fecha_ini", "fecha_fin", "idTenant")
            VALUES ('Colección Esencial 2026', DATE '2026-01-01', DATE '2026-12-31', t."idTenant")
            RETURNING "idTemporada" INTO v_temporada;

            INSERT INTO "Colecciones" ("nombre_coleccion", "idTemporada", "idTenant")
            VALUES ('Poleras Oversize', v_temporada, t."idTenant")
            RETURNING "idColeccion" INTO v_col_polera;
            INSERT INTO "Colecciones" ("nombre_coleccion", "idTemporada", "idTenant")
            VALUES ('Jeans', v_temporada, t."idTenant")
            RETURNING "idColeccion" INTO v_col_jeans;

            -- Orden de insercion: jeans primero y poleras al final, ambos al
            -- reves. El catalogo se lista del idProducto mas alto al mas bajo,
            -- asi la tienda arranca con la Polera Oversize Blanca talla S.
            INSERT INTO "producto" (
                "nombre", "descripcion", "costo", "venta", "tipo", "talla", "color",
                "idProveedor", "idColeccion", "imagen_url", "imagenes_secundarias", "idTenant"
            )
            SELECT 'Jeans ' || c.color,
                   'Jean unisex de tiro medio y pierna recta. Denim de 13 oz (98% algodón, '
                   || '2% elastano), cinco bolsillos y botón metálico.',
                   110.00, 260.00, 'Jeans', ta.talla, c.color,
                   v_prov_jeans, v_col_jeans,
                   '/productos/jeans-' || c.slug || '.jpg',
                   ARRAY['/productos/jeans-' || c.slug || '-espalda.jpg'],
                   t."idTenant"
            FROM (VALUES ('Negro', 'negro', 1), ('Blanco', 'blanco', 2)) AS c(color, slug, orden)
            CROSS JOIN (VALUES ('28', 1), ('30', 2), ('32', 3), ('34', 4), ('36', 5)) AS ta(talla, orden)
            ORDER BY c.orden DESC, ta.orden DESC;

            INSERT INTO "producto" (
                "nombre", "descripcion", "costo", "venta", "tipo", "talla", "color",
                "idProveedor", "idColeccion", "imagen_url", "imagenes_secundarias", "idTenant"
            )
            SELECT 'Polera Oversize ' || c.adjetivo,
                   'Polera oversize unisex de hombro caído, cuerpo amplio y manga al codo. '
                   || 'Algodón peinado 100%, jersey de 240 g/m², cuello redondo acanalado.',
                   48.00, 120.00, 'Polera Oversize', ta.talla, c.color,
                   v_prov_polera, v_col_polera,
                   '/productos/polera-oversize-' || c.slug || '.jpg',
                   ARRAY['/productos/polera-oversize-' || c.slug || '-espalda.jpg'],
                   t."idTenant"
            FROM (VALUES ('Blanco', 'Blanca', 'blanca', 1), ('Negro', 'Negra', 'negra', 2),
                         ('Guinda', 'Guinda', 'guinda', 3), ('Gris', 'Gris', 'gris', 4)) AS c(color, adjetivo, slug, orden)
            CROSS JOIN (VALUES ('S', 1), ('M', 2), ('L', 3), ('XL', 4)) AS ta(talla, orden)
            ORDER BY c.orden DESC, ta.orden DESC;

            -- Stock inicial en cada sucursal de la empresa (12 a 41 unidades).
            INSERT INTO "Inventario" ("cantidad_actual", "cantidad_reservada", "codigoSucursal", "idProducto")
            SELECT 12 + ((p."idProducto" * 7 + su."codigoSucursal" * 13) % 30), 0, su."codigoSucursal", p."idProducto"
            FROM "producto" p
            JOIN "Sucursal" su ON su."idTenant" = p."idTenant"
            WHERE p."idTenant" = t."idTenant"
              AND p."tipo" IN ('Polera Oversize', 'Jeans')
              AND NOT EXISTS (
                  SELECT 1 FROM "Inventario" i
                  WHERE i."codigoSucursal" = su."codigoSucursal" AND i."idProducto" = p."idProducto"
              );

            INSERT INTO "Movimiento" ("tipo", "cantidad", "fecha", "motivo", "idInv")
            SELECT 'entrada_lote', i."cantidad_actual", now() - INTERVAL '35 days',
                   'Ingreso de lote inicial - Colección Esencial 2026', i."idInv"
            FROM "Inventario" i
            JOIN "producto" p ON p."idProducto" = i."idProducto"
            WHERE p."idTenant" = t."idTenant" AND p."tipo" IN ('Polera Oversize', 'Jeans');
        END IF;

        -- 4.2 Ventas de ejemplo de los ultimos 30 dias (solo si la empresa
        --     no tiene ventas de su catalogo) ------------------------------
        IF v_clientes IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "detalle_venta" dv
            JOIN "producto" p ON p."idProducto" = dv."idProducto"
            WHERE p."idTenant" = t."idTenant"
        ) THEN
            SELECT u."idUser" INTO v_cajero
            FROM "Usuario" u JOIN "rol" r ON r."codigoRol" = u."codigoRol"
            WHERE u."idTenant" = t."idTenant" AND r."nombreRol" IN ('Cajero', 'Administrador')
            ORDER BY (r."nombreRol" = 'Cajero') DESC, u."idUser"
            LIMIT 1;

            SELECT CASE WHEN pl."codigo" IN ('intermedio', 'avanzado') THEN 14 ELSE 9 END
            INTO v_ventas_por_sucursal
            FROM "tenant" te JOIN "plan" pl ON pl."idPlan" = te."idPlan"
            WHERE te."idTenant" = t."idTenant";

            FOR s IN SELECT "codigoSucursal", "nombre" FROM "Sucursal" WHERE "idTenant" = t."idTenant" ORDER BY "codigoSucursal" LOOP
                FOR v_k IN 1..v_ventas_por_sucursal LOOP
                    v_fecha := date_trunc('day', now() - make_interval(days => (floor(random() * 30))::INT))
                               + make_interval(hours => 9 + (floor(random() * 10))::INT,
                                               mins => (floor(random() * 60))::INT);
                    IF v_fecha > now() THEN
                        v_fecha := now() - INTERVAL '1 hour';
                    END IF;
                    v_cliente := v_clientes[1 + floor(random() * array_length(v_clientes, 1))::INT];

                    INSERT INTO "metodo_pago" ("tipo", "estado", "fecha", "monto", "consumidoEn")
                    VALUES (CASE WHEN random() < 0.6 THEN 'Efectivo' ELSE 'QR / Transferencia' END,
                            'Activo', v_fecha, 0, v_fecha)
                    RETURNING "idMetPago" INTO v_pago;

                    INSERT INTO "Venta" ("fecha", "total", "idCliente", "idMetPago")
                    VALUES (v_fecha, 0, v_cliente, v_pago)
                    RETURNING "idVenta" INTO v_venta;

                    v_total := 0;
                    v_lineas := 0;
                    FOR v_l IN 1..(1 + floor(random() * 2))::INT LOOP
                        -- Las poleras se venden mas que los jeans (~70/30).
                        SELECT p."idProducto", p."venta" INTO v_prod
                        FROM "producto" p
                        WHERE p."idTenant" = t."idTenant"
                          AND p."tipo" = CASE WHEN random() < 0.7 THEN 'Polera Oversize' ELSE 'Jeans' END
                          AND NOT EXISTS (
                              SELECT 1 FROM "detalle_venta" d WHERE d."idVenta" = v_venta AND d."idProducto" = p."idProducto"
                          )
                        ORDER BY random()
                        LIMIT 1;
                        CONTINUE WHEN v_prod."idProducto" IS NULL;

                        v_cant := CASE WHEN random() < 0.8 THEN 1 ELSE 2 END;

                        UPDATE "Inventario"
                        SET "cantidad_actual" = "cantidad_actual" - v_cant
                        WHERE "codigoSucursal" = s."codigoSucursal"
                          AND "idProducto" = v_prod."idProducto"
                          AND "cantidad_actual" - "cantidad_reservada" >= v_cant
                        RETURNING "idInv" INTO v_inv;
                        CONTINUE WHEN v_inv IS NULL;

                        INSERT INTO "detalle_venta" ("cantidad", "precio_unitario", "idProducto", "idVenta")
                        VALUES (v_cant, v_prod."venta", v_prod."idProducto", v_venta);
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
                        IF v_cajero IS NOT NULL THEN
                            INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser")
                            VALUES ('Venta ' || v_venta || ' creada', v_fecha::TIME, v_fecha::DATE,
                                    ('10.0.' || (t."idTenant" % 250) || '.' || (s."codigoSucursal" % 250))::INET, v_cajero);
                        END IF;
                    END IF;
                END LOOP;
            END LOOP;
        END IF;

        -- 4.3 Reservas de ejemplo: una Pendiente y una Preparada por empresa,
        --     con anticipo del 10% ya cobrado y la unidad reservada -----------
        IF v_clientes IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "Reserva" r JOIN "Sucursal" su ON su."codigoSucursal" = r."codigoSucursal"
            WHERE su."idTenant" = t."idTenant"
        ) THEN
            FOREACH v_reserva_estado IN ARRAY ARRAY['Pendiente', 'Preparada en Sucursal'] LOOP
                SELECT i."idInv", i."codigoSucursal", p."idProducto", p."venta"
                INTO v_prod
                FROM "Inventario" i
                JOIN "producto" p ON p."idProducto" = i."idProducto"
                JOIN "Sucursal" su ON su."codigoSucursal" = i."codigoSucursal"
                WHERE su."idTenant" = t."idTenant" AND i."cantidad_actual" - i."cantidad_reservada" > 0
                ORDER BY random()
                LIMIT 1;
                CONTINUE WHEN v_prod."idInv" IS NULL;

                v_cliente := v_clientes[1 + floor(random() * array_length(v_clientes, 1))::INT];
                v_fecha := now() - make_interval(days => 1 + (floor(random() * 3))::INT);

                INSERT INTO "metodo_pago" ("tipo", "estado", "fecha", "monto", "origen",
                                           "idProducto", "codigoSucursal", "consumidoEn")
                VALUES ('QR / Transferencia', 'Activo', v_fecha, round(v_prod."venta" * 0.10, 2), NULL,
                        v_prod."idProducto", v_prod."codigoSucursal", v_fecha)
                RETURNING "idMetPago" INTO v_pago;

                INSERT INTO "Reserva" ("fecha", "horario", "estado", "idCliente", "codigoSucursal",
                                       "idProducto", "idMetPago", "montoDeposito")
                VALUES ((now() + make_interval(days => 1 + (floor(random() * 5))::INT))::DATE,
                        TIME '10:00' + make_interval(hours => (floor(random() * 8))::INT),
                        v_reserva_estado, v_cliente, v_prod."codigoSucursal",
                        v_prod."idProducto", v_pago, round(v_prod."venta" * 0.10, 2));

                UPDATE "Inventario" SET "cantidad_reservada" = "cantidad_reservada" + 1
                WHERE "idInv" = v_prod."idInv";
            END LOOP;
        END IF;
    END LOOP;

    -- 4.4 Recomendaciones iniciales de los clientes (catalogo de la vitrina,
    --     empresa 1). Despues las regenera Gemini tras cada compra. --------
    INSERT INTO "Recomendaciones" ("nombre", "importancia", "idCliente", "idProducto")
    SELECT p."nombre", x.importancia, c."idCliente", p."idProducto"
    FROM "Cliente" c
    CROSS JOIN LATERAL (
        SELECT DISTINCT ON (p2."nombre") p2."idProducto", p2."nombre"
        FROM "producto" p2
        WHERE p2."idTenant" = 1 AND p2."talla" IN ('M', '32')
        ORDER BY p2."nombre", p2."idProducto"
    ) p
    CROSS JOIN LATERAL (
        SELECT CASE (abs(hashtext(c."idCliente"::TEXT || p."nombre")::BIGINT) % 3)
                   WHEN 0 THEN 'Alta' WHEN 1 THEN 'Media' ELSE 'Baja' END AS importancia,
               abs(hashtext(p."nombre" || c."idCliente"::TEXT)::BIGINT) AS orden
    ) x
    WHERE NOT EXISTS (SELECT 1 FROM "Recomendaciones" r WHERE r."idCliente" = c."idCliente")
      AND x.orden % 2 = 0;
END
$$;

COMMIT;

-- Verificacion rapida (opcional):
--   SELECT t."nombre", pl."codigo",
--          (SELECT COUNT(*) FROM "Sucursal" s WHERE s."idTenant" = t."idTenant") AS sucursales,
--          (SELECT COUNT(*) FROM "producto" p WHERE p."idTenant" = t."idTenant") AS productos
--   FROM "tenant" t JOIN "plan" pl ON pl."idPlan" = t."idPlan" ORDER BY t."idTenant";
