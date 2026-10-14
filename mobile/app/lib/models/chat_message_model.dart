/// Mobile Fase 4: mapea `ChatMensaje` (`backend/app/schemas/chat.py`).
/// `role` es siempre `'user'` o `'model'` — el backend lo valida como
/// `Literal["user", "model"]`.
class ChatMensaje {
  final String role;
  final String texto;

  const ChatMensaje({required this.role, required this.texto});

  factory ChatMensaje.fromJson(Map<String, dynamic> json) {
    return ChatMensaje(
      role: json['role'] as String,
      texto: json['texto'] as String,
    );
  }

  Map<String, dynamic> toJson() => {'role': role, 'texto': texto};
}

/// Respuesta tipada de `POST /api/chat`. El backend devuelve el historial
/// COMPLETO actualizado — el cliente nunca lo arma a mano, siempre
/// reemplaza con esto (mismo criterio que
/// `web/src/app/shared/components/chat-widget.component.ts`).
class ChatRespuesta {
  final String respuesta;
  final List<ChatMensaje> historial;

  const ChatRespuesta({required this.respuesta, required this.historial});

  factory ChatRespuesta.fromJson(Map<String, dynamic> json) {
    return ChatRespuesta(
      respuesta: json['respuesta'] as String,
      historial: (json['historial'] as List)
          .cast<Map<String, dynamic>>()
          .map(ChatMensaje.fromJson)
          .toList(),
    );
  }
}
