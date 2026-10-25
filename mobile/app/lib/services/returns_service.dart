import '../models/devolucion_model.dart';
import '../models/sucursal_model.dart';
import 'api_client.dart';

/// Devoluciones del cliente desde la app (CU2, CU7, CU9, CU11):
/// `backend/app/routers/returns.py` y `credit_notes.py`. El backend
/// auto-escopa todo al Cliente autenticado.
class ReturnsService {
  final ApiClient _api;

  ReturnsService(this._api);

  Future<PoliticaDevolucion> getPolitica({int? idTenant}) async {
    final data = await _api.get('/api/returns/politica', query: idTenant == null ? null : {'idTenant': '$idTenant'});
    return PoliticaDevolucion.fromJson(data as Map<String, dynamic>);
  }

  /// Compras del cliente con la elegibilidad de cada prenda (CU2 pasos 1-2).
  Future<List<CompraDevolucion>> getMisCompras() async {
    final data = await _api.get('/api/returns/mis-compras') as List;
    return data.cast<Map<String, dynamic>>().map(CompraDevolucion.fromJson).toList();
  }

  Future<List<CasoDevolucion>> getMisCasos() async {
    final data = await _api.get('/api/returns') as List;
    return data.cast<Map<String, dynamic>>().map(CasoDevolucion.fromJson).toList();
  }

  /// Linea de tiempo del caso (CU11).
  Future<List<EventoDevolucion>> getLineaTiempo(int idDevolucion) async {
    final data = await _api.get('/api/returns/$idDevolucion') as Map<String, dynamic>;
    return (data['lineaTiempo'] as List).cast<Map<String, dynamic>>().map(EventoDevolucion.fromJson).toList();
  }

  Future<QrDevolucion> getQr(int idDevolucion) async {
    final data = await _api.get('/api/returns/$idDevolucion/qr');
    return QrDevolucion.fromJson(data as Map<String, dynamic>);
  }

  Future<List<NotaCreditoCliente>> getMisNotas() async {
    final data = await _api.get('/api/credit-notes') as List;
    return data.cast<Map<String, dynamic>>().map(NotaCreditoCliente.fromJson).toList();
  }

  /// Catalogo de la empresa que vendio, para elegir la prenda de reemplazo.
  Future<List<ProductoReemplazo>> getCatalogo(int idTenant) async {
    final data = await _api.get('/api/products', query: {'idTenant': '$idTenant', 'size': '100'}, auth: false) as Map<String, dynamic>;
    return (data['items'] as List).cast<Map<String, dynamic>>().map(ProductoReemplazo.fromJson).toList();
  }

  Future<List<Sucursal>> getSucursales(int idTenant) async {
    final data = await _api.get('/api/inventory/locations', query: {'idTenant': '$idTenant'}, auth: false) as List;
    return data.map((e) => Sucursal.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Disponibilidad de la variante pedida en cada sucursal (CU2 paso 4).
  Future<List<StockSucursal>> getStock(int idProducto) async {
    final data = await _api.get('/api/returns/stock/$idProducto') as List;
    return data.cast<Map<String, dynamic>>().map(StockSucursal.fromJson).toList();
  }

  Future<CasoDevolucion> solicitar({
    required int idVenta,
    required int idProducto,
    required int cantidad,
    required String motivoCategoria,
    String? motivo,
    required String tipo,
    int? idProductoNuevo,
    required int codigoSucursal,
  }) async {
    final data = await _api.post('/api/returns/solicitudes', body: {
      'idVenta': idVenta,
      'idProducto': idProducto,
      'cantidad': cantidad,
      'motivoCategoria': motivoCategoria,
      'motivo': motivo,
      'tipo': tipo,
      'idProductoNuevo': idProductoNuevo,
      'codigoSucursal': codigoSucursal,
    });
    return CasoDevolucion.fromJson(data as Map<String, dynamic>);
  }

  Future<void> cancelar(int idDevolucion) async {
    await _api.post('/api/returns/$idDevolucion/cancelar', body: {});
  }
}
