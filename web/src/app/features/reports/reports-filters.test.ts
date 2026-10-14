import '@angular/compiler';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDateRange, buildSalesFiltros, buildInventoryFiltros } from './reports-filters';

test('validateDateRange rejects fecha_desde posterior a fecha_hasta', () => {
  assert.equal(
    validateDateRange('2026-01-10', '2026-01-05'),
    'La fecha "desde" no puede ser posterior a la fecha "hasta".'
  );
});

test('validateDateRange acepta un rango válido o campos vacíos', () => {
  assert.equal(validateDateRange('2026-01-05', '2026-01-10'), null);
  assert.equal(validateDateRange('2026-01-05', '2026-01-05'), null);
  assert.equal(validateDateRange('', ''), null);
  assert.equal(validateDateRange('2026-01-05', ''), null);
  assert.equal(validateDateRange('', '2026-01-10'), null);
});

test('buildSalesFiltros omite campos vacíos/ALL y convierte selects numéricos', () => {
  assert.deepEqual(
    buildSalesFiltros({
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-31',
      codigoSucursal: 'ALL',
      idProducto: '5',
    }),
    { fecha_desde: '2026-01-01', fecha_hasta: '2026-01-31', idProducto: 5 }
  );

  assert.deepEqual(
    buildSalesFiltros({ fechaDesde: '', fechaHasta: '', codigoSucursal: 'ALL', idProducto: 'ALL' }),
    {}
  );
});

test('buildInventoryFiltros omite campos vacíos/ALL y convierte selects numéricos', () => {
  assert.deepEqual(
    buildInventoryFiltros({ codigoSucursal: '3', idProducto: 'ALL' }),
    { codigoSucursal: 3 }
  );

  assert.deepEqual(
    buildInventoryFiltros({ codigoSucursal: 'ALL', idProducto: 'ALL' }),
    {}
  );
});
