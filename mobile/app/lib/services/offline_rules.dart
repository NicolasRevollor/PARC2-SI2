/// Reglas del modo sin conexion que se calculan en el dispositivo (CU13 a
/// CU20). Son las mismas de web/src/app/core/offline-rules.ts y el servidor
/// las vuelve a validar al sincronizar (CU17).
library;

const estadosPendientes = ['Registrada localmente', 'Enviada'];

class OperacionLocal {
  OperacionLocal({
    required this.uuidOperacion,
    required this.tipo,
    required this.estado,
    required this.codigoSucursal,
    required this.fechaOperacion,
    required this.total,
    required this.resumen,
    required this.datos,
    this.idTenant,
    this.idUsuario,
    this.dependeDe,
    this.intentos = 0,
    this.ultimoIntento,
    this.fechaConfirmacion,
    this.idServidor,
    this.motivo,
    this.tipoConflicto,
  });

  final String uuidOperacion;
  final String tipo;
  String estado;
  final int? idTenant;
  final int? idUsuario;
  final int? codigoSucursal;
  final String fechaOperacion;
  final String? dependeDe;
  final double total;
  final String resumen;
  final Map<String, dynamic> datos;
  int intentos;
  String? ultimoIntento;
  String? fechaConfirmacion;
  int? idServidor;
  String? motivo;
  String? tipoConflicto;

  bool get pendiente => estadosPendientes.contains(estado);
  bool get sinConfirmar => pendiente || estado == 'En conflicto';

  Map<String, dynamic> toJson() => {
        'uuidOperacion': uuidOperacion,
        'tipo': tipo,
        'estado': estado,
        'idTenant': idTenant,
        'idUsuario': idUsuario,
        'codigoSucursal': codigoSucursal,
        'fechaOperacion': fechaOperacion,
        'dependeDe': dependeDe,
        'total': total,
        'resumen': resumen,
        'datos': datos,
        'intentos': intentos,
        'ultimoIntento': ultimoIntento,
        'fechaConfirmacion': fechaConfirmacion,
        'idServidor': idServidor,
        'motivo': motivo,
        'tipoConflicto': tipoConflicto,
      };

  factory OperacionLocal.fromJson(Map<String, dynamic> j) => OperacionLocal(
        uuidOperacion: j['uuidOperacion'] as String,
        tipo: j['tipo'] as String,
        estado: j['estado'] as String,
        idTenant: j['idTenant'] as int?,
        idUsuario: j['idUsuario'] as int?,
        codigoSucursal: j['codigoSucursal'] as int?,
        fechaOperacion: j['fechaOperacion'] as String,
        dependeDe: j['dependeDe'] as String?,
        total: (j['total'] as num).toDouble(),
        resumen: j['resumen'] as String,
        datos: (j['datos'] as Map).cast<String, dynamic>(),
        intentos: j['intentos'] as int? ?? 0,
        ultimoIntento: j['ultimoIntento'] as String?,
        fechaConfirmacion: j['fechaConfirmacion'] as String?,
        idServidor: j['idServidor'] as int?,
        motivo: j['motivo'] as String?,
        tipoConflicto: j['tipoConflicto'] as String?,
      );
}

/// CU13 paso 4: existencia descargada menos lo registrado en el dispositivo.
int existenciaLocal(
  int disponibleDescargado,
  List<OperacionLocal> operaciones,
  int idProducto,
  String? fechaDescarga,
) {
  var disponible = disponibleDescargado;
  final canceladas = operaciones.where((o) => o.tipo == 'cancelar_reserva').map((o) => o.datos['uuidReserva']).toSet();
  for (final op in operaciones) {
    final posterior = op.estado == 'Confirmada' &&
        (fechaDescarga == null || (op.fechaConfirmacion ?? '').compareTo(fechaDescarga) > 0);
    if (!op.sinConfirmar && !posterior) continue;
    if (op.tipo == 'venta' || (op.tipo == 'reserva' && !canceladas.contains(op.uuidOperacion))) {
      for (final item in (op.datos['items'] as List? ?? const [])) {
        if (item['idProducto'] == idProducto) disponible -= item['cantidad'] as int;
      }
    } else if (op.tipo == 'cambio' && op.datos['idProductoNuevo'] == idProducto) {
      disponible -= op.datos['cantidad'] as int;
    } else if (op.tipo == 'cancelar_reserva') {
      for (final linea in (op.datos['liberar'] as List? ?? const [])) {
        if (linea['idProducto'] == idProducto) disponible += linea['cantidad'] as int;
      }
    }
  }
  return disponible < 0 ? 0 : disponible;
}

/// CU13 flujo alternativo 1 y CU14 flujo alternativo 5.
bool vencido(String? fecha, int horas, DateTime ahora) {
  if (fecha == null) return true;
  return ahora.difference(DateTime.parse(fecha)).inMinutes > horas * 60;
}

/// CU14 paso 6: null si el efectivo no alcanza.
double? calcularCambio(double total, double recibido) {
  final cambio = ((recibido - total) * 100).round() / 100;
  return cambio < 0 ? null : cambio;
}

/// CU17 flujo alternativo 1: intervalos crecientes, con tope de 5 minutos.
Duration esperaReintento(int intentos) {
  final segundos = 5 * (1 << (intentos < 1 ? 0 : (intentos > 8 ? 7 : intentos - 1)));
  return Duration(seconds: segundos > 300 ? 300 : segundos);
}

/// CU17 paso 2 y flujo alternativo 4: en orden, pero nunca antes de la
/// operacion de la que depende.
List<OperacionLocal> ordenarCola(List<OperacionLocal> operaciones) {
  final porFecha = [...operaciones]..sort((a, b) => a.fechaOperacion.compareTo(b.fechaOperacion));
  final porUuid = {for (final o in porFecha) o.uuidOperacion: o};
  final enviadas = <String>{};
  final orden = <OperacionLocal>[];
  void agregar(OperacionLocal op, Set<String> visitando) {
    if (enviadas.contains(op.uuidOperacion) || !visitando.add(op.uuidOperacion)) return;
    final previa = porUuid[op.dependeDe];
    if (previa != null) agregar(previa, visitando);
    enviadas.add(op.uuidOperacion);
    orden.add(op);
  }

  for (final op in porFecha) {
    agregar(op, <String>{});
  }
  return orden;
}

/// CU19 paso 2: null si se puede cambiar; si no, el motivo.
String? motivoNoCambio({
  required DateTime fechaVenta,
  required Map<String, dynamic> linea,
  required int cantidad,
  required bool esDefecto,
  required Map<String, dynamic> politica,
  required DateTime ahora,
}) {
  final limite = fechaVenta.add(Duration(hours: politica['plazoCambioHoras'] as int));
  final garantia = fechaVenta.add(Duration(days: politica['plazoGarantiaDias'] as int));
  final disponibles = linea['disponibles'] as int;
  if (cantidad > disponibles) return 'Solo quedan $disponibles unidad(es) disponibles para cambio';
  if ((linea['cambios'] as int) >= (politica['maxCambiosPorPrenda'] as int)) {
    return 'La prenda ya alcanzo el maximo de cambios';
  }
  final categoria = linea['tipo'] as String?;
  if (categoria != null && (politica['categoriasNoRetornables'] as List).contains(categoria) && !esDefecto) {
    return '$categoria no admite cambio: solo por defecto de fabrica';
  }
  if (esDefecto) return ahora.isBefore(garantia) ? null : 'La garantia ya vencio';
  return ahora.isBefore(limite) ? null : 'Fuera de plazo: requiere conexion';
}

/// CU19 paso 5: misma formula que `diferencia_variante` del backend.
double diferenciaCambio({
  required double precioPagado,
  required double precioActualOriginal,
  required double precioActualNueva,
  required int cantidad,
  required double descuentoDeterioroPct,
  required bool respetarPrecioOriginal,
}) {
  final valor = precioPagado * cantidad;
  final credito = valor - valor * descuentoDeterioroPct / 100;
  final nueva = respetarPrecioOriginal ? precioPagado + (precioActualNueva - precioActualOriginal) : precioActualNueva;
  return ((nueva * cantidad - credito) * 100).round() / 100;
}

/// CU20 paso 3: el efectivo de las operaciones de esta caja.
({double ingresos, double egresos}) efectivoDeOperaciones(List<OperacionLocal> operaciones, String uuidCaja) {
  var ingresos = 0.0;
  var egresos = 0.0;
  for (final op in operaciones) {
    if (op.datos['uuidCaja'] != uuidCaja || op.estado == 'Rechazada' || op.estado == 'Anulada') continue;
    if (op.tipo == 'venta') {
      ingresos += (op.datos['total'] as num).toDouble();
    } else if (op.tipo == 'reserva') {
      ingresos += (op.datos['deposito'] as num? ?? 0).toDouble();
    } else if (op.tipo == 'cambio') {
      ingresos += (op.datos['montoCobrado'] as num? ?? 0).toDouble();
    } else if (op.tipo == 'cancelar_reserva') {
      egresos += (op.datos['devolverDeposito'] as num? ?? 0).toDouble();
    }
  }
  return (ingresos: ingresos, egresos: egresos);
}
