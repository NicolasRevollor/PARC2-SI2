CREATE TABLE "Ciudad" (
    "idCiudad" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombCiudad" VARCHAR(100) NOT NULL
);
CREATE INDEX "idx_ciudad_nombre" ON "Ciudad" ("nombCiudad");

CREATE TABLE "permiso" (
    "idPermiso" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombrePermiso" VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE "rol" (
    "codigoRol" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombreRol" VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE "Proveedor" (
    "idProveedor" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombre" VARCHAR(100) NOT NULL,
    "telefono" VARCHAR(20),
    "correo" VARCHAR(100)
);
CREATE INDEX "idx_proveedor_nombre" ON "Proveedor" ("nombre");

CREATE TABLE "Temporada" (
    "idTemporada" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombreTemporada" VARCHAR(100) NOT NULL,
    "fecha_ini" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    CONSTRAINT "chk_temporada_fechas" CHECK ("fecha_fin" >= "fecha_ini")
);
CREATE INDEX "idx_temporada_fechas" ON "Temporada" ("fecha_ini", "fecha_fin");

CREATE TABLE "metodo_pago" (
    "idMetPago" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "tipo" VARCHAR(50) NOT NULL,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'Activo',
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT "chk_metodo_monto" CHECK ("monto" >= 0)
);

CREATE TABLE "asignacion_permiso" (
    "idRolPermiso" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "fechaAsignacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'Activo',
    "codigoRol" INT NOT NULL,
    "idPermiso" INT NOT NULL,
    CONSTRAINT "fk_asig_rol" FOREIGN KEY ("codigoRol") REFERENCES "rol"("codigoRol") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_asig_permiso" FOREIGN KEY ("idPermiso") REFERENCES "permiso"("idPermiso") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "uq_rol_permiso" UNIQUE ("codigoRol", "idPermiso")
);

CREATE TABLE "Usuario" (
    "idUser" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombre" VARCHAR(100) NOT NULL,
    "correo" VARCHAR(100) NOT NULL UNIQUE,
    "contraseña" VARCHAR(255) NOT NULL,
    "codigoRol" INT NOT NULL,
    CONSTRAINT "fk_usuario_rol" FOREIGN KEY ("codigoRol") REFERENCES "rol"("codigoRol") ON UPDATE CASCADE
);

CREATE TABLE "Sucursal" (
    "codigoSucursal" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombre" VARCHAR(100) NOT NULL,
    "direccion" VARCHAR(255) NOT NULL,
    "idCiudad" INT NOT NULL,
    CONSTRAINT "fk_sucursal_ciudad" FOREIGN KEY ("idCiudad") REFERENCES "Ciudad"("idCiudad") ON UPDATE CASCADE
);
CREATE INDEX "idx_sucursal_ciudad" ON "Sucursal" ("idCiudad");

CREATE TABLE "Colecciones" (
    "idColeccion" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombre_coleccion" VARCHAR(100) NOT NULL,
    "idTemporada" INT NOT NULL,
    CONSTRAINT "fk_coleccion_temporada" FOREIGN KEY ("idTemporada") REFERENCES "Temporada"("idTemporada") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "idx_coleccion_temporada" ON "Colecciones" ("idTemporada");

CREATE TABLE "Cliente" (
    "idCliente" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombre" VARCHAR(100) NOT NULL,
    "telefono" VARCHAR(20),
    "direccion" VARCHAR(255),
    "idUser" INT NOT NULL UNIQUE,
    CONSTRAINT "fk_cliente_usuario" FOREIGN KEY ("idUser") REFERENCES "Usuario"("idUser") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Bitacora" (
    "idBitacora" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "accion" VARCHAR(150) NOT NULL,
    "hora" TIME NOT NULL,
    "fecha" DATE NOT NULL,
    "ip" INET NOT NULL,
    "idUser" INT NOT NULL,
    CONSTRAINT "fk_bitacora_usuario" FOREIGN KEY ("idUser") REFERENCES "Usuario"("idUser") ON DELETE CASCADE
);
CREATE INDEX "idx_bitacora_fecha_user" ON "Bitacora" ("fecha", "idUser");

CREATE TABLE "producto" (
    "idProducto" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "costo" NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    "venta" NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    "tipo" VARCHAR(50),
    "talla" VARCHAR(20),
    "color" VARCHAR(50),
    "idProveedor" INT NOT NULL,
    "idColeccion" INT NOT NULL,
    CONSTRAINT "chk_producto_precios" CHECK ("venta" >= 0 AND "costo" >= 0),
    CONSTRAINT "fk_producto_proveedor" FOREIGN KEY ("idProveedor") REFERENCES "Proveedor"("idProveedor") ON UPDATE CASCADE,
    CONSTRAINT "fk_producto_coleccion" FOREIGN KEY ("idColeccion") REFERENCES "Colecciones"("idColeccion") ON UPDATE CASCADE
);
CREATE INDEX "idx_producto_busqueda" ON "producto" ("nombre", "tipo", "talla", "color");
CREATE INDEX "idx_producto_proveedor" ON "producto" ("idProveedor");
CREATE INDEX "idx_producto_coleccion" ON "producto" ("idColeccion");

CREATE TABLE "Recomendaciones" (
    "idRecomendacion" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "nombre" VARCHAR(100) NOT NULL,
    "importancia" VARCHAR(30) DEFAULT 'Media',
    "idCliente" INT NOT NULL,
    CONSTRAINT "fk_recomendacion_cliente" FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "idx_recomendacion_cliente" ON "Recomendaciones" ("idCliente");

CREATE TABLE "Reserva" (
    "codigoReserva" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "fecha" DATE NOT NULL,
    "horario" TIME NOT NULL,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
    "idCliente" INT NOT NULL,
    "codigoSucursal" INT NOT NULL,
    "idProducto" INT NOT NULL,
    CONSTRAINT "fk_reserva_cliente" FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,
    CONSTRAINT "fk_reserva_sucursal" FOREIGN KEY ("codigoSucursal") REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,
    CONSTRAINT "fk_reserva_producto" FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE
);
CREATE INDEX "idx_reserva_cliente" ON "Reserva" ("idCliente");
CREATE INDEX "idx_reserva_estado_fecha" ON "Reserva" ("estado", "fecha");

CREATE TABLE "Inventario" (
    "idInv" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "cantidad_actual" INT NOT NULL DEFAULT 0,
    "cantidad_reservada" INT NOT NULL DEFAULT 0,
    "codigoSucursal" INT NOT NULL,
    "idProducto" INT NOT NULL,
    CONSTRAINT "chk_inv_cantidades" CHECK ("cantidad_actual" >= 0 AND "cantidad_reservada" >= 0),
    CONSTRAINT "fk_inv_sucursal" FOREIGN KEY ("codigoSucursal") REFERENCES "Sucursal"("codigoSucursal") ON UPDATE CASCADE,
    CONSTRAINT "fk_inv_producto" FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,
    CONSTRAINT "uq_sucursal_producto" UNIQUE ("codigoSucursal", "idProducto")
);

CREATE TABLE "Movimiento" (
    "idMov" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "tipo" VARCHAR(50) NOT NULL,
    "cantidad" INT NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" VARCHAR(255),
    "idInv" INT NOT NULL,
    CONSTRAINT "fk_movimiento_inventario" FOREIGN KEY ("idInv") REFERENCES "Inventario"("idInv") ON UPDATE CASCADE
);
CREATE INDEX "idx_movimiento_inv_fecha" ON "Movimiento" ("idInv", "fecha");

CREATE TABLE "Venta" (
    "idVenta" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    "idCliente" INT NOT NULL,
    "idMetPago" INT NOT NULL,
    CONSTRAINT "chk_venta_total" CHECK ("total" >= 0),
    CONSTRAINT "fk_venta_cliente" FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,
    CONSTRAINT "fk_venta_pago" FOREIGN KEY ("idMetPago") REFERENCES "metodo_pago"("idMetPago") ON UPDATE CASCADE
);
CREATE INDEX "idx_venta_fecha" ON "Venta" ("fecha");
CREATE INDEX "idx_venta_cliente" ON "Venta" ("idCliente");

CREATE TABLE "detalle_venta" (
    "codigoVenta" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "cantidad" INT NOT NULL,
    "precio_unitario" NUMERIC(12,2) NOT NULL,
    "idProducto" INT NOT NULL,
    "idVenta" INT NOT NULL,
    "codigoReserva" INT NULL,
    CONSTRAINT "chk_detalle_cantidad" CHECK ("cantidad" > 0),
    CONSTRAINT "fk_detalle_producto" FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,
    CONSTRAINT "fk_detalle_venta" FOREIGN KEY ("idVenta") REFERENCES "Venta"("idVenta") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_detalle_reserva" FOREIGN KEY ("codigoReserva") REFERENCES "Reserva"("codigoReserva") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "idx_detalle_venta" ON "detalle_venta" ("idVenta");
CREATE INDEX "idx_detalle_producto" ON "detalle_venta" ("idProducto");

CREATE TABLE "historial" (
    "codigoHistorial" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idProducto" INT NOT NULL,
    "idCliente" INT NOT NULL,
    "idVenta" INT NOT NULL,
    CONSTRAINT "fk_historial_producto" FOREIGN KEY ("idProducto") REFERENCES "producto"("idProducto") ON UPDATE CASCADE,
    CONSTRAINT "fk_historial_cliente" FOREIGN KEY ("idCliente") REFERENCES "Cliente"("idCliente") ON UPDATE CASCADE,
    CONSTRAINT "fk_historial_venta" FOREIGN KEY ("idVenta") REFERENCES "Venta"("idVenta") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "idx_historial_busqueda" ON "historial" ("idCliente", "idProducto");

INSERT INTO "permiso" ("nombrePermiso") VALUES
('GESTION_GLOBAL_SISTEMA'),     
('GESTION_INVENTARIO_SUCURSAL'),
('OPERAR_PUNTO_VENTA_POS'),  
('PROVEER_MERCANCIA'),       
('ACCESO_CLIENTE_OMNICANAL');

INSERT INTO "rol" ("nombreRol") VALUES
('Administrador'),
('Encargado de Sucursal'),
('Cajero'),
('Proveedor'),
('Cliente');

INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso", "estado") VALUES
(1, 1, 'Activo'), 
(2, 2, 'Activo'), 
(3, 3, 'Activo'), 
(4, 4, 'Activo'), 
(5, 5, 'Activo'); 

INSERT INTO "Usuario" ("nombre", "correo", "contraseña", "codigoRol") VALUES
('Revollo Admin', 'nicolasrevolloroman@gmail.com', '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C', 1),
('Yimysit Admin', 'patustarqui@gmail.com', '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C', 1),
('Roberto Encargado', 'encargado.central@tienda.com', '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C', 2),
('Lucía Cajera', 'cajero.central@tienda.com', '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C', 3),
('Textiles B2B', 'proveedor@textiles.com', '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C', 4),
('Juan Pérez Cliente', 'juan.perez@gmail.com', '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C', 5),
('Maria Gomez Cliente', 'maria.gomez@gmail.com', '$2b$12$HWqim2KP4GxJWv1kOb79tudNBV0Y94xoM2y5JRa32DSGPigvenb1C', 5);

INSERT INTO "Ciudad" ("nombCiudad") VALUES
('Santa Cruz de la Sierra'),
('La Paz');

INSERT INTO "Sucursal" ("nombre", "direccion", "idCiudad") VALUES
('Sucursal Central Equipetrol', 'Av. San Martín #123, Z/Equipetrol', 1),
('Sucursal El Prado', 'Av. 16 de Julio #456, Z/Centro', 2);

INSERT INTO "Cliente" ("nombre", "telefono", "direccion", "idUser") VALUES
('Juan Pérez Cliente', '+591 71012345', 'Av. Bush #500', 5),
('Maria Gomez Cliente', '+591 72067890', 'Calle Comercio #80', 6);

INSERT INTO "Bitacora" ("accion", "hora", "fecha", "ip", "idUser") VALUES
('Autenticar e Iniciar Sesión (JWT Generado)', '08:00:00', '2026-09-01', '192.168.1.10', 1),
('Autenticar e Iniciar Sesión (JWT Generado)', '08:15:00', '2026-09-01', '192.168.1.22', 2),
('Consulta de Catálogo desde App Móvil', '09:30:12', '2026-09-01', '186.87.12.44', 5);


INSERT INTO "Proveedor" ("nombre", "telefono", "correo") VALUES
('Textiles Andinos S.A.', '+591 33445566', 'contacto@textilesandinos.com'),
('Importadora Moda Global', '+591 22114455', 'ventas@modaglobal.bo');

INSERT INTO "Temporada" ("nombreTemporada", "fecha_ini", "fecha_fin") VALUES
('Primavera - Verano 2026', '2026-09-01', '2027-02-28'),
('Otoño - Invierno 2026', '2026-03-01', '2026-08-31');

INSERT INTO "Colecciones" ("nombre_coleccion", "idTemporada") VALUES
('Colección Urbana Casual', 1),
('Colección Formal / Ejecutiva', 2);

INSERT INTO "producto" ("nombre", "descripcion", "costo", "venta", "tipo", "talla", "color", "idProveedor", "idColeccion") VALUES
('Polera Oversize Cotton', 'Polera ligera apta para vestidor virtual (RA)', 50.00, 120.00, 'Polera', 'L', 'Negro', 1, 1),
('Jeans Slim Fit Denim', 'Pantalón mezclilla azul clásico', 90.00, 210.00, 'Pantalón', '32', 'Azul', 2, 1),
('Saco Blazer Ejecutivo', 'Saco elegante de corte italiano', 200.00, 450.00, 'Chaqueta', 'M', 'Gris', 1, 2);

INSERT INTO "Inventario" ("cantidad_actual", "cantidad_reservada", "codigoSucursal", "idProducto") VALUES
(100, 1, 1, 1),
(50, 0, 1, 2),
(30, 1, 2, 3);

INSERT INTO "Movimiento" ("tipo", "cantidad", "motivo", "idInv") VALUES
('Entrada', 100, 'Lote inicial suministrado por proveedor', 1),
('Entrada', 50, 'Lote inicial suministrado por proveedor', 2),
('Transferencia', 30, 'Transferencia de stock entre sucursales', 3);

INSERT INTO "Reserva" ("fecha", "horario", "estado", "idCliente", "codigoSucursal", "idProducto") VALUES
('2026-09-02', '15:30:00', 'Preparada en Sucursal', 1, 1, 1), 
('2026-09-03', '11:00:00', 'Pendiente', 2, 2, 3);               

INSERT INTO "metodo_pago" ("tipo", "estado", "fecha", "monto") VALUES
('Efectivo', 'Activo', '2026-09-02 16:00:00', 120.00),
('QR / Transferencia', 'Activo', '2026-09-02 17:15:00', 330.00);

INSERT INTO "Venta" ("fecha", "total", "idCliente", "idMetPago") VALUES
('2026-09-02 16:00:00', 120.00, 1, 1);

INSERT INTO "detalle_venta" ("cantidad", "precio_unitario", "idProducto", "idVenta", "codigoReserva") VALUES
(1, 120.00, 1, 1, 1);

INSERT INTO "Venta" ("fecha", "total", "idCliente", "idMetPago") VALUES
('2026-09-02 17:15:00', 330.00, 2, 2);

INSERT INTO "detalle_venta" ("cantidad", "precio_unitario", "idProducto", "idVenta", "codigoReserva") VALUES
(1, 120.00, 1, 2, NULL),
(1, 210.00, 2, 2, NULL);

INSERT INTO "historial" ("fecha", "idProducto", "idCliente", "idVenta") VALUES
('2026-09-02 16:00:00', 1, 1, 1),
('2026-09-02 17:15:00', 1, 2, 2),
('2026-09-02 17:15:00', 2, 2, 2);

INSERT INTO "Recomendaciones" ("nombre", "importancia", "idCliente") VALUES
('Recomendación IA: Combinación con Jeans Slim Fit', 'Alta', 1),
('Sugerencia Vestidor Virtual: Talla L adecuada según perfil', 'Media', 2);

ALTER TABLE "Movimiento"
    ADD COLUMN IF NOT EXISTS "referencia" VARCHAR(50) NULL;

ALTER TABLE "producto"
    ADD COLUMN IF NOT EXISTS "imagen_url" TEXT NULL,
    ADD COLUMN IF NOT EXISTS "imagenes_secundarias" TEXT[] NULL DEFAULT '{}';

ALTER TABLE "Usuario"
    ADD COLUMN IF NOT EXISTS "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "bloqueadoHasta" TIMESTAMP NULL;


ALTER TABLE "Usuario"
    ADD COLUMN IF NOT EXISTS "vecesBloqueado" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "requiereActivacion" BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO "permiso" ("nombrePermiso")
SELECT p.nombre
FROM (
    VALUES
        ('producto.listar'),
        ('producto.crear'),
        ('producto.editar'),
        ('producto.eliminar'),
        ('inventario.ver'),
        ('inventario.ajustar'),
        ('inventario.traspasar'),
        ('venta.crear'),
        ('venta.ver'),
        ('reserva.crear'),
        ('reserva.gestionar'),
        ('usuario.admin'),
        ('equipo.ver'),
        ('bitacora.ver'),
        ('recomendacion.gestionar'),
        ('cliente.ver')
) AS p(nombre)
WHERE NOT EXISTS (
    SELECT 1 FROM "permiso" WHERE "nombrePermiso" = p.nombre
);

-- 2) Asignar permisos por rol real (codigoRol confirmado via psql).
--    Administrador=1, Encargado de Sucursal=2, Cajero=3, Proveedor=4, Cliente=5.
INSERT INTO "asignacion_permiso" ("codigoRol", "idPermiso")
SELECT d.codigoRol,
       pe."idPermiso"
FROM (
    VALUES
        -- Administrador (1): TODOS los permisos granulares.
        (1, 'producto.listar'),
        (1, 'producto.crear'),
        (1, 'producto.editar'),
        (1, 'producto.eliminar'),
        (1, 'inventario.ver'),
        (1, 'inventario.ajustar'),
        (1, 'inventario.traspasar'),
        (1, 'venta.crear'),
        (1, 'venta.ver'),
        (1, 'reserva.crear'),
        (1, 'reserva.gestionar'),
        (1, 'usuario.admin'),
        (1, 'equipo.ver'),
        (1, 'bitacora.ver'),
        (1, 'recomendacion.gestionar'),
        (1, 'cliente.ver'),
        -- Encargado de Sucursal (2).
        (2, 'producto.listar'),
        (2, 'producto.crear'),
        (2, 'producto.editar'),
        (2, 'inventario.ver'),
        (2, 'inventario.ajustar'),
        (2, 'inventario.traspasar'),
        (2, 'venta.ver'),
        (2, 'reserva.gestionar'),
        (2, 'equipo.ver'),
        (2, 'cliente.ver'),
        (2, 'bitacora.ver'),
        (2, 'recomendacion.gestionar'),
        -- Cajero (3).
        (3, 'producto.listar'),
        (3, 'inventario.ver'),
        (3, 'venta.crear'),
        (3, 'venta.ver'),
        (3, 'reserva.crear'),
        (3, 'cliente.ver'),
        -- Proveedor (4): solo lectura de catalogo.
        (4, 'producto.listar'),
        -- Cliente (5).
        (5, 'producto.listar'),
        (5, 'reserva.crear')
) AS d(codigoRol, nombrePermiso)
JOIN "permiso" pe ON pe."nombrePermiso" = d.nombrePermiso
WHERE NOT EXISTS (
    SELECT 1
    FROM "asignacion_permiso" a
    WHERE a."codigoRol" = d.codigoRol
      AND a."idPermiso" = pe."idPermiso"
);