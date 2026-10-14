import '../models/sucursal_model.dart';
import 'api_client.dart';

/// `GET /api/inventory/locations` — publico, sin auth (mismo criterio que
/// usa la web para listar sucursales al armar una reserva/traspaso).
class LocationsService {
  final ApiClient _api;

  LocationsService(this._api);

  Future<List<Sucursal>> getSucursales() async {
    final data = await _api.get('/api/inventory/locations', auth: false) as List;
    return data
        .map((e) => Sucursal.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
