import 'package:uuid/uuid.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import 'api_client.dart';

/// Pasos 1 y 2 del checkout (Mobile Fase 2) contra `/api/payments/*` —
/// mismo contrato que ya usa la web (`backend/app/schemas/fase2.py`:
/// `PagoIntentIn`/`PagoIntentOut`/`PagoIntentVerificadoOut`). Compra online
/// (no POS): nunca se manda `codigoSucursal`, el backend resuelve una
/// sucursal con stock suficiente por su cuenta.
class PaymentsService {
  final ApiClient _api;
  static const _uuid = Uuid();
  static String? _claveAplicada;

  PaymentsService(this._api);

  Future<void> configurarStripe() async {
    final config = await _api.get('/api/payments/config', auth: false) as Map<String, dynamic>;
    final clave = config['publishableKey'] as String? ?? '';
    if (config['disponible'] != true || !RegExp(r'^pk_(test|live)_').hasMatch(clave)) {
      throw ApiException(503, 'El pago con tarjeta no está disponible en este momento.');
    }
    if (_claveAplicada != clave) {
      Stripe.publishableKey = clave;
      await Stripe.instance.applySettings();
      _claveAplicada = clave;
    }
  }

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
    int? idCupon, // [CU33] el cobro ya descuenta el cupon
    bool conEnvio = false, // [CU35] el cobro incluye el envio a domicilio
  }) async {
    await configurarStripe();
    final data = await _api.post(
      '/api/payments/intents',
      body: {
        'items': items,
        'claveIntento': _uuid.v4(),
        if (concepto != null) 'concepto': concepto,
        'proposito': proposito,
        if (codigoSucursal != null) 'codigoSucursal': codigoSucursal,
        if (idCupon != null) 'idCupon': idCupon,
        if (conEnvio) 'conEnvio': true,
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
