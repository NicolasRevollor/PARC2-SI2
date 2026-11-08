import 'api_client.dart';

// [CU34] Avisar cuando vuelve el stock de una talla -> /api/avisos-stock
// [CU35] Entregar a domicilio una compra en linea  -> /api/pedidos
class TiendaService {
  final ApiClient _api;

  TiendaService(this._api);

  /// `{agotado: bool, idAviso: int?}` (sin cantidades: el cliente no ve el stock).
  Future<Map<String, dynamic>> estadoStock(int idProducto) async {
    return await _api.get('/api/avisos-stock/estado/$idProducto') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> pedirAviso(int idProducto) async {
    return await _api.post('/api/avisos-stock', body: {'idProducto': idProducto}) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> misPedidos() async {
    return (await _api.get('/api/pedidos/mios') as List).cast<Map<String, dynamic>>();
  }
}
