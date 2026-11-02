

/*
 * Diagrama de clases de la base de datos - YouShop Collective
 * Generado desde el DDL de la seccion 4.3 del informe + migracion 025 (sin notas de credito, con notificacion y medidas en cm): 31 tablas, 69 relaciones.
 *
 * USO:
 *   1. En el Project Browser selecciona el paquete donde quieres el diagrama.
 *   2. Specialize > Tools > Scripting (o Ctrl+Alt+H en versiones antiguas).
 *   3. Crea un grupo "Normal", un script nuevo de tipo JScript, pega este codigo y guardalo.
 *   4. Ejecutalo (boton Run). Crea un subpaquete "Modelo de datos YouShop" con
 *      todas las clases, sus atributos y asociaciones, y el diagrama.
 *
 * Ajustes:
 *   USAR_ESTEREOTIPO_TABLA = true  -> las clases llevan el estereotipo <<table>>
 *   MOSTRAR_SOLO_CLAVES   = true  -> solo se cargan las columnas PK/FK (diagrama compacto)
 */

var USAR_ESTEREOTIPO_TABLA = false;
var MOSTRAR_SOLO_CLAVES = false;
var NOMBRE_PAQUETE = "Modelo de datos YouShop";
var NOMBRE_DIAGRAMA = "Diagrama de clases - Base de datos";
var COLUMNAS_GRILLA = 6;

var TABLAS = [
    {"n": "plan", "c": [["idPlan", "SERIAL", "PK", 1], ["codigo", "VARCHAR(30)", "", 1], ["nombre", "VARCHAR(60)", "", 1], ["descripcion", "VARCHAR(255)", "", 0], ["precioMensual", "NUMERIC(10,2)", "", 1], ["maxSucursales", "INTEGER", "", 1], ["maxUsuarios", "INTEGER", "", 1], ["maxProductos", "INTEGER", "", 1], ["permiteIA", "BOOLEAN", "", 1], ["permiteOffline", "BOOLEAN", "", 1], ["permiteMultiSucursal", "BOOLEAN", "", 1], ["orden", "INTEGER", "", 1]]}, 
    {"n": "tenant", "c": [["idTenant", "SERIAL", "PK", 1], ["nombre", "VARCHAR(120)", "", 1], ["slug", "VARCHAR(60)", "", 1], ["estado", "VARCHAR(20)", "", 1], ["fechaAlta", "TIMESTAMPTZ", "", 1], ["idPlan", "INTEGER", "FK", 1]]}, 
    {"n": "suscripcion", "c": [["idSuscripcion", "BIGSERIAL", "PK", 1], ["idTenant", "INTEGER", "FK", 1], ["idPlan", "INTEGER", "FK", 1], ["fechaInicio", "TIMESTAMPTZ", "", 1], ["fechaVencimiento", "TIMESTAMPTZ", "", 1], ["estado", "VARCHAR(12)", "", 1], ["precioMensual", "NUMERIC(10,2)", "", 1], ["creadoEn", "TIMESTAMPTZ", "", 1]]}, 
    {"n": "respaldo", "c": [["idRespaldo", "BIGSERIAL", "PK", 1], ["idTenant", "INTEGER", "FK", 1], ["tipo", "VARCHAR(12)", "", 1], ["estado", "VARCHAR(12)", "", 1], ["almacenamiento", "VARCHAR(10)", "", 1], ["ruta", "VARCHAR(255)", "", 0], ["tamanoBytes", "BIGINT", "", 1], ["filas", "INTEGER", "", 1], ["error", "VARCHAR(500)", "", 0], ["creadoEn", "TIMESTAMPTZ", "", 1], ["idUsuario", "INTEGER", "FK", 0]]}, 
    {"n": "registro_sincronizacion", "c": [["idRegistro", "BIGSERIAL", "PK", 1], ["uuidOperacion", "UUID", "", 1], ["tipoOperacion", "VARCHAR(12)", "", 1], ["resultado", "VARCHAR(12)", "", 1], ["detalle", "VARCHAR(255)", "", 0], ["idReferencia", "INTEGER", "", 0], ["fechaOperacion", "TIMESTAMPTZ", "", 0], ["fechaRecepcion", "TIMESTAMPTZ", "", 1], ["dispositivo", "VARCHAR(120)", "", 0], ["idUsuario", "INTEGER", "FK", 0], ["idTenant", "INTEGER", "FK", 0]]}, 
    {"n": "rol", "c": [["codigoRol", "INT", "PK", 1], ["nombreRol", "VARCHAR(50)", "", 1]]}, 
    {"n": "permiso", "c": [["idPermiso", "INT", "PK", 1], ["nombrePermiso", "VARCHAR(100)", "", 1]]}, 
    {"n": "asignacion_permiso", "c": [["idRolPermiso", "INT", "PK", 1], ["fechaAsignacion", "TIMESTAMPTZ", "", 1], ["estado", "VARCHAR(20)", "", 1], ["codigoRol", "INT", "FK", 1], ["idPermiso", "INT", "FK", 1]]}, 
    {"n": "Usuario", "c": [["idUser", "INT", "PK", 1], ["nombre", "VARCHAR(100)", "", 1], ["correo", "VARCHAR(100)", "", 1], ["contrase\u00f1a", "VARCHAR(255)", "", 1], ["codigoRol", "INT", "FK", 1], ["intentosFallidos", "INTEGER", "", 1], ["bloqueadoHasta", "TIMESTAMP", "", 0], ["vecesBloqueado", "INTEGER", "", 1], ["requiereActivacion", "BOOLEAN", "", 1], ["idTenant", "INTEGER", "FK", 1]]}, 
    {"n": "Bitacora", "c": [["idBitacora", "BIGINT", "PK", 1], ["accion", "VARCHAR(150)", "", 1], ["hora", "TIME", "", 1], ["fecha", "DATE", "", 1], ["ip", "INET", "", 1], ["idUser", "INT", "FK", 1]]}, 
    {"n": "Cliente", "c": [["idCliente", "INT", "PK", 1], ["nombre", "VARCHAR(100)", "", 1], ["telefono", "VARCHAR(20)", "", 0], ["direccion", "VARCHAR(255)", "", 0], ["altura", "INTEGER", "", 0], ["pecho", "INTEGER", "", 0], ["cintura", "INTEGER", "", 0], ["tiro", "INTEGER", "", 0], ["idUser", "INT", "FK", 1]]}, 
    {"n": "Ciudad", "c": [["idCiudad", "INT", "PK", 1], ["nombCiudad", "VARCHAR(100)", "", 1]]}, 
    {"n": "Sucursal", "c": [["codigoSucursal", "INT", "PK", 1], ["nombre", "VARCHAR(100)", "", 1], ["direccion", "VARCHAR(255)", "", 1], ["idCiudad", "INT", "FK", 1], ["idTenant", "INTEGER", "FK", 1]]}, 
    {"n": "Proveedor", "c": [["idProveedor", "INT", "PK", 1], ["nombre", "VARCHAR(100)", "", 1], ["telefono", "VARCHAR(20)", "", 0], ["correo", "VARCHAR(100)", "", 0], ["idTenant", "INTEGER", "FK", 1]]}, 
    {"n": "Temporada", "c": [["idTemporada", "INT", "PK", 1], ["nombreTemporada", "VARCHAR(100)", "", 1], ["fecha_ini", "DATE", "", 1], ["fecha_fin", "DATE", "", 1], ["idTenant", "INTEGER", "FK", 1]]}, 
    {"n": "Colecciones", "c": [["idColeccion", "INT", "PK", 1], ["nombre_coleccion", "VARCHAR(100)", "", 1], ["idTemporada", "INT", "FK", 1], ["idTenant", "INTEGER", "FK", 1]]}, 
    {"n": "modelo_producto", "c": [["idModelo", "SERIAL", "PK", 1], ["nombre", "VARCHAR(120)", "", 1], ["tipo", "VARCHAR(50)", "", 0], ["descripcion", "TEXT", "", 0], ["idTenant", "INTEGER", "FK", 1]]}, 
    {"n": "producto", "c": [["idProducto", "INT", "PK", 1], ["nombre", "VARCHAR(150)", "", 1], ["descripcion", "TEXT", "", 0], ["costo", "NUMERIC(12,2)", "", 1], ["venta", "NUMERIC(12,2)", "", 1], ["tipo", "VARCHAR(50)", "", 0], ["talla", "VARCHAR(20)", "", 0], ["color", "VARCHAR(50)", "", 0], ["imagen_url", "TEXT", "", 0], ["imagenes_secundarias", "TEXT[]", "", 0], ["idProveedor", "INT", "FK", 1], ["idColeccion", "INT", "FK", 1], ["idModelo", "INTEGER", "FK", 0], ["idTenant", "INTEGER", "FK", 1], ["medidaPechoCm", "INTEGER", "", 0], ["medidaLargoCm", "INTEGER", "", 0], ["medidaCinturaCm", "INTEGER", "", 0]]}, 
    {"n": "Inventario", "c": [["idInv", "INT", "PK", 1], ["cantidad_actual", "INT", "", 1], ["cantidad_reservada", "INT", "", 1], ["codigoSucursal", "INT", "FK", 1], ["idProducto", "INT", "FK", 1]]}, 
    {"n": "Movimiento", "c": [["idMov", "BIGINT", "PK", 1], ["tipo", "VARCHAR(50)", "", 1], ["cantidad", "INT", "", 1], ["fecha", "TIMESTAMPTZ", "", 1], ["motivo", "VARCHAR(255)", "", 0], ["referencia", "VARCHAR(50)", "", 0], ["idInv", "INT", "FK", 1]]}, 
    {"n": "metodo_pago", "c": [["idMetPago", "INT", "PK", 1], ["tipo", "VARCHAR(50)", "", 1], ["estado", "VARCHAR(30)", "", 1], ["fecha", "TIMESTAMPTZ", "", 1], ["monto", "NUMERIC(12,2)", "", 1], ["stripePaymentIntentId", "VARCHAR(255)", "", 0], ["moneda", "VARCHAR(3)", "", 0], ["estadoStripe", "VARCHAR(30)", "", 0], ["origen", "VARCHAR(20)", "", 0], ["idUserPago", "INTEGER", "FK", 0], ["idProducto", "INTEGER", "FK", 0], ["codigoSucursal", "INTEGER", "FK", 0], ["consumidoEn", "TIMESTAMPTZ", "", 0]]}, 
    {"n": "Venta", "c": [["idVenta", "INT", "PK", 1], ["fecha", "TIMESTAMPTZ", "", 1], ["total", "NUMERIC(12,2)", "", 1], ["idCliente", "INT", "FK", 1], ["idMetPago", "INT", "FK", 1], ["uuidOperacion", "UUID", "", 1], ["origenRegistro", "VARCHAR(12)", "", 1], ["estadoSincronizacion", "VARCHAR(12)", "", 1], ["fechaOperacion", "TIMESTAMPTZ", "", 0], ["fechaSincronizacion", "TIMESTAMPTZ", "", 0]]}, 
    {"n": "detalle_venta", "c": [["codigoVenta", "INT", "PK", 1], ["cantidad", "INT", "", 1], ["precio_unitario", "NUMERIC(12,2)", "", 1], ["idProducto", "INT", "FK", 1], ["idVenta", "INT", "FK", 1], ["codigoReserva", "INT", "FK", 0]]}, 
    {"n": "Reserva", "c": [["codigoReserva", "INT", "PK", 1], ["fecha", "DATE", "", 1], ["horario", "TIME", "", 1], ["estado", "VARCHAR(30)", "", 1], ["montoDeposito", "NUMERIC(10,2)", "", 0], ["idCliente", "INT", "FK", 1], ["codigoSucursal", "INT", "FK", 1], ["idProducto", "INT", "FK", 1], ["idMetPago", "INTEGER", "FK", 0], ["uuidOperacion", "UUID", "", 1], ["origenRegistro", "VARCHAR(12)", "", 1], ["estadoSincronizacion", "VARCHAR(12)", "", 1], ["fechaOperacion", "TIMESTAMPTZ", "", 0], ["fechaSincronizacion", "TIMESTAMPTZ", "", 0]]}, 
    {"n": "detalle_reserva", "c": [["idDetalleReserva", "BIGSERIAL", "PK", 1], ["codigoReserva", "INTEGER", "FK", 1], ["idProducto", "INTEGER", "FK", 1], ["cantidad", "INTEGER", "", 1], ["precioUnitario", "NUMERIC(12,2)", "", 1]]}, 
    {"n": "historial", "c": [["codigoHistorial", "BIGINT", "PK", 1], ["fecha", "TIMESTAMPTZ", "", 1], ["idProducto", "INT", "FK", 1], ["idCliente", "INT", "FK", 1], ["idVenta", "INT", "FK", 1]]}, 
    {"n": "Recomendaciones", "c": [["idRecomendacion", "INT", "PK", 1], ["nombre", "VARCHAR(100)", "", 1], ["importancia", "VARCHAR(30)", "", 0], ["idCliente", "INT", "FK", 1], ["idProducto", "INTEGER", "FK", 0]]}, 
    {"n": "notificacion", "c": [["idNotificacion", "BIGSERIAL", "PK", 1], ["idUser", "INTEGER", "FK", 1], ["idTenant", "INTEGER", "FK", 0], ["tipo", "VARCHAR(20)", "", 1], ["titulo", "VARCHAR(150)", "", 1], ["mensaje", "VARCHAR(600)", "", 1], ["referencia", "VARCHAR(40)", "", 0], ["leida", "BOOLEAN", "", 1], ["porCorreo", "BOOLEAN", "", 1], ["correoEnviado", "BOOLEAN", "", 1], ["fecha", "TIMESTAMPTZ", "", 1]]}, 
    {"n": "politica_devolucion", "c": [["idPolitica", "BIGSERIAL", "PK", 1], ["idTenant", "INTEGER", "FK", 1], ["version", "INTEGER", "", 1], ["vigenteDesde", "TIMESTAMPTZ", "", 1], ["plazoCambioHoras", "INTEGER", "", 1], ["plazoGarantiaDias", "INTEGER", "", 1], ["accionFueraPlazo", "VARCHAR(10)", "", 1], ["recargoTipo", "VARCHAR(10)", "", 1], ["recargoValor", "NUMERIC(12,2)", "", 1], ["recargoUnidad", "VARCHAR(5)", "", 1], ["categoriasNoRetornables", "TEXT[]", "", 1], ["maxCambiosPorPrenda", "INTEGER", "", 1], ["permiteReembolso", "BOOLEAN", "", 1], ["respetarPrecioOriginal", "BOOLEAN", "", 1], ["umbralAutorizacion", "NUMERIC(12,2)", "", 1], ["maxDevolucionesMes", "INTEGER", "", 1], ["accionDeterioro", "VARCHAR(10)", "", 1], ["descuentoDeterioroPct", "NUMERIC(5,2)", "", 1], ["permiteSolicitudEnLinea", "BOOLEAN", "", 1], ["diasEntregaEnLinea", "INTEGER", "", 1], ["diasRetiroCambio", "INTEGER", "", 1], ["costoAjusteMedida", "NUMERIC(12,2)", "", 1], ["condiciones", "VARCHAR(1000)", "", 1], ["con", "sus etiquetas y se presenta con el comprobante de compra. Una prenda con defecto de fabrica siempre se acepta dentro del plazo de garantia.'", "", 0], ["creadoEn", "TIMESTAMPTZ", "", 1], ["idUsuario", "INTEGER", "FK", 0]]}, 
    {"n": "devolucion", "c": [["idDevolucion", "BIGSERIAL", "PK", 1], ["codigo", "VARCHAR(20)", "", 0], ["tipo", "VARCHAR(20)", "", 1], ["origen", "VARCHAR(10)", "", 1], ["cantidad", "INTEGER", "", 1], ["motivo", "VARCHAR(255)", "", 0], ["motivoCategoria", "VARCHAR(12)", "", 0], ["estado", "VARCHAR(20)", "", 1], ["fecha", "TIMESTAMPTZ", "", 1], ["fechaVenta", "TIMESTAMPTZ", "", 1], ["precioPagado", "NUMERIC(12,2)", "", 0], ["idPolitica", "BIGINT", "FK", 0], ["recargo", "NUMERIC(12,2)", "", 1], ["requiereAutorizacion", "BOOLEAN", "", 1], ["motivoAutorizacion", "VARCHAR(255)", "", 0], ["idAutorizador", "INTEGER", "FK", 0], ["fechaAutorizacion", "TIMESTAMPTZ", "", 0], ["fechaLimiteEntrega", "TIMESTAMPTZ", "", 0], ["fotos", "TEXT[]", "", 1], ["condicion", "VARCHAR(15)", "", 0], ["checklist", "JSONB", "", 0], ["codigoEscaneado", "VARCHAR(40)", "", 0], ["notasInspeccion", "VARCHAR(255)", "", 0], ["idInspector", "INTEGER", "FK", 0], ["fechaInspeccion", "TIMESTAMPTZ", "", 0], ["descuentoDeterioro", "NUMERIC(12,2)", "", 1], ["motivoRechazo", "VARCHAR(255)", "", 0], ["destinoInventario", "VARCHAR(12)", "", 0], ["tallaOriginal", "VARCHAR(20)", "", 0], ["tallaNueva", "VARCHAR(20)", "", 0], ["medidaOriginal", "VARCHAR(60)", "", 0], ["medidaNueva", "VARCHAR(60)", "", 0], ["diferencia", "NUMERIC(12,2)", "", 1], ["idMetPagoDiferencia", "INTEGER", "FK", 0], ["idVentaCambio", "INTEGER", "FK", 0], ["fechaEntregaAjuste", "DATE", "", 0], ["sucursalEntrega", "INTEGER", "FK", 0], ["idInvReservado", "INTEGER", "FK", 0], ["opcionSinStock", "VARCHAR(14)", "", 0], ["fechaLlegadaEstimada", "TIMESTAMPTZ", "", 0], ["fechaLimiteRetiro", "TIMESTAMPTZ", "", 0], ["montoDevuelto", "NUMERIC(12,2)", "", 1], ["metodoReembolso", "VARCHAR(12)", "", 0], ["estadoReembolso", "VARCHAR(22)", "", 0], ["referenciaReembolso", "VARCHAR(150)", "", 0], ["cuentaDestino", "VARCHAR(120)", "", 0], ["fechaResolucion", "TIMESTAMPTZ", "", 0], ["idVenta", "INTEGER", "FK", 1], ["idProducto", "INTEGER", "FK", 1], ["idProductoNuevo", "INTEGER", "FK", 0], ["idCliente", "INTEGER", "FK", 1], ["codigoSucursal", "INTEGER", "FK", 0], ["idUsuario", "INTEGER", "FK", 1], ["idTenant", "INTEGER", "FK", 1]]}, 
    {"n": "inventario_no_vendible", "c": [["idNoVendible", "BIGSERIAL", "PK", 1], ["codigoSucursal", "INTEGER", "FK", 1], ["idProducto", "INTEGER", "FK", 1], ["cantidad", "INTEGER", "", 1], ["motivo", "VARCHAR(12)", "", 1], ["idDevolucion", "BIGINT", "FK", 0], ["idProveedor", "INTEGER", "FK", 0], ["estado", "VARCHAR(12)", "", 1], ["observaciones", "VARCHAR(255)", "", 0], ["fecha", "TIMESTAMPTZ", "", 1], ["idTenant", "INTEGER", "FK", 1]]}];

var RELACIONES = [
    {"f": "tenant", "t": "plan", "c": "idPlan", "s": "1", "d": "0..*"}, 
    {"f": "suscripcion", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "suscripcion", "t": "plan", "c": "idPlan", "s": "1", "d": "0..*"}, 
    {"f": "asignacion_permiso", "t": "rol", "c": "codigoRol", "s": "1", "d": "0..*"}, 
    {"f": "asignacion_permiso", "t": "permiso", "c": "idPermiso", "s": "1", "d": "0..*"}, 
    {"f": "Usuario", "t": "rol", "c": "codigoRol", "s": "1", "d": "0..*"}, 
    {"f": "Usuario", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "Bitacora", "t": "Usuario", "c": "idUser", "s": "1", "d": "0..*"}, 
    {"f": "respaldo", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "respaldo", "t": "Usuario", "c": "idUsuario", "s": "0..1", "d": "0..*"}, 
    {"f": "Sucursal", "t": "Ciudad", "c": "idCiudad", "s": "1", "d": "0..*"}, 
    {"f": "Sucursal", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "Proveedor", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "Temporada", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "Colecciones", "t": "Temporada", "c": "idTemporada", "s": "1", "d": "0..*"}, 
    {"f": "Colecciones", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "modelo_producto", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "producto", "t": "Proveedor", "c": "idProveedor", "s": "1", "d": "0..*"}, 
    {"f": "producto", "t": "Colecciones", "c": "idColeccion", "s": "1", "d": "0..*"}, 
    {"f": "producto", "t": "modelo_producto", "c": "idModelo", "s": "0..1", "d": "0..*"}, 
    {"f": "producto", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "Inventario", "t": "Sucursal", "c": "codigoSucursal", "s": "1", "d": "0..*"}, 
    {"f": "Inventario", "t": "producto", "c": "idProducto", "s": "1", "d": "0..*"}, 
    {"f": "Movimiento", "t": "Inventario", "c": "idInv", "s": "1", "d": "0..*"}, 
    {"f": "Cliente", "t": "Usuario", "c": "idUser", "s": "1", "d": "0..1"}, 
    {"f": "metodo_pago", "t": "Usuario", "c": "idUserPago", "s": "0..1", "d": "0..*"}, 
    {"f": "metodo_pago", "t": "producto", "c": "idProducto", "s": "0..1", "d": "0..*"}, 
    {"f": "metodo_pago", "t": "Sucursal", "c": "codigoSucursal", "s": "0..1", "d": "0..*"}, 
    {"f": "Reserva", "t": "Cliente", "c": "idCliente", "s": "1", "d": "0..*"}, 
    {"f": "Reserva", "t": "Sucursal", "c": "codigoSucursal", "s": "1", "d": "0..*"}, 
    {"f": "Reserva", "t": "producto", "c": "idProducto", "s": "1", "d": "0..*"}, 
    {"f": "Reserva", "t": "metodo_pago", "c": "idMetPago", "s": "0..1", "d": "0..*"}, 
    {"f": "detalle_reserva", "t": "Reserva", "c": "codigoReserva", "s": "1", "d": "0..*"}, 
    {"f": "detalle_reserva", "t": "producto", "c": "idProducto", "s": "1", "d": "0..*"}, 
    {"f": "Venta", "t": "Cliente", "c": "idCliente", "s": "1", "d": "0..*"}, 
    {"f": "Venta", "t": "metodo_pago", "c": "idMetPago", "s": "1", "d": "0..*"}, 
    {"f": "detalle_venta", "t": "producto", "c": "idProducto", "s": "1", "d": "0..*"}, 
    {"f": "detalle_venta", "t": "Venta", "c": "idVenta", "s": "1", "d": "0..*"}, 
    {"f": "detalle_venta", "t": "Reserva", "c": "codigoReserva", "s": "0..1", "d": "0..*"}, 
    {"f": "historial", "t": "producto", "c": "idProducto", "s": "1", "d": "0..*"}, 
    {"f": "historial", "t": "Cliente", "c": "idCliente", "s": "1", "d": "0..*"}, 
    {"f": "historial", "t": "Venta", "c": "idVenta", "s": "1", "d": "0..*"}, 
    {"f": "registro_sincronizacion", "t": "Usuario", "c": "idUsuario", "s": "0..1", "d": "0..*"}, 
    {"f": "registro_sincronizacion", "t": "tenant", "c": "idTenant", "s": "0..1", "d": "0..*"}, 
    {"f": "Recomendaciones", "t": "Cliente", "c": "idCliente", "s": "1", "d": "0..*"}, 
    {"f": "Recomendaciones", "t": "producto", "c": "idProducto", "s": "0..1", "d": "0..*"}, 
    {"f": "politica_devolucion", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "politica_devolucion", "t": "Usuario", "c": "idUsuario", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Venta", "c": "idVenta", "s": "1", "d": "0..*"}, 
    {"f": "devolucion", "t": "producto", "c": "idProducto", "s": "1", "d": "0..*"}, 
    {"f": "devolucion", "t": "producto", "c": "idProductoNuevo", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Cliente", "c": "idCliente", "s": "1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Sucursal", "c": "codigoSucursal", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Usuario", "c": "idUsuario", "s": "1", "d": "0..*"}, 
    {"f": "devolucion", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "devolucion", "t": "politica_devolucion", "c": "idPolitica", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Usuario", "c": "idAutorizador", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Usuario", "c": "idInspector", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "metodo_pago", "c": "idMetPagoDiferencia", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Venta", "c": "idVentaCambio", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Sucursal", "c": "sucursalEntrega", "s": "0..1", "d": "0..*"}, 
    {"f": "devolucion", "t": "Inventario", "c": "idInvReservado", "s": "0..1", "d": "0..*"}, 
    {"f": "inventario_no_vendible", "t": "Sucursal", "c": "codigoSucursal", "s": "1", "d": "0..*"}, 
    {"f": "inventario_no_vendible", "t": "producto", "c": "idProducto", "s": "1", "d": "0..*"}, 
    {"f": "inventario_no_vendible", "t": "devolucion", "c": "idDevolucion", "s": "0..1", "d": "0..*"}, 
    {"f": "inventario_no_vendible", "t": "Proveedor", "c": "idProveedor", "s": "0..1", "d": "0..*"}, 
    {"f": "inventario_no_vendible", "t": "tenant", "c": "idTenant", "s": "1", "d": "0..*"}, 
    {"f": "notificacion", "t": "Usuario", "c": "idUser", "s": "1", "d": "0..*"}, 
    {"f": "notificacion", "t": "tenant", "c": "idTenant", "s": "0..1", "d": "0..*"}];

function main() {
    Repository.EnsureOutputVisible("Script");
    Repository.ClearOutput("Script");
    Session.Output("Generando diagrama de clases...");

    var padre = Repository.GetTreeSelectedPackage();
    if (padre == null) {
        Session.Output("ERROR: selecciona un paquete en el Project Browser antes de ejecutar el script.");
        return;
    }

    var paquete = padre.Packages.AddNew(NOMBRE_PAQUETE, "");
    paquete.Update();
    padre.Packages.Refresh();

    var diagrama = paquete.Diagrams.AddNew(NOMBRE_DIAGRAMA, "Logical");
    diagrama.Update();
    paquete.Diagrams.Refresh();

    var elementos = {};
    var i, j;

    // 1. Clases con sus atributos
    for (i = 0; i < TABLAS.length; i++) {
        var t = TABLAS[i];
        var el = paquete.Elements.AddNew(t.n, "Class");
        if (USAR_ESTEREOTIPO_TABLA) el.Stereotype = "table";
        el.Update();

        for (j = 0; j < t.c.length; j++) {
            var col = t.c[j];
            if (MOSTRAR_SOLO_CLAVES && col[2] == "") continue;
            var at = el.Attributes.AddNew(col[0], col[1]);
            at.Visibility = "Private";
            if (col[2] != "") at.Stereotype = col[2];
            at.AllowDuplicates = true;
            if (col[3] == 0) { at.LowerBound = "0"; at.UpperBound = "1"; }
            at.Pos = j;
            at.Update();
        }
        el.Attributes.Refresh();
        elementos[t.n] = el;
    }
    paquete.Elements.Refresh();
    Session.Output("Clases creadas: " + TABLAS.length);

    // 2. Asociaciones (una por clave foranea): tabla hija -> tabla padre
    var creadas = 0;
    for (i = 0; i < RELACIONES.length; i++) {
        var r = RELACIONES[i];
        var hija = elementos[r.f];
        var madre = elementos[r.t];
        if (hija == null || madre == null) continue;
        var con = hija.Connectors.AddNew("", "Association");
        con.SupplierID = madre.ElementID;
        con.Direction = "Source -> Destination";
        con.ClientEnd.Cardinality = r.d;
        con.SupplierEnd.Cardinality = r.s;
        con.Notes = "FK: " + r.c;
        con.Update();
        hija.Connectors.Refresh();
        creadas++;
    }
    Session.Output("Asociaciones creadas: " + creadas);

    // 3. Colocar las clases en el diagrama (grilla inicial)
    var x = 20, y = 20, filaAlto = 0, k = 0;
    for (i = 0; i < TABLAS.length; i++) {
        var nombre = TABLAS[i].n;
        var e = elementos[nombre];
        var nAttr = MOSTRAR_SOLO_CLAVES ? e.Attributes.Count : TABLAS[i].c.length;
        var ancho = 230;
        var alto = 40 + 15 * nAttr;
        var pos = "l=" + x + ";r=" + (x + ancho) + ";t=" + y + ";b=" + (y + alto) + ";";
        var obj = diagrama.DiagramObjects.AddNew(pos, "");
        obj.ElementID = e.ElementID;
        obj.Update();
        if (alto > filaAlto) filaAlto = alto;
        k++;
        x += ancho + 60;
        if (k % COLUMNAS_GRILLA == 0) { x = 20; y += filaAlto + 60; filaAlto = 0; }
    }
    diagrama.DiagramObjects.Refresh();
    diagrama.Update();

    // 4. Auto-ordenar (si la version de EA lo permite)
    try {
        var proyecto = Repository.GetProjectInterface();
        proyecto.LayoutDiagramEx(diagrama.DiagramGUID, 0, 4, 40, 40, true);
    } catch (err) {
        Session.Output("No se pudo auto-ordenar: " + err.message + " (puedes usar Layout > Diagram Layout).");
    }

    Repository.RefreshModelView(paquete.PackageID);
    Repository.OpenDiagram(diagrama.DiagramID);
    Session.Output("Listo: " + TABLAS.length + " clases y " + creadas + " asociaciones en '" + NOMBRE_DIAGRAMA + "'.");
}

main();
