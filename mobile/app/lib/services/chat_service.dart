import '../models/chat_message_model.dart';
import 'api_client.dart';

/// Mobile Fase 4: `POST /api/chat` (`backend/app/routers/chat.py`,
/// asistente Gemini). Requiere autenticacion — solo disponible para un
/// Cliente registrado (el backend devuelve 403 si el usuario autenticado
/// no tiene un `Cliente` asociado).
class ChatService {
  final ApiClient _api;

  ChatService(this._api);

  Future<ChatRespuesta> enviarMensaje(
    String mensaje,
    List<ChatMensaje> historial,
  ) async {
    final data = await _api.post(
      '/api/chat',
      body: {
        'mensaje': mensaje,
        'historial': historial.map((h) => h.toJson()).toList(),
      },
    ) as Map<String, dynamic>;
    return ChatRespuesta.fromJson(data);
  }
}
