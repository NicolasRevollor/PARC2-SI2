// [CU12] a [CU20] en el movil: el servicio real, con SQLite real, contra un backend real.
// No corre por defecto. Con un backend de pruebas levantado:
//   flutter test test/offline_sync_integracion_test.dart --dart-define=API_PRUEBA=http://127.0.0.1:8010 \
//     --dart-define=CORREO_PRUEBA=cajero@... --dart-define=CLAVE_PRUEBA=... --dart-define=SUCURSAL_PRUEBA=1
import 'dart:convert';

import 'package:aether_fashion/services/api_client.dart';
import 'package:aether_fashion/services/offline_sync_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

const api = String.fromEnvironment('API_PRUEBA');
const correo = String.fromEnvironment('CORREO_PRUEBA');
const clave = String.fromEnvironment('CLAVE_PRUEBA');
const sucursal = int.fromEnvironment('SUCURSAL_PRUEBA', defaultValue: 1);

/// Mismo contrato que ApiClient, sin almacenamiento seguro (no existe fuera del telefono).
class ApiPrueba extends ApiClient {
  ApiPrueba(this.token);
  final String token;

  Map<String, String> get _cabeceras => {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'};

  dynamic _decodificar(http.Response r) {
    if (r.statusCode >= 300) throw ApiException(r.statusCode, utf8.decode(r.bodyBytes));
    return r.body.isEmpty ? null : jsonDecode(utf8.decode(r.bodyBytes));
  }

  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query, bool auth = true}) async {
    final uri = Uri.parse('$api$path').replace(queryParameters: query?.map((k, v) => MapEntry(k, '$v')));
    return _decodificar(await http.get(uri, headers: _cabeceras));
  }

  @override
  Future<dynamic> post(String path, {Object? body, bool auth = true}) async {
    return _decodificar(await http.post(Uri.parse('$api$path'), headers: _cabeceras, body: jsonEncode(body)));
  }
}

void main() {
  test('sin conexion: caja, venta y cambio; al volver la red quedan confirmados', () async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    await databaseFactory.deleteDatabase(await getDatabasesPath() + '/youshop_local.db');

    final login = await http.post(Uri.parse('$api/api/auth/login'),
        headers: {'Content-Type': 'application/json'}, body: jsonEncode({'email': correo, 'password': clave}));
    final sync = OfflineSyncService(ApiPrueba(jsonDecode(login.body)['access_token'] as String));

    // CU12
    expect(await sync.preparar(sucursal), isNull);
    expect(sync.listo, isTrue);
    final catalogo = await sync.catalogo();
    final stock = await sync.existencias();
    expect(catalogo, isNotEmpty);
    final prenda = catalogo.firstWhere((p) =>
        (stock[p['idProducto']] ?? 0) > 0 &&
        p['idModelo'] != null &&
        catalogo.any((o) => o['idModelo'] == p['idModelo'] && o['idProducto'] != p['idProducto'] && o['venta'] == p['venta'] && (stock[o['idProducto']] ?? 0) > 0));
    final otra = catalogo.firstWhere((o) => o['idModelo'] == prenda['idModelo'] && o['idProducto'] != prenda['idProducto'] && o['venta'] == prenda['venta'] && (stock[o['idProducto']] ?? 0) > 0);
    final id = prenda['idProducto'] as int;
    final inicial = stock[id]!;

    // Se corta la red.
    sync.enLinea = false;

    // CU20 apertura
    await sync.abrirCaja(100);
    final uuidCaja = sync.caja!['uuidOperacion'] as String;
    expect(sync.caja!['idCaja'], isNull);

    // CU14 venta
    final precio = (prenda['venta'] as num).toDouble();
    final venta = await sync.registrar(
      tipo: 'venta', total: precio, resumen: 'Venta movil',
      datos: {
        'idCliente': null, 'clienteNuevo': null, 'clienteNombre': 'Cliente generico',
        'items': [{'idProducto': id, 'cantidad': 1, 'precioUnitario': precio, 'nombre': prenda['nombre'], 'stockNoConfirmado': false}],
        'total': precio, 'formaPago': 'Efectivo', 'montoRecibido': precio + 10, 'uuidCaja': uuidCaja,
      },
    );

    // CU13: la existencia local descuenta lo vendido
    expect((await sync.existencias())[id], inicial - 1);

    // CU19 cambio sobre la venta hecha sin conexion
    final propia = (await sync.ventas()).firstWhere((v) => v['uuidOperacion'] == venta.uuidOperacion);
    expect((propia['lineas'] as List).single['idProducto'], id);
    await sync.registrar(
      tipo: 'cambio', resumen: 'Cambio movil', dependeDe: venta.uuidOperacion,
      datos: {
        'uuidVenta': venta.uuidOperacion, 'idProducto': id, 'idProductoNuevo': otra['idProducto'], 'cantidad': 1,
        'tipo': 'cambio_talla', 'motivoCategoria': 'talla', 'condicion': 'apta', 'montoCobrado': 0, 'uuidCaja': uuidCaja,
      },
    );

    // CU16: efectivo y cola en el dispositivo
    expect(sync.efectivoDeCaja().ingresos, precio);
    expect(sync.pendientes, 3);

    // CU20 cierre sin conexion
    await sync.cerrarCaja(100 + precio, null);
    expect(sync.pendientes, 4);

    // CU17: vuelve la red
    sync.enLinea = true;
    expect(await sync.sincronizar(), 4, reason: sync.operaciones.map((o) => '${o.tipo}:${o.estado}:${o.motivo}').join(' | '));
    expect(sync.operaciones.every((o) => o.estado == 'Confirmada'), isTrue);
    expect(sync.pendientes, 0);

    // Reenviar el mismo UUID no duplica.
    final mismo = await ApiPrueba(jsonDecode(login.body)['access_token'] as String).post('/api/sync/estado', body: {'uuids': [venta.uuidOperacion]}) as List;
    expect(mismo.single['estado'], 'Confirmada');
  }, skip: api.isEmpty ? 'Requiere un backend de pruebas (API_PRUEBA)' : false, timeout: const Timeout(Duration(minutes: 3)));
}
