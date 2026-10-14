import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../theme/aether_theme.dart';
import '../providers/app_state.dart';
import '../models/customer_model.dart';
import '../services/api_client.dart';
import '../services/customer_service.dart';
import 'my_reservations_screen.dart';
import 'purchase_history_screen.dart';

/// Mobile Fase 6: perfil real (`GET/PUT /api/customers/me`). El header
/// (nombre/correo/telefono/direccion) pasa a ser el Cliente real
/// autenticado. CU11 (determinar ajuste de prenda): Medidas Biometricas
/// tambien pasa a ser real (`ClienteMe.altura/pecho/cintura/tiro`,
/// persistidas en el backend). AI Style Insights / Looks Guardados siguen
/// mock (`appState.userProfile`) — no tienen modelo en el backend, fuera
/// de alcance.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final ApiClient _api = ApiClient();
  late final CustomerService _customerService = CustomerService(_api);

  bool _perfilLoading = true;
  String? _perfilError;
  ClienteMe? _miPerfil;

  @override
  void initState() {
    super.initState();
    _cargarPerfil();
  }

  Future<void> _cargarPerfil() async {
    setState(() {
      _perfilLoading = true;
      _perfilError = null;
    });
    try {
      final perfil = await _customerService.getMiPerfil();
      if (!mounted) return;
      setState(() {
        _miPerfil = perfil;
        _perfilLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _perfilError = e.message;
        _perfilLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _perfilError = 'No se pudo cargar tu perfil.';
        _perfilLoading = false;
      });
    }
  }

  void _showEditProfileDialog() {
    final perfil = _miPerfil;
    if (perfil == null) return;
    final nombreCtrl = TextEditingController(text: perfil.nombre);
    final telefonoCtrl = TextEditingController(text: perfil.telefono ?? '');
    final direccionCtrl = TextEditingController(text: perfil.direccion ?? '');
    bool guardando = false;
    String? error;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: AetherTheme.sandLight,
          title: Text('Editar Perfil', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 16)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nombreCtrl, decoration: const InputDecoration(labelText: 'Nombre')),
                TextField(controller: telefonoCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Teléfono')),
                TextField(controller: direccionCtrl, decoration: const InputDecoration(labelText: 'Dirección')),
                if (error != null) ...[
                  const SizedBox(height: 8),
                  Text(error!, style: GoogleFonts.outfit(fontSize: 11, color: Colors.red.shade700)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: guardando ? null : () => Navigator.of(ctx).pop(), child: const Text('CANCELAR')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AetherTheme.charcoalDark, foregroundColor: AetherTheme.sandLight),
              onPressed: guardando
                  ? null
                  : () async {
                      setDialogState(() {
                        guardando = true;
                        error = null;
                      });
                      try {
                        final actualizado = await _customerService.actualizarPerfil(
                          nombre: nombreCtrl.text.trim().isEmpty ? null : nombreCtrl.text.trim(),
                          telefono: telefonoCtrl.text.trim(),
                          direccion: direccionCtrl.text.trim(),
                        );
                        if (!mounted) return;
                        setState(() => _miPerfil = actualizado);
                        if (ctx.mounted) Navigator.of(ctx).pop();
                      } on ApiException catch (e) {
                        setDialogState(() {
                          guardando = false;
                          error = e.message;
                        });
                      } catch (_) {
                        setDialogState(() {
                          guardando = false;
                          error = 'No se pudo guardar el perfil.';
                        });
                      }
                    },
              child: Text(guardando ? 'GUARDANDO…' : 'GUARDAR'),
            ),
          ],
        ),
      ),
    );
  }

  void _showRecalibrateDialog(BuildContext context) {
    final perfil = _miPerfil;
    if (perfil == null) return;
    final hCtrl = TextEditingController(text: perfil.altura?.toString() ?? '');
    final cCtrl = TextEditingController(text: perfil.pecho?.toString() ?? '');
    final wCtrl = TextEditingController(text: perfil.cintura?.toString() ?? '');
    final iCtrl = TextEditingController(text: perfil.tiro?.toString() ?? '');
    bool guardando = false;
    String? error;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: AetherTheme.sandLight,
          title: Text('Recalibrar Medidas', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 16)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: hCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Altura (cm)')),
                TextField(controller: cCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Pecho (cm)')),
                TextField(controller: wCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Cintura (cm)')),
                TextField(controller: iCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Tiro (cm)')),
                if (error != null) ...[
                  const SizedBox(height: 8),
                  Text(error!, style: GoogleFonts.outfit(fontSize: 11, color: Colors.red.shade700)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: guardando ? null : () => Navigator.of(ctx).pop(), child: const Text('CANCELAR')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AetherTheme.charcoalDark, foregroundColor: AetherTheme.sandLight),
              onPressed: guardando
                  ? null
                  : () async {
                      setDialogState(() {
                        guardando = true;
                        error = null;
                      });
                      try {
                        final actualizado = await _customerService.actualizarPerfil(
                          altura: int.tryParse(hCtrl.text),
                          pecho: int.tryParse(cCtrl.text),
                          cintura: int.tryParse(wCtrl.text),
                          tiro: int.tryParse(iCtrl.text),
                        );
                        if (!mounted) return;
                        setState(() => _miPerfil = actualizado);
                        if (ctx.mounted) Navigator.of(ctx).pop();
                      } on ApiException catch (e) {
                        setDialogState(() {
                          guardando = false;
                          error = e.message;
                        });
                      } catch (_) {
                        setDialogState(() {
                          guardando = false;
                          error = 'No se pudieron guardar las medidas.';
                        });
                      }
                    },
              child: Text(guardando ? 'GUARDANDO…' : 'GUARDAR'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final profile = appState.userProfile;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // User Header — Mobile Fase 6: nombre/correo/telefono/direccion
          // reales (`GET /api/customers/me`). `avatarUrl` sigue de
          // `dummyUserProfile`: no hay campo equivalente en el backend.
          Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundImage: NetworkImage(profile.avatarUrl),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: _perfilLoading
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AetherTheme.charcoalDark),
                      )
                    : _perfilError != null
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_perfilError!, style: GoogleFonts.outfit(fontSize: 11, color: Colors.red.shade700)),
                              TextButton(
                                onPressed: _cargarPerfil,
                                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                                child: const Text('Reintentar'),
                              ),
                            ],
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_miPerfil!.nombre, style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.w600, color: AetherTheme.charcoalDark)),
                              Text(_miPerfil!.correo ?? '', style: GoogleFonts.sourceSerif4(fontSize: 12, color: const Color(0xFF7B776E))),
                              if ((_miPerfil!.telefono ?? '').isNotEmpty || (_miPerfil!.direccion ?? '').isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    [
                                      if ((_miPerfil!.telefono ?? '').isNotEmpty) _miPerfil!.telefono,
                                      if ((_miPerfil!.direccion ?? '').isNotEmpty) _miPerfil!.direccion,
                                    ].join(' · '),
                                    style: GoogleFonts.sourceSerif4(fontSize: 11, color: const Color(0xFF7B776E)),
                                  ),
                                ),
                            ],
                          ),
              ),
              if (!_perfilLoading && _perfilError == null && _miPerfil != null)
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 20, color: AetherTheme.charcoalDark),
                  tooltip: 'Editar Perfil',
                  onPressed: _showEditProfileDialog,
                ),
            ],
          ),

          const SizedBox(height: 16),

          // Mobile Fase 3: acceso a reservas reales (CU12). Estrictamente
          // aditivo — no toca las secciones mock de abajo (medidas, estilo
          // IA, looks guardados), esas quedan para otra fase.
          SizedBox(
            width: double.infinity,
            height: 40,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.event_available, size: 16),
              label: Text('MIS RESERVAS', style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
              style: OutlinedButton.styleFrom(
                foregroundColor: AetherTheme.charcoalDark,
                side: const BorderSide(color: AetherTheme.charcoalDark),
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
              ),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const MyReservationsScreen()),
                );
              },
            ),
          ),

          const SizedBox(height: 10),

          // Mobile Fase 5: acceso a historial de compras real. Mismo
          // criterio aditivo que "MIS RESERVAS" de arriba — no toca las
          // secciones mock de abajo.
          SizedBox(
            width: double.infinity,
            height: 40,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.receipt_long, size: 16),
              label: Text('HISTORIAL DE COMPRAS', style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
              style: OutlinedButton.styleFrom(
                foregroundColor: AetherTheme.charcoalDark,
                side: const BorderSide(color: AetherTheme.charcoalDark),
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
              ),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const PurchaseHistoryScreen()),
                );
              },
            ),
          ),

          const SizedBox(height: 20),

          // 1. Biometric Measurements Block
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.7),
              border: Border.all(color: const Color(0xFFCCC6BC).withOpacity(0.6)),
              borderRadius: BorderRadius.circular(2),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.straighten, size: 16, color: AetherTheme.charcoalDark),
                        const SizedBox(width: 6),
                        Text('Medidas Biométricas', style: GoogleFonts.outfit(fontSize: 13, fontWeight: FontWeight.w600)),
                      ],
                    ),
                    Row(
                      children: [
                        const Icon(Icons.lock, size: 12, color: Color(0xFF7B776E)),
                        const SizedBox(width: 4),
                        Text('PRIVADO', style: GoogleFonts.outfit(fontSize: 8.5, color: const Color(0xFF7B776E), fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _measureItem('ALTURA', _miPerfil?.altura != null ? '${_miPerfil!.altura} cm' : '—'),
                    _measureItem('PECHO', _miPerfil?.pecho != null ? '${_miPerfil!.pecho} cm' : '—'),
                    _measureItem('CINTURA', _miPerfil?.cintura != null ? '${_miPerfil!.cintura} cm' : '—'),
                    _measureItem('TIRO', _miPerfil?.tiro != null ? '${_miPerfil!.tiro} cm' : '—'),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 34,
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.tune, size: 14),
                    label: Text('RECALIBRAR MEDIDAS', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AetherTheme.charcoalDark,
                      side: const BorderSide(color: AetherTheme.charcoalDark),
                      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                    ),
                    onPressed: _miPerfil == null ? null : () => _showRecalibrateDialog(context),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // 2. AI Style Insights
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.7),
              border: Border.all(color: const Color(0xFFCCC6BC).withOpacity(0.6)),
              borderRadius: BorderRadius.circular(2),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.auto_awesome, size: 16, color: AetherTheme.bronze),
                    const SizedBox(width: 6),
                    Text('AI Style Insights', style: GoogleFonts.outfit(fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  profile.styleInsights,
                  style: GoogleFonts.sourceSerif4(fontSize: 11.5, height: 1.5, color: const Color(0xFF4A463F)),
                ),
                const SizedBox(height: 12),
                Text('PALETA RECOMENDADA', style: GoogleFonts.outfit(fontSize: 9, fontWeight: FontWeight.bold, color: const Color(0xFF7B776E))),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  children: profile.recommendedPalette.map((c) {
                    final hexColor = Color(int.parse(c.hex.replaceFirst('#', '0xFF')));
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF7F4EF),
                        border: Border.all(color: const Color(0xFFCCC6BC)),
                        borderRadius: BorderRadius.circular(2),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(width: 10, height: 10, color: hexColor),
                          const SizedBox(width: 4),
                          Text(c.name, style: GoogleFonts.outfit(fontSize: 9)),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // 3. Saved Outfits
          Text('LOOKS GUARDADOS (${profile.savedOutfits.length})', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: const Color(0xFF7B776E))),
          const SizedBox(height: 8),
          SizedBox(
            height: 180,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: profile.savedOutfits.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final look = profile.savedOutfits[index];
                return Container(
                  width: 120,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: const Color(0xFFCCC6BC)),
                    borderRadius: BorderRadius.circular(2),
                  ),
                  padding: const EdgeInsets.all(6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: CachedNetworkImage(imageUrl: look.imageUrl, fit: BoxFit.cover, width: double.infinity),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(look.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.outfit(fontSize: 9, fontWeight: FontWeight.bold)),
                      Text(look.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.sourceSerif4(fontSize: 8.5, color: const Color(0xFF7B776E))),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 30),
        ],
      ),
    );
  }

  Widget _measureItem(String label, String val) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        decoration: BoxDecoration(
          color: const Color(0xFFF7F4EF),
          borderRadius: BorderRadius.circular(2),
          border: Border.all(color: const Color(0xFFCCC6BC).withOpacity(0.4)),
        ),
        child: Column(
          children: [
            Text(label, style: GoogleFonts.outfit(fontSize: 7.5, color: const Color(0xFF7B776E), fontWeight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text(val, style: GoogleFonts.sourceSerif4(fontSize: 11, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }
}
