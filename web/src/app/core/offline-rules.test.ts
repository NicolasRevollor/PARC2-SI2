import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OperacionLocal,
  PoliticaLocal,
  arqueo,
  calcularCambio,
  datosDesactualizados,
  diferenciaCambio,
  efectivoDeOperaciones,
  esperaReintento,
  evaluarCambioLocal,
  existenciaLocal,
  ordenarCola,
} from './offline-rules';

function operacion(parcial: Partial<OperacionLocal>): OperacionLocal {
  return {
    uuidOperacion: crypto.randomUUID(), tipo: 'venta', estado: 'Registrada localmente', idTenant: 1, idUsuario: '1',
    codigoSucursal: 1, fechaOperacion: '2026-11-03T10:00:00Z', dependeDe: null, total: 0, resumen: '', datos: {},
    intentos: 0, ultimoIntento: null, fechaConfirmacion: null, idServidor: null, motivo: null, tipoConflicto: null,
    ...parcial,
  };
}

const inventario = { idInv: 1, idProducto: 7, codigoSucursal: 1, cantidad_actual: 5, cantidad_reservada: 1 };
const venta = (cantidad: number, estado: OperacionLocal['estado'] = 'Registrada localmente') =>
  operacion({ estado, datos: { items: [{ idProducto: 7, cantidad, precioUnitario: 10 }] } });

test('CU13: la existencia local resta ventas y reservas del dispositivo', () => {
  const reserva = operacion({ tipo: 'reserva', datos: { items: [{ idProducto: 7, cantidad: 1, precioUnitario: 10 }] } });
  assert.equal(existenciaLocal(inventario, [venta(2), reserva], 7, null), 1);
});

test('CU13: una venta rechazada no descuenta y la existencia nunca es negativa', () => {
  assert.equal(existenciaLocal(inventario, [venta(1, 'Rechazada')], 7, null), 4);
  assert.equal(existenciaLocal(inventario, [venta(9)], 7, null), 0);
});

test('CU13: lo confirmado antes de la descarga ya está en el snapshot', () => {
  const antes = { ...venta(1, 'Confirmada'), fechaConfirmacion: '2026-11-03T09:00:00Z' };
  const despues = { ...venta(1, 'Confirmada'), fechaConfirmacion: '2026-11-03T11:00:00Z' };
  assert.equal(existenciaLocal(inventario, [antes, despues], 7, '2026-11-03T10:00:00Z'), 3);
});

test('CU15: cancelar una reserva local libera lo apartado', () => {
  const reserva = operacion({ tipo: 'reserva', datos: { items: [{ idProducto: 7, cantidad: 2, precioUnitario: 10 }] } });
  const cancelar = operacion({ tipo: 'cancelar_reserva', datos: { uuidReserva: reserva.uuidOperacion } });
  assert.equal(existenciaLocal(inventario, [reserva, cancelar], 7, null), 4);
});

test('CU13: desactualizado pasado el tiempo configurado', () => {
  const ahora = new Date('2026-11-03T12:00:00Z');
  assert.equal(datosDesactualizados('2026-11-03T00:00:00Z', 24, ahora), false);
  assert.equal(datosDesactualizados('2026-11-01T00:00:00Z', 24, ahora), true);
  assert.equal(datosDesactualizados(null, 24, ahora), true);
});

test('CU14: el cambio se calcula y un monto menor no alcanza', () => {
  assert.equal(calcularCambio(90.5, 100), 9.5);
  assert.equal(calcularCambio(100, 100), 0);
  assert.equal(calcularCambio(100, 99.99), null);
});

test('CU17: los reintentos crecen hasta el tope', () => {
  assert.equal(esperaReintento(1), 5_000);
  assert.equal(esperaReintento(3), 20_000);
  assert.equal(esperaReintento(50), 300_000);
});

test('CU17: el cambio sale después de la venta de la que depende', () => {
  const ventaLocal = operacion({ fechaOperacion: '2026-11-03T11:00:00Z' });
  const cambio = operacion({ tipo: 'cambio', fechaOperacion: '2026-11-03T10:00:00Z', dependeDe: ventaLocal.uuidOperacion });
  const otra = operacion({ fechaOperacion: '2026-11-03T09:00:00Z' });
  assert.deepEqual(ordenarCola([cambio, ventaLocal, otra]).map(o => o.uuidOperacion), [
    otra.uuidOperacion, ventaLocal.uuidOperacion, cambio.uuidOperacion,
  ]);
});

const politica: PoliticaLocal = {
  plazoCambioHoras: 24, plazoGarantiaDias: 30, accionFueraPlazo: 'rechazar', categoriasNoRetornables: ['Interior'],
  maxCambiosPorPrenda: 2, respetarPrecioOriginal: true, accionDeterioro: 'rechazar', descuentoDeterioroPct: 30,
};
const linea = {
  idProducto: 7, nombre: 'Polera', talla: 'M', color: 'Negro', tipo: 'Polera', idModelo: 1, cantidad: 1,
  precioPagado: 100, disponibles: 1, cambios: 0,
};

test('CU19: dentro del plazo se puede cambiar', () => {
  const r = evaluarCambioLocal('2026-11-03T00:00:00Z', linea, 1, false, politica, new Date('2026-11-03T10:00:00Z'));
  assert.equal(r.puede, true);
});

test('CU19: fuera de plazo no, salvo defecto dentro de la garantía', () => {
  const ahora = new Date('2026-11-10T00:00:00Z');
  assert.equal(evaluarCambioLocal('2026-11-03T00:00:00Z', linea, 1, false, politica, ahora).puede, false);
  assert.equal(evaluarCambioLocal('2026-11-03T00:00:00Z', linea, 1, true, politica, ahora).puede, true);
});

test('CU19: cantidades, máximo de cambios y categoría no retornable', () => {
  const ahora = new Date('2026-11-03T01:00:00Z');
  assert.equal(evaluarCambioLocal('2026-11-03T00:00:00Z', linea, 2, false, politica, ahora).puede, false);
  assert.equal(evaluarCambioLocal('2026-11-03T00:00:00Z', { ...linea, cambios: 2 }, 1, false, politica, ahora).puede, false);
  assert.equal(evaluarCambioLocal('2026-11-03T00:00:00Z', { ...linea, tipo: 'Interior' }, 1, false, politica, ahora).puede, false);
});

test('CU19: la diferencia usa la misma fórmula que el servidor', () => {
  assert.equal(diferenciaCambio(100, 120, 120, 1, 0, true), 0);
  assert.equal(diferenciaCambio(100, 120, 140, 1, 0, true), 20);
  assert.equal(diferenciaCambio(100, 120, 140, 1, 0, false), 40);
  assert.equal(diferenciaCambio(100, 100, 80, 1, 0, true), -20);
  assert.equal(diferenciaCambio(100, 100, 100, 1, 30, true), 30);
});

test('CU20: arqueo con el efectivo de las operaciones de esa caja', () => {
  const ops = [
    operacion({ datos: { uuidCaja: 'a', total: 100 } }),
    operacion({ tipo: 'cambio', datos: { uuidCaja: 'a', montoCobrado: 20 } }),
    operacion({ tipo: 'cancelar_reserva', datos: { uuidCaja: 'a', devolverDeposito: 30 } }),
    operacion({ estado: 'Rechazada', datos: { uuidCaja: 'a', total: 999 } }),
    operacion({ datos: { uuidCaja: 'b', total: 999 } }),
  ];
  const { ingresos, egresos } = efectivoDeOperaciones(ops, 'a');
  assert.deepEqual([ingresos, egresos], [120, 30]);
  assert.deepEqual(arqueo(50, ingresos, egresos, 130), { esperado: 140, diferencia: -10 });
});
