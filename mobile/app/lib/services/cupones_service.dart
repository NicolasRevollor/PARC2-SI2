import 'api_client.dart';

// [CU33] Obtener y usar cupon de descuento por compras.
// Control: backend/app/routers/cupones.py (ControlCupones). Cada 3 compras en una
// tienda el cliente gana un cupon del 30% para su siguiente compra en esa tienda.
class CuponesService {
  final ApiClient _api;

  CuponesService(this._api);

  /// `{cupones: [...], progreso: [...], regla: '...'}`
  Future<Map<String, dynamic>> misCupones() async {
    return await _api.get('/api/cupones/mios') as Map<String, dynamic>;
  }

  /// Total del carrito con o sin cupon y los cupones que sirven para esa tienda.
  Future<Map<String, dynamic>> cotizar(List<Map<String, dynamic>> items, int? idCupon) async {
    return await _api.post('/api/cupones/cotizar', body: {'items': items, 'idCupon': idCupon}) as Map<String, dynamic>;
  }
}
