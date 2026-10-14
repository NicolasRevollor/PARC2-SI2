import '../models/recomendacion_model.dart';
import 'api_client.dart';

/// Mobile Fase 4: `GET /api/recommendations` — auto-escopado al Cliente
/// autenticado del lado del servidor (mismo criterio que
/// `ReservationsService`, nunca se manda un idCliente desde el cliente).
class RecommendationsService {
  final ApiClient _api;

  RecommendationsService(this._api);

  Future<List<Recomendacion>> getMisRecomendaciones() async {
    final data = await _api.get('/api/recommendations') as List;
    return data
        .cast<Map<String, dynamic>>()
        .map(Recomendacion.fromJson)
        .toList();
  }
}
