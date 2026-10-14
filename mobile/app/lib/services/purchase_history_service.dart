import 'api_client.dart';
import '../models/purchase_history_model.dart';

/// Mobile Fase 5: `GET /api/purchase-history`
/// (`backend/app/routers/purchase_history.py`). Auto-escopado al Cliente
/// autenticado del lado del servidor — no recibe parametros.
class PurchaseHistoryService {
  final ApiClient _api;

  PurchaseHistoryService(this._api);

  Future<List<PurchaseHistoryItem>> getHistorialCompras() async {
    final data = await _api.get('/api/purchase-history') as List;
    return data
        .cast<Map<String, dynamic>>()
        .map(PurchaseHistoryItem.fromJson)
        .toList();
  }
}
