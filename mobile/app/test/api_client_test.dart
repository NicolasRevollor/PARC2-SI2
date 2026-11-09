import 'dart:async';
import 'package:aether_fashion/services/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('lee JSON y texto UTF-8 sin pedir sesión para el catálogo', () async {
    final api = ApiClient(client: MockClient((request) async {
      expect(request.headers.containsKey('Authorization'), false);
      return http.Response.bytes([123,34,110,111,109,98,114,101,34,58,34,80,111,108,101,114,97,34,125], 200);
    }));
    expect(await api.get('/api/products', auth: false), {'nombre': 'Polera'});
  });

  test('conserva el motivo del servidor', () async {
    final api = ApiClient(client: MockClient((_) async => http.Response('{"detail":"Sin stock"}', 409)));
    await expectLater(api.get('/test', auth: false), throwsA(isA<ApiException>()
        .having((e) => e.statusCode, 'estado', 409).having((e) => e.message, 'mensaje', 'Sin stock')));
  });

  test('una conexión caída produce un error manejable', () async {
    final api = ApiClient(client: MockClient((_) async => throw http.ClientException('Sin red')));
    await expectLater(api.get('/test', auth: false), throwsA(isA<ApiException>().having((e) => e.statusCode, 'estado', 0)));
  });

  test('el timeout no deja el indicador cargando para siempre', () async {
    final pendiente = Completer<http.Response>();
    final api = ApiClient(client: MockClient((_) => pendiente.future), timeout: const Duration(milliseconds: 5));
    await expectLater(api.get('/test', auth: false), throwsA(isA<ApiException>().having((e) => e.statusCode, 'estado', 408)));
    pendiente.complete(http.Response('{}', 200));
  });

  test('respuesta inválida produce error controlado', () async {
    final api = ApiClient(client: MockClient((_) async => http.Response('<html>Error</html>', 200)));
    await expectLater(api.get('/test', auth: false), throwsA(isA<ApiException>().having((e) => e.statusCode, 'estado', 502)));
  });
}
