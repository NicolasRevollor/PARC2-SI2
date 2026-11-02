import '../models/devolucion_model.dart';
import '../models/sucursal_model.dart';
import 'api_client.dart';

/// Devoluciones del cliente desde la app (CU2, CU7, CU9, CU11):
/// `backend/app/routers/returns.py` y `notificaciones.py`. El backend
/// auto-escopa todo al Cliente autenticado.
// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU2] Solicitar devolucion o cambio desde la tienda en linea
// [CU7] Emitir nota de devolucion
// [CU9] Configurar politica de devoluciones y cambios
// Diagramas del informe: "Robustez CU2" y "Clases CU2", "Robustez CU7" y "Clases CU7", "Robustez CU9" y "Clases CU9"
// En palabras simples: puente de la app movil con el backend de devoluciones (backend/app/routers/returns.py).
// ==================================================================
class ReturnsService {
  final ApiClient _api;

  ReturnsService(this._api);

  // [CU9] obtenerPoliticaVigente() -> GET /api/returns/politica
  Future<PoliticaDevolucion> getPolitica({int? idTenant}) async {
    final data = await _api.get('/api/returns/politica', query: idTenant == null ? null : {'idTenant': '$idTenant'});
    return PoliticaDevolucion.fromJson(data as Map<String, dynamic>);
  }

  /// Compras del cliente con la elegibilidad de cada prenda (CU2 pasos 1-2).
  // [CU2] ControlDevoluciones.listarMisCompras() -> GET /api/returns/mis-compras
  // Robustez CU2: control "ControlDevoluciones" (listarMisCompras)
  // Secuencia CU2: listarMisCompras(idCliente) -> "ListarComprasElegibles"
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

  // [CU2] MisComprasUI.mostrarCodigoQR() -> GET /api/returns/{id}/qr
  Future<QrDevolucion> getQr(int idDevolucion) async {
    final data = await _api.get('/api/returns/$idDevolucion/qr');
    return QrDevolucion.fromJson(data as Map<String, dynamic>);
  }

  // AVISOS "TIPO PUSH" (correccion de la ingeniera): "Su prenda sera enviada el viernes",
  //   "Le devolvimos Bs 80"... -> GET /api/notificaciones (backend/app/routers/notificaciones.py)
  Future<List<Notificacion>> getNotificaciones() async {
    final data = await _api.get('/api/notificaciones') as List;
    return data.cast<Map<String, dynamic>>().map(Notificacion.fromJson).toList();
  }

  /// Marca todos los avisos como leidos (POST /api/notificaciones/leer-todas).
  Future<void> leerNotificaciones() async {
    await _api.post('/api/notificaciones/leer-todas');
  }

  // [CU2] "L mas grande o L menos grande": compara la prenda devuelta con la elegida, en cm.
  //   -> GET /api/returns/comparar-tallas (backend: dv.comparar_tallas())
  Future<ComparacionTalla> compararTallas(int idOriginal, int idNuevo) async {
    final data = await _api.get('/api/returns/comparar-tallas', query: {'idOriginal': '$idOriginal', 'idNuevo': '$idNuevo'});
    return ComparacionTalla.fromJson(data as Map<String, dynamic>);
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
  // [CU2] ControlDevoluciones.consultarStock() -> GET /api/returns/stock/{idProducto}
  Future<List<StockSucursal>> getStock(int idProducto) async {
    final data = await _api.get('/api/returns/stock/$idProducto') as List;
    return data.cast<Map<String, dynamic>>().map(StockSucursal.fromJson).toList();
  }

  // [CU2] ControlDevoluciones.enviarSolicitud() -> POST /api/returns/solicitudes
  // Robustez CU2: control "ControlDevoluciones" (enviarSolicitud)
  // Secuencia CU2: enviarSolicitud(...) -> "ValidarSolicitud" -> "RegistrarSolicitudEnLinea"
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

  // [CU2] flujo alternativo 3 -> POST /api/returns/{id}/cancelar
  Future<void> cancelar(int idDevolucion) async {
    await _api.post('/api/returns/$idDevolucion/cancelar', body: {});
  }
}
