import '@angular/compiler';
import assert from 'node:assert/strict';
import test from 'node:test';
import { of, throwError } from 'rxjs';
import { PaymentsService } from './payments.service';

test('habilita comprar con la clave publica del backend sin una clave VITE', async () => {
  let consultas = 0;
  const http = { get: () => { consultas++; return of({ disponible: true, publishableKey: 'pk_test_backend' }); } };
  const service = new PaymentsService(http as any, {} as any);
  await Promise.all([service.cargarConfiguracion(), service.cargarConfiguracion()]);
  assert.equal(service.disponible(), true);
  assert.equal(consultas, 1);
});

test('un backend sin pagos o una clave secreta mal ubicada no habilitan comprar', async () => {
  for (const config of [
    { disponible: false, publishableKey: 'pk_test_backend' },
    { disponible: true, publishableKey: 'sk_test_no_publicar' },
    { disponible: true, publishableKey: null },
  ]) {
    const service = new PaymentsService({ get: () => of(config) } as any, {} as any);
    await service.cargarConfiguracion();
    assert.equal(service.disponible(), false);
  }
});

test('una falla de red permite recuperar la configuracion en el proximo intento', async () => {
  let consultas = 0;
  const http = { get: () => ++consultas === 1
    ? throwError(() => new Error('Sin red'))
    : of({ disponible: true, publishableKey: 'pk_test_backend' }) };
  const service = new PaymentsService(http as any, {} as any);
  await service.cargarConfiguracion();
  assert.equal(service.disponible(), false);
  await service.cargarConfiguracion();
  assert.equal(service.disponible(), true);
  assert.equal(consultas, 2);
});
