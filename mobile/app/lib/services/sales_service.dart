import 'api_client.dart';

/// Paso 3 del checkout (Mobile Fase 2): `POST /api/sales`
/// (`backend/app/schemas/fase2.py::VentaIn`/`VentaOut`). Nunca se manda
/// `idCliente` (se deriva del JWT para un Cliente autenticado) ni
/// `codigoSucursal` (compra online, el backend resuelve la sucursal).
class SalesService {
  final ApiClient _api;

  SalesService(this._api);

  /// `items`: `[{'idProducto': int, 'cantidad': int}, ...]`. `idMetPago`
  /// debe venir de un `PagoIntentVerificadoOut.idMetPago` con
  /// `pagado == true` — nunca se llama esto sin un cobro ya verificado.
  Future<Map<String, dynamic>> crearVenta(
    int idMetPago,
    List<Map<String, dynamic>> items, {
    int? idCupon, // [CU33]
    Map<String, dynamic>? entrega, // [CU35] envio a domicilio
  }) async {
    final data = await _api.post(
      '/api/sales',
      body: {'idMetPago': idMetPago, 'items': items, if (idCupon != null) 'idCupon': idCupon, if (entrega != null) 'entrega': entrega},
    ) as Map<String, dynamic>;
    return data;
  }
}
