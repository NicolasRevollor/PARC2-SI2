import 'api_client.dart';
import '../models/customer_model.dart';

/// Mobile Fase 6: `GET/PUT /api/customers/me`
/// (`backend/app/routers/customers.py`). Autogestion — el backend deriva
/// el Cliente del JWT, sin permiso "cliente.ver" (ese es para que staff
/// gestione clientes ajenos).
class CustomerService {
  final ApiClient _api;

  CustomerService(this._api);

  Future<ClienteMe> getMiPerfil() async {
    final data = await _api.get('/api/customers/me') as Map<String, dynamic>;
    return ClienteMe.fromJson(data);
  }

  /// Solo manda las claves de los campos efectivamente pasados (no null) —
  /// el backend usa `exclude_unset=True` en `ClienteMeUpdate`, asi que un
  /// campo ausente en el body queda intacto; mandar `null` explicito lo
  /// borraria, que NUNCA es la intencion de una edicion parcial de perfil.
  Future<ClienteMe> actualizarPerfil({
    String? nombre,
    String? telefono,
    String? direccion,
    int? altura,
    int? pecho,
    int? cintura,
    int? tiro,
  }) async {
    final body = <String, dynamic>{};
    if (nombre != null) body['nombre'] = nombre;
    if (telefono != null) body['telefono'] = telefono;
    if (direccion != null) body['direccion'] = direccion;
    if (altura != null) body['altura'] = altura;
    if (pecho != null) body['pecho'] = pecho;
    if (cintura != null) body['cintura'] = cintura;
    if (tiro != null) body['tiro'] = tiro;

    final data = await _api.put('/api/customers/me', body: body) as Map<String, dynamic>;
    return ClienteMe.fromJson(data);
  }
}
