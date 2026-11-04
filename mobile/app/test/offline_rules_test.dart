import 'package:aether_fashion/services/offline_rules.dart';
import 'package:flutter_test/flutter_test.dart';

OperacionLocal operacion({
  String tipo = 'venta',
  String estado = 'Registrada localmente',
  String fecha = '2026-11-03T10:00:00Z',
  String? dependeDe,
  String? uuid,
  Map<String, dynamic> datos = const {},
}) {
  return OperacionLocal(
    uuidOperacion: uuid ?? fecha + tipo,
    tipo: tipo,
    estado: estado,
    codigoSucursal: 1,
    fechaOperacion: fecha,
    dependeDe: dependeDe,
    total: 0,
    resumen: '',
    datos: datos,
  );
}

Map<String, dynamic> item(int cantidad) => {
      'items': [
        {'idProducto': 7, 'cantidad': cantidad, 'precioUnitario': 10}
      ]
    };

void main() {
  test('CU13: la existencia resta lo registrado y una rechazada no descuenta', () {
    expect(existenciaLocal(4, [operacion(datos: item(2))], 7, null), 2);
    expect(existenciaLocal(4, [operacion(estado: 'Rechazada', datos: item(2))], 7, null), 4);
    expect(existenciaLocal(1, [operacion(datos: item(5))], 7, null), 0);
  });

  test('CU15: cancelar una reserva local libera lo apartado', () {
    final reserva = operacion(tipo: 'reserva', uuid: 'r1', datos: item(2));
    final cancelar = operacion(tipo: 'cancelar_reserva', datos: {'uuidReserva': 'r1'});
    expect(existenciaLocal(4, [reserva, cancelar], 7, null), 4);
  });

  test('CU14: el cambio se calcula y un monto menor no alcanza', () {
    expect(calcularCambio(90.5, 100), 9.5);
    expect(calcularCambio(100, 99.99), isNull);
  });

  test('CU17: los reintentos crecen hasta el tope', () {
    expect(esperaReintento(1), const Duration(seconds: 5));
    expect(esperaReintento(3), const Duration(seconds: 20));
    expect(esperaReintento(50), const Duration(seconds: 300));
  });

  test('CU17: el cambio sale despues de la venta de la que depende', () {
    final venta = operacion(uuid: 'v', fecha: '2026-11-03T11:00:00Z');
    final cambio = operacion(tipo: 'cambio', uuid: 'c', fecha: '2026-11-03T10:00:00Z', dependeDe: 'v');
    expect(ordenarCola([cambio, venta]).map((o) => o.uuidOperacion), ['v', 'c']);
  });

  final politica = {
    'plazoCambioHoras': 24,
    'plazoGarantiaDias': 30,
    'maxCambiosPorPrenda': 2,
    'categoriasNoRetornables': <String>[],
  };
  final linea = {'disponibles': 1, 'cambios': 0, 'tipo': 'Polera'};

  test('CU19: plazo, garantia y cantidades', () {
    final venta = DateTime.utc(2026, 11, 3);
    String? motivo(DateTime ahora, {bool defecto = false, int cantidad = 1}) => motivoNoCambio(
        fechaVenta: venta, linea: linea, cantidad: cantidad, esDefecto: defecto, politica: politica, ahora: ahora);
    expect(motivo(DateTime.utc(2026, 11, 3, 10)), isNull);
    expect(motivo(DateTime.utc(2026, 11, 10)), isNotNull);
    expect(motivo(DateTime.utc(2026, 11, 10), defecto: true), isNull);
    expect(motivo(DateTime.utc(2026, 11, 3, 10), cantidad: 2), isNotNull);
  });

  test('CU19: la diferencia usa la misma formula que el servidor', () {
    double d(double original, double nueva, {double pct = 0, bool respetar = true}) => diferenciaCambio(
          precioPagado: 100, precioActualOriginal: original, precioActualNueva: nueva, cantidad: 1,
          descuentoDeterioroPct: pct, respetarPrecioOriginal: respetar,
        );
    expect(d(120, 120), 0);
    expect(d(120, 140), 20);
    expect(d(120, 140, respetar: false), 40);
    expect(d(100, 80), -20);
    expect(d(100, 100, pct: 30), 30);
  });

  test('CU20: el efectivo de las operaciones de esa caja', () {
    final efectivo = efectivoDeOperaciones([
      operacion(datos: {'uuidCaja': 'a', 'total': 100}),
      operacion(tipo: 'cambio', datos: {'uuidCaja': 'a', 'montoCobrado': 20}),
      operacion(tipo: 'cancelar_reserva', datos: {'uuidCaja': 'a', 'devolverDeposito': 30}),
      operacion(estado: 'Rechazada', datos: {'uuidCaja': 'a', 'total': 999}),
      operacion(datos: {'uuidCaja': 'b', 'total': 999}),
    ], 'a');
    expect(efectivo.ingresos, 120);
    expect(efectivo.egresos, 30);
  });
}
