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
  final int vigenciaNotaCreditoDias;
  final String condiciones;

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
    required this.vigenciaNotaCreditoDias,
    required this.condiciones,
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
        vigenciaNotaCreditoDias: json['vigenciaNotaCreditoDias'] as int,
        condiciones: json['condiciones'] as String,
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

  const Elegibilidad({
    required this.estado,
    required this.puede,
    required this.horasRestantes,
    required this.fechaLimite,
    required this.garantiaHasta,
    required this.recargo,
    required this.mensaje,
  });

  factory Elegibilidad.fromJson(Map<String, dynamic> json) => Elegibilidad(
        estado: json['estado'] as String,
        puede: json['puede'] as bool,
        horasRestantes: _num(json['horasRestantes']),
        fechaLimite: json['fechaLimite'] as String,
        garantiaHasta: json['garantiaHasta'] as String,
        recargo: _num(json['recargo']),
        mensaje: json['mensaje'] as String,
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
  final String? notaCodigo;

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
    this.notaCodigo,
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
        notaCodigo: json['nota_codigo'] as String?,
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

/// Movimiento de una nota de credito (emision, uso, anulacion, ...).
class MovimientoNota {
  final String tipo;
  final double monto;
  final double saldoResultante;
  final String? detalle;
  final String fecha;

  const MovimientoNota({
    required this.tipo,
    required this.monto,
    required this.saldoResultante,
    this.detalle,
    required this.fecha,
  });

  factory MovimientoNota.fromJson(Map<String, dynamic> json) => MovimientoNota(
        tipo: json['tipo'] as String,
        monto: _num(json['monto']),
        saldoResultante: _num(json['saldoResultante']),
        detalle: json['detalle'] as String?,
        fecha: json['fecha'] as String,
      );
}

/// `GET /api/credit-notes` (CU7).
class NotaCreditoCliente {
  final String codigo;
  final double monto;
  final double saldo;
  final String estado;
  final String fechaVencimiento;
  final String? empresa;
  final String? codigoDevolucion;
  final List<MovimientoNota> movimientos;

  const NotaCreditoCliente({
    required this.codigo,
    required this.monto,
    required this.saldo,
    required this.estado,
    required this.fechaVencimiento,
    this.empresa,
    this.codigoDevolucion,
    required this.movimientos,
  });

  factory NotaCreditoCliente.fromJson(Map<String, dynamic> json) => NotaCreditoCliente(
        codigo: json['codigo'] as String,
        monto: _num(json['monto']),
        saldo: _num(json['saldo']),
        estado: json['estado'] as String,
        fechaVencimiento: json['fechaVencimiento'] as String,
        empresa: json['empresa'] as String?,
        codigoDevolucion: json['codigoDevolucion'] as String?,
        movimientos: (json['movimientos'] as List? ?? []).cast<Map<String, dynamic>>().map(MovimientoNota.fromJson).toList(),
      );
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
  'devolucion': 'Reembolso',
  'nota_credito': 'Nota de crédito',
};

const etiquetasEstadoDevolucion = <String, String>{
  'PendienteEntrega': 'Pendiente de entrega',
  'EnInspeccion': 'En inspección',
  'EnRevision': 'En revisión',
  'Aprobada': 'Aprobada',
  'CambioPendiente': 'Cambio pendiente',
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
