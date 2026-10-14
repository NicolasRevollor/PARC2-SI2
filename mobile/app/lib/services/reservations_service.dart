import 'api_client.dart';

/// Mobile Fase 3: `POST /api/reservations` / `GET /api/reservations`
/// (`backend/app/schemas/fase2.py::ReservaIn`/`ReservaOut`). Nunca se manda
/// `idCliente` — se deriva del JWT para un Cliente autenticado, mismo
/// criterio que `SalesService`.
class ReservationsService {
  final ApiClient _api;

  ReservationsService(this._api);

  /// `fecha`: `YYYY-MM-DD`. `horario`: `HH:MM`. `idMetPago` debe venir de un
  /// `PagoIntentVerificadoOut.idMetPago` con `pagado == true` — nunca se
  /// llama esto sin un cobro de deposito ya verificado.
  Future<Map<String, dynamic>> crearReserva({
    required String fecha,
    required String horario,
    required int codigoSucursal,
    required int idProducto,
    required int idMetPago,
  }) async {
    final data = await _api.post(
      '/api/reservations',
      body: {
        'fecha': fecha,
        'horario': horario,
        'codigoSucursal': codigoSucursal,
        'idProducto': idProducto,
        'idMetPago': idMetPago,
      },
    ) as Map<String, dynamic>;
    return data;
  }

  /// Auto-escopado al Cliente autenticado del lado del servidor.
  Future<List<Map<String, dynamic>>> getMisReservas() async {
    final data = await _api.get('/api/reservations') as List;
    return data.cast<Map<String, dynamic>>();
  }
}
