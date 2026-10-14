import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/aether_theme.dart';
import '../models/chat_message_model.dart';
import '../services/api_client.dart';
import '../services/chat_service.dart';

const _saludo = '¡Hola! Preguntame sobre el catálogo o tus compras/reservas.';

/// Lo que se MUESTRA en pantalla — puede incluir el saludo local, que
/// nunca se manda al backend.
class _MensajeMostrado {
  final String role;
  final String texto;
  final bool esSaludo;

  const _MensajeMostrado({required this.role, required this.texto, this.esSaludo = false});
}

/// Mobile Fase 4 (CU23): asistente virtual Gemini. Bottom sheet, mismo
/// patron de presentacion que `CartModal`. `_mensajes` (display) se
/// mantiene SEPARADO de `_historial` (lo que se envia) — `_historial`
/// siempre se reemplaza entero con lo que devuelve el backend, nunca se
/// arma a mano (mismo criterio que
/// `web/src/app/shared/components/chat-widget.component.ts`).
class ChatWidget extends StatefulWidget {
  const ChatWidget({super.key});

  @override
  State<ChatWidget> createState() => _ChatWidgetState();
}

class _ChatWidgetState extends State<ChatWidget> {
  late final ChatService _chatService = ChatService(ApiClient());
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();

  final List<_MensajeMostrado> _mensajes = [
    const _MensajeMostrado(role: 'model', texto: _saludo, esSaludo: true),
  ];
  List<ChatMensaje> _historial = [];

  bool _cargando = false;
  String? _error;

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollAlFinal() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _enviar() async {
    final texto = _inputController.text.trim();
    if (texto.isEmpty || _cargando) return;

    _inputController.clear();
    setState(() {
      _error = null;
      _mensajes.add(_MensajeMostrado(role: 'user', texto: texto));
      _cargando = true;
    });
    _scrollAlFinal();

    try {
      final res = await _chatService.enviarMensaje(texto, _historial);
      setState(() {
        _historial = res.historial;
        _mensajes.add(_MensajeMostrado(role: 'model', texto: res.respuesta));
        _cargando = false;
      });
      _scrollAlFinal();
    } catch (e) {
      setState(() {
        _cargando = false;
        _error = 'No se pudo obtener respuesta. Intenta de nuevo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: const BoxDecoration(
        color: AetherTheme.sandLight,
        borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.smart_toy_outlined, size: 18, color: AetherTheme.bronze),
                    const SizedBox(width: 8),
                    Text('Asistente YouShop', style: GoogleFonts.outfit(fontSize: 15, fontWeight: FontWeight.w600)),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AetherTheme.outline),

          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _mensajes.length,
              itemBuilder: (context, index) {
                final m = _mensajes[index];
                final esUsuario = m.role == 'user';
                return Align(
                  alignment: esUsuario ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                    decoration: BoxDecoration(
                      color: esUsuario ? AetherTheme.charcoalDark : Colors.white,
                      border: esUsuario ? null : Border.all(color: AetherTheme.outline),
                      borderRadius: BorderRadius.circular(2),
                    ),
                    child: Text(
                      m.texto,
                      style: GoogleFonts.sourceSerif4(
                        fontSize: 13,
                        fontStyle: m.esSaludo ? FontStyle.italic : FontStyle.normal,
                        color: esUsuario ? AetherTheme.sandLight : AetherTheme.charcoalDark,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          if (_cargando)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('Escribiendo…', style: GoogleFonts.outfit(fontSize: 11, color: const Color(0xFF7B776E))),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(_error!, style: GoogleFonts.outfit(fontSize: 11, color: Colors.red.shade700)),
            ),

          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    enabled: !_cargando,
                    onSubmitted: (_) => _enviar(),
                    style: GoogleFonts.sourceSerif4(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Escribí tu pregunta…',
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(2), borderSide: const BorderSide(color: AetherTheme.outline)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send),
                  color: AetherTheme.charcoalDark,
                  onPressed: _cargando ? null : _enviar,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
