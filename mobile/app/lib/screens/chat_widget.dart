import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import '../theme/aether_theme.dart';
import '../models/chat_message_model.dart';
import '../services/api_client.dart';
import '../services/chat_service.dart';

const _saludo = '¡Hola! Preguntame sobre el catálogo o tus compras y reservas. Podés escribir o tocar el micrófono y hablarme.';

/// Lo que se MUESTRA en pantalla — puede incluir el saludo local, que
/// nunca se manda al backend.
class _MensajeMostrado {
  final String role;
  final String texto;
  final bool esSaludo;

  const _MensajeMostrado({required this.role, required this.texto, this.esSaludo = false});
}

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU36] Conversar con el asistente virtual (por texto o por voz) — app del cliente
// Boundary: AsistenteUI -> esta pantalla (bottom sheet)
// Control: POST /api/chat (backend/app/routers/chat.py -> services/chat_gemini.py)
// Voz: el telefono convierte la voz en texto (speech_to_text, reconocimiento del
//   sistema) y lee la respuesta en voz alta (flutter_tts). Si se pregunto con la voz,
//   la respuesta se lee sola; el boton del parlante la deja siempre activada.
// `_mensajes` (lo que se ve) va SEPARADO de `_historial` (lo que se envia):
//   `_historial` siempre se reemplaza con lo que devuelve el backend.
// ==================================================================
class ChatWidget extends StatefulWidget {
  const ChatWidget({super.key});

  @override
  State<ChatWidget> createState() => _ChatWidgetState();
}

class _ChatWidgetState extends State<ChatWidget> {
  late final ChatService _chatService = ChatService(ApiClient());
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  final stt.SpeechToText _voz = stt.SpeechToText();
  final FlutterTts _lector = FlutterTts();

  final List<_MensajeMostrado> _mensajes = [
    const _MensajeMostrado(role: 'model', texto: _saludo, esSaludo: true),
  ];
  List<ChatMensaje> _historial = [];

  bool _cargando = false;
  String? _error;
  // [CU36] voz
  bool _vozLista = false;
  bool _escuchando = false;
  bool _leerSiempre = false;
  String? _idioma;

  @override
  void initState() {
    super.initState();
    _lector.setLanguage('es-ES');
    _lector.setSpeechRate(0.5);
  }

  @override
  void dispose() {
    _voz.cancel();
    _lector.stop();
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

  Future<void> _enviar({bool porVoz = false}) async {
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
      if (!mounted) return;
      setState(() {
        _historial = res.historial;
        _mensajes.add(_MensajeMostrado(role: 'model', texto: res.respuesta));
        _cargando = false;
      });
      _scrollAlFinal();
      // Si pregunto hablando, la respuesta se lee en voz alta.
      if (porVoz || _leerSiempre) await _lector.speak(res.respuesta);
    } on ApiException catch (e) {
      // El motivo real (IA no configurada, sin conexion...) se muestra en el chat.
      if (mounted) {
        setState(() {
          _cargando = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _cargando = false;
          _error = 'No se pudo obtener respuesta. Intenta de nuevo.';
        });
      }
    }
  }

  // ---- [CU36] voz -----------------------------------------------------------

  Future<bool> _prepararVoz() async {
    if (_vozLista) return true;
    final ok = await _voz.initialize(
      onStatus: (estado) {
        if ((estado == 'done' || estado == 'notListening') && mounted) setState(() => _escuchando = false);
      },
      onError: (error) {
        if (!mounted) return;
        setState(() {
          _escuchando = false;
          if (error.errorMsg != 'error_no_match' && error.errorMsg != 'error_speech_timeout') {
            _error = 'No se pudo escuchar (${error.errorMsg}). Podés escribir tu pregunta.';
          }
        });
      },
    );
    if (!ok) return false;
    // Espanol de Bolivia si el telefono lo tiene; si no, cualquier espanol.
    final idiomas = await _voz.locales();
    final es = idiomas.where((l) => l.localeId.toLowerCase().startsWith('es')).toList();
    _idioma = (es.where((l) => l.localeId.toLowerCase().contains('bo')).firstOrNull ?? es.firstOrNull)?.localeId;
    _vozLista = true;
    return true;
  }

  Future<void> _escuchar() async {
    await _lector.stop();
    setState(() => _error = null);
    if (!await _prepararVoz()) {
      if (mounted) {
        setState(() => _error = 'El micrófono no está disponible (sin permiso o sin reconocimiento de voz). Podés escribir tu pregunta.');
      }
      return;
    }
    setState(() => _escuchando = true);
    await _voz.listen(
      listenOptions: stt.SpeechListenOptions(
        localeId: _idioma,
        listenFor: const Duration(seconds: 20),
        pauseFor: const Duration(seconds: 3),
        partialResults: true,
        cancelOnError: true,
      ),
      onResult: (r) {
        if (!mounted) return;
        setState(() => _inputController.text = r.recognizedWords);
        if (r.finalResult) {
          setState(() => _escuchando = false);
          if (r.recognizedWords.trim().length >= 2) _enviar(porVoz: true);
        }
      },
    );
  }

  Future<void> _detener() async {
    await _voz.stop();
    if (mounted) setState(() => _escuchando = false);
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
                Row(
                  children: [
                    // [CU36] leer siempre las respuestas en voz alta
                    IconButton(
                      tooltip: _leerSiempre ? 'Leyendo las respuestas en voz alta' : 'Leer las respuestas en voz alta',
                      icon: Icon(_leerSiempre ? Icons.volume_up : Icons.volume_off),
                      onPressed: () {
                        setState(() => _leerSiempre = !_leerSiempre);
                        if (!_leerSiempre) _lector.stop();
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
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

          if (_escuchando)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('Escuchando… hablá y tocá el micrófono para terminar.',
                  style: GoogleFonts.outfit(fontSize: 11, color: Colors.red.shade700)),
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
                // [CU36] comando de voz
                IconButton(
                  tooltip: _escuchando ? 'Terminar' : 'Hablar',
                  icon: Icon(_escuchando ? Icons.stop_circle : Icons.mic),
                  color: _escuchando ? Colors.red.shade700 : AetherTheme.charcoalDark,
                  onPressed: _cargando ? null : (_escuchando ? _detener : _escuchar),
                ),
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    enabled: !_cargando,
                    onSubmitted: (_) => _enviar(),
                    style: GoogleFonts.sourceSerif4(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: _escuchando ? 'Escuchando…' : 'Escribí o hablá…',
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
                  onPressed: _cargando ? null : () => _enviar(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
