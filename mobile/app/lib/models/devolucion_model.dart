// Modulo de devoluciones del lado del cliente (CU2, CU7, CU9, CU11 de
// docs/iconix/2do parcial SI2.md). Mapea `backend/app/schemas/returns.py`.

double _num(dynamic v) => (v as num?)?.toDouble() ?? 0;

/// "24 h" o "7 días", igual que el backend y la web.
String textoPlazo(int horas) => horas % 24 == 0 && horas >= 48 ? '${horas ~/ 24} días' : '$horas h';

/// `GET /api/returns/politica` (CU9): version vigente de la empresa, o la de
/// la plataforma si la empresa todavia no configuro una (`version` 0).
class PoliticaDevolucion {
  final int version;
  final int plazoCambioHoras;
  final int plazoGarantiaDias;
  final String accionFueraPlazo;
  final String recargoTipo;
  final double recargoValor;
  final String recargoUnidad;
  final bool permiteReembolso;
  final bool permiteSolicitudEnLinea;
  final int diasEntregaEnLinea;
  final String condiciones;
  // [CU31] [CU32] delivery: si se ofrece y cuanto cuesta cada viaje.
  final bool permiteDomicilio;
  final double costoDomicilio;

  const PoliticaDevolucion({
    required this.version,
    required this.plazoCambioHoras,
    required this.plazoGarantiaDias,
    required this.accionFueraPlazo,
    required this.recargoTipo,
    required this.recargoValor,
    required this.recargoUnidad,
    required this.permiteReembolso,
    required this.permiteSolicitudEnLinea,
    required this.diasEntregaEnLinea,
    required this.condiciones,
    this.permiteDomicilio = true,
    this.costoDomicilio = 0,
  });

  String get plazoTexto => textoPlazo(plazoCambioHoras);

  String? get recargoTexto => accionFueraPlazo != 'recargo'
      ? null
      : 'Fuera de plazo se puede con un recargo de '
          '${recargoTipo == 'porcentaje' ? '${recargoValor.toStringAsFixed(0)}%' : 'Bs ${recargoValor.toStringAsFixed(2)}'}'
          ' por $recargoUnidad de demora.';

  factory PoliticaDevolucion.fromJson(Map<String, dynamic> json) => PoliticaDevolucion(
        version: json['version'] as int? ?? 0,
        plazoCambioHoras: json['plazoCambioHoras'] as int,
        plazoGarantiaDias: json['plazoGarantiaDias'] as int,
        accionFueraPlazo: json['accionFueraPlazo'] as String,
        recargoTipo: json['recargoTipo'] as String,
        recargoValor: _num(json['recargoValor']),
        recargoUnidad: json['recargoUnidad'] as String,
        permiteReembolso: json['permiteReembolso'] as bool,
        permiteSolicitudEnLinea: json['permiteSolicitudEnLinea'] as bool,
        diasEntregaEnLinea: json['diasEntregaEnLinea'] as int,
        condiciones: json['condiciones'] as String,
        permiteDomicilio: json['permiteDomicilio'] as bool? ?? true,
        costoDomicilio: _num(json['costoDomicilio']),
      );
}

/// Elegibilidad de una prenda segun la politica de la venta (CU2 paso 2).
class Elegibilidad {
  /// en_plazo, garantia, recargo, fuera_plazo, no_retornable, max_cambios, sin_unidades.
  final String estado;
  final bool puede;
  final double horasRestantes;
  final String fechaLimite;
  final String garantiaHasta;
  final double recargo;
  final String mensaje;

  /// Fuera del plazo de cambio pero dentro de la garantia: solo por defecto de fabrica.
  final bool soloDefecto;

  const Elegibilidad({
    required this.estado,
    required this.puede,
    required this.horasRestantes,
    required this.fechaLimite,
    required this.garantiaHasta,
    required this.recargo,
    required this.mensaje,
    this.soloDefecto = false,
  });

  factory Elegibilidad.fromJson(Map<String, dynamic> json) => Elegibilidad(
        estado: json['estado'] as String,
        puede: json['puede'] as bool,
        horasRestantes: _num(json['horasRestantes']),
        fechaLimite: json['fechaLimite'] as String,
        garantiaHasta: json['garantiaHasta'] as String,
        recargo: _num(json['recargo']),
        mensaje: json['mensaje'] as String,
        soloDefecto: json['soloDefecto'] as bool? ?? false,
      );
}

/// Una prenda de una compra, con lo que todavia se puede devolver.
class LineaDevolucion {
  final int idProducto;
  final String producto;
  final String? talla;
  final String? color;
  final String? tipoPrenda;
  final int cantidad;
  final double precioPagado;
  final int disponibles;
  final Elegibilidad elegibilidad;
  final String? solicitudAbierta;

  const LineaDevolucion({
    required this.idProducto,
    required this.producto,
    this.talla,
    this.color,
    this.tipoPrenda,
    required this.cantidad,
    required this.precioPagado,
    required this.disponibles,
    required this.elegibilidad,
    this.solicitudAbierta,
  });

  factory LineaDevolucion.fromJson(Map<String, dynamic> json) => LineaDevolucion(
        idProducto: json['idProducto'] as int,
        producto: json['producto'] as String,
        talla: json['talla'] as String?,
        color: json['color'] as String?,
        tipoPrenda: json['tipoPrenda'] as String?,
        cantidad: json['cantidad'] as int,
        precioPagado: _num(json['precioPagado']),
        disponibles: json['disponibles'] as int,
        elegibilidad: Elegibilidad.fromJson(json['elegibilidad'] as Map<String, dynamic>),
        solicitudAbierta: json['solicitudAbierta'] as String?,
      );
}

/// `GET /api/returns/mis-compras`: una compra del cliente con sus prendas.
class CompraDevolucion {
  final int idVenta;
  final String fecha;
  final int? codigoSucursal;
  final String? sucursal;
  final String estadoDevolucion;
  final int idTenant;
  final String? empresa;
  final List<LineaDevolucion> lineas;

  const CompraDevolucion({
    required this.idVenta,
    required this.fecha,
    this.codigoSucursal,
    this.sucursal,
    required this.estadoDevolucion,
    required this.idTenant,
    this.empresa,
    required this.lineas,
  });

  factory CompraDevolucion.fromJson(Map<String, dynamic> json) => CompraDevolucion(
        idVenta: json['idVenta'] as int,
        fecha: json['fecha'] as String,
        codigoSucursal: json['codigoSucursal'] as int?,
        sucursal: json['sucursal'] as String?,
        estadoDevolucion: json['estadoDevolucion'] as String,
        idTenant: json['idTenant'] as int,
        empresa: json['empresa'] as String?,
        lineas: (json['lineas'] as List).cast<Map<String, dynamic>>().map(LineaDevolucion.fromJson).toList(),
      );
}

/// Un caso de devolucion o cambio (`DevolucionOut`).
class CasoDevolucion {
  final int idDevolucion;
  final String codigo;
  final String tipo;
  final String origen;
  final String estado;
  final String fecha;
  final String? fechaLimiteEntrega;
  final String? productoNombre;
  final String? tallaOriginal;
  final String? productoNuevoNombre;
  final String? tallaNueva;
  final String? sucursalNombre;
  final String? sucursalEntregaNombre;
  final String? fechaLimiteRetiro;
  final String? motivoRechazo;
  final double montoDevuelto;
  final String? metodoReembolso;
  final String? estadoReembolso;
  // [CU31] [CU32]
  final String modalidadEntrega;
  final double costoDomicilio;

  const CasoDevolucion({
    required this.idDevolucion,
    required this.codigo,
    required this.tipo,
    required this.origen,
    required this.estado,
    required this.fecha,
    this.fechaLimiteEntrega,
    this.productoNombre,
    this.tallaOriginal,
    this.productoNuevoNombre,
    this.tallaNueva,
    this.sucursalNombre,
    this.sucursalEntregaNombre,
    this.fechaLimiteRetiro,
    this.motivoRechazo,
    required this.montoDevuelto,
    this.metodoReembolso,
    this.estadoReembolso,
    this.modalidadEntrega = 'sucursal',
    this.costoDomicilio = 0,
  });

  factory CasoDevolucion.fromJson(Map<String, dynamic> json) => CasoDevolucion(
        idDevolucion: json['idDevolucion'] as int,
        codigo: json['codigo'] as String? ?? '#${json['idDevolucion']}',
        tipo: json['tipo'] as String,
        origen: json['origen'] as String,
        estado: json['estado'] as String,
        fecha: json['fecha'] as String,
        fechaLimiteEntrega: json['fechaLimiteEntrega'] as String?,
        productoNombre: json['producto_nombre'] as String?,
        tallaOriginal: json['tallaOriginal'] as String?,
        productoNuevoNombre: json['producto_nuevo_nombre'] as String?,
        tallaNueva: json['tallaNueva'] as String?,
        sucursalNombre: json['sucursal_nombre'] as String?,
        sucursalEntregaNombre: json['sucursal_entrega_nombre'] as String?,
        fechaLimiteRetiro: json['fechaLimiteRetiro'] as String?,
        motivoRechazo: json['motivoRechazo'] as String?,
        montoDevuelto: _num(json['montoDevuelto']),
        metodoReembolso: json['metodoReembolso'] as String?,
        estadoReembolso: json['estadoReembolso'] as String?,
        modalidadEntrega: json['modalidadEntrega'] as String? ?? 'sucursal',
        costoDomicilio: _num(json['costoDomicilio']),
      );
}

/// Un paso de la linea de tiempo del caso (`GET /api/returns/{id}`).
class EventoDevolucion {
  final String fecha;
  final String etapa;
  final String detalle;

  const EventoDevolucion({required this.fecha, required this.etapa, required this.detalle});

  factory EventoDevolucion.fromJson(Map<String, dynamic> json) => EventoDevolucion(
        fecha: json['fecha'] as String,
        etapa: json['etapa'] as String,
        detalle: json['detalle'] as String,
      );
}

/// `GET /api/returns/{id}/qr`: matriz del QR, una cadena de 0/1 por fila.
class QrDevolucion {
  final String codigo;
  final List<String> modulos;

  const QrDevolucion({required this.codigo, required this.modulos});

  factory QrDevolucion.fromJson(Map<String, dynamic> json) => QrDevolucion(
        codigo: json['codigo'] as String,
        modulos: (json['modulos'] as List).cast<String>(),
      );
}

/// Aviso "tipo push" del cliente (`GET /api/notificaciones`): correccion de la ingeniera.
/// Ej.: "Su prenda sera enviada el viernes 06/11", "Le devolvimos Bs 80 (nota de devolucion)".
class Notificacion {
  final int idNotificacion;
  final String tipo;
  final String titulo;
  final String mensaje;
  final bool leida;
  final String fecha;

  const Notificacion({
    required this.idNotificacion,
    required this.tipo,
    required this.titulo,
    required this.mensaje,
    required this.leida,
    required this.fecha,
  });

  factory Notificacion.fromJson(Map<String, dynamic> json) => Notificacion(
        idNotificacion: json['idNotificacion'] as int,
        tipo: json['tipo'] as String,
        titulo: json['titulo'] as String,
        mensaje: json['mensaje'] as String,
        leida: json['leida'] as bool? ?? false,
        fecha: json['fecha'] as String,
      );
}

/// "L mas grande o L menos grande" (`GET /api/returns/comparar-tallas`): correccion de la ingeniera.
/// Dice si la talla elegida es mas grande o mas chica que la devuelta, y por cuantos cm.
class ComparacionTalla {
  final String direccion; // mas_grande | mas_chica | igual | sin_datos
  final String texto;

  const ComparacionTalla({required this.direccion, required this.texto});

  factory ComparacionTalla.fromJson(Map<String, dynamic> json) =>
      ComparacionTalla(direccion: json['direccion'] as String, texto: json['texto'] as String);
}

/// Existencia de una variante en una sucursal (`GET /api/returns/stock/{id}`).
class StockSucursal {
  final int codigoSucursal;
  final String sucursal;
  final int disponible;

  const StockSucursal({required this.codigoSucursal, required this.sucursal, required this.disponible});

  factory StockSucursal.fromJson(Map<String, dynamic> json) => StockSucursal(
        codigoSucursal: json['codigoSucursal'] as int,
        sucursal: json['sucursal'] as String,
        disponible: json['disponible'] as int,
      );
}

/// Prenda del catalogo que se puede pedir a cambio.
class ProductoReemplazo {
  final int idProducto;
  final String nombre;
  final String? tipo;
  final String? talla;
  final String? color;
  final double venta;

  const ProductoReemplazo({
    required this.idProducto,
    required this.nombre,
    this.tipo,
    this.talla,
    this.color,
    required this.venta,
  });

  factory ProductoReemplazo.fromJson(Map<String, dynamic> json) => ProductoReemplazo(
        idProducto: json['idProducto'] as int,
        nombre: json['nombre'] as String,
        tipo: json['tipo'] as String?,
        talla: json['talla'] as String?,
        color: json['color'] as String?,
        venta: _num(json['venta']),
      );
}

const etiquetasTipoDevolucion = <String, String>{
  'cambio_talla': 'Cambio de talla',
  'cambio_color': 'Cambio de color',
  'cambio_medida': 'Ajuste de medida',
  'cambio_producto': 'Cambio por otro producto',
  'devolucion': 'Devolución del dinero',
};

const etiquetasEstadoDevolucion = <String, String>{
  'PendienteEntrega': 'Pendiente de entrega',
  'EnInspeccion': 'En inspección',
  'EnRevision': 'En revisión',
  'Aprobada': 'Aprobada',
  'CambioPendiente': 'Cambio pendiente',
  'EnvioDomicilio': 'En camino a tu casa',
  'Completada': 'Completada',
  'Rechazada': 'Rechazada',
  'Anulada': 'Anulada',
  'Cancelada': 'Cancelada',
};

const etiquetasMotivoDevolucion = <String, String>{
  'talla': 'No le quedó la talla',
  'medida': 'Ajuste de medida',
  'color': 'Cambio de color',
  'defecto': 'Defecto de fábrica',
  'equivocado': 'Producto equivocado',
  'no_desea': 'Ya no lo desea',
};
