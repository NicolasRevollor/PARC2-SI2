import 'package:uuid/uuid.dart';

import 'api_client.dart';

/// Pasos 1 y 2 del checkout (Mobile Fase 2) contra `/api/payments/*` —
/// mismo contrato que ya usa la web (`backend/app/schemas/fase2.py`:
/// `PagoIntentIn`/`PagoIntentOut`/`PagoIntentVerificadoOut`). Compra online
/// (no POS): nunca se manda `codigoSucursal`, el backend resuelve una
/// sucursal con stock suficiente por su cuenta.
class PaymentsService {
  final ApiClient _api;
  static const _uuid = Uuid();

  PaymentsService(this._api);

  /// `items`: `[{'idProducto': int, 'cantidad': int}, ...]`.
  ///
  /// `proposito`/`codigoSucursal` (Mobile Fase 3): para una reserva
  /// (`proposito: 'reserva_deposito'`) `codigoSucursal` es OBLIGATORIO — el
  /// backend valida stock EN esa sucursal y aplica un piso minimo de
  /// deposito antes de llamar a Stripe. Para una compra online (default,
  /// `proposito: 'venta'`) `codigoSucursal` NUNCA se manda — el backend
  /// resuelve la sucursal por su cuenta. Default sin cambios respecto a
  /// Fase 2: llamar sin estos dos parametros sigue comportandose igual.
  Future<Map<String, dynamic>> crearIntent(
    List<Map<String, dynamic>> items, {
    String? concepto,
    String proposito = 'venta',
    int? codigoSucursal,
  }) async {
    final data = await _api.post(
      '/api/payments/intents',
      body: {
        'items': items,
        'claveIntento': _uuid.v4(),
        if (concepto != null) 'concepto': concepto,
        'proposito': proposito,
        if (codigoSucursal != null) 'codigoSucursal': codigoSucursal,
      },
    ) as Map<String, dynamic>;
    return data;
  }

  Future<Map<String, dynamic>> verificarIntent(String paymentIntentId) async {
    final data = await _api.post(
      '/api/payments/intents/$paymentIntentId/verify',
    ) as Map<String, dynamic>;
    return data;
  }
}
