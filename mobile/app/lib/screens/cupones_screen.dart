import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/aether_theme.dart';
import '../services/api_client.dart';
import '../services/cupones_service.dart';

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// [CU33] Obtener y usar cupon de descuento por compras
// Boundary: MisCuponesUI -> esta pantalla (app del cliente)
// Control: GET /api/cupones/mios
// ==================================================================
class CuponesScreen extends StatefulWidget {
  const CuponesScreen({super.key});

  @override
  State<CuponesScreen> createState() => _CuponesScreenState();
}

class _CuponesScreenState extends State<CuponesScreen> {
  late final CuponesService _service = CuponesService(ApiClient());
  Map<String, dynamic>? _datos;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final datos = await _service.misCupones();
      if (mounted) setState(() => _datos = datos);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  String _fecha(dynamic iso) {
    final f = DateTime.tryParse(iso?.toString() ?? '');
    return f == null ? '-' : '${f.toLocal().day.toString().padLeft(2, '0')}/${f.toLocal().month.toString().padLeft(2, '0')}/${f.toLocal().year}';
  }

  @override
  Widget build(BuildContext context) {
    final datos = _datos;
    final cupones = (datos?['cupones'] as List? ?? []).cast<Map<String, dynamic>>();
    final progreso = (datos?['progreso'] as List? ?? []).cast<Map<String, dynamic>>();
    return Scaffold(
      backgroundColor: AetherTheme.sandLight,
      appBar: AppBar(title: Text('Mis cupones', style: GoogleFonts.outfit(fontWeight: FontWeight.w600))),
      body: _error != null
          ? Center(child: Text(_error!))
          : datos == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _cargar,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(datos['regla'] as String? ?? '', style: GoogleFonts.outfit(fontSize: 12, color: const Color(0xFF7B776E))),
                      const SizedBox(height: 16),
                      for (final p in progreso) ...[
                        Text(
                          '${p['empresa']}: te ${p['faltan'] == 1 ? 'falta 1 compra' : 'faltan ${p['faltan']} compras'} para el próximo cupón',
                          style: GoogleFonts.outfit(fontSize: 12),
                        ),
                        const SizedBox(height: 4),
                        LinearProgressIndicator(
                          value: ((p['comprasPorCupon'] as int) - (p['faltan'] as int)) / (p['comprasPorCupon'] as int),
                          backgroundColor: Colors.black12,
                          color: Colors.green.shade600,
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (cupones.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: Text('Todavía no tenés cupones.', style: GoogleFonts.outfit(fontSize: 13, color: const Color(0xFF7B776E))),
                        ),
                      for (final c in cupones)
                        Card(
                          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                          color: c['estado'] == 'Disponible' ? Colors.white : Colors.white70,
                          child: ListTile(
                            leading: Icon(Icons.local_offer, color: c['estado'] == 'Disponible' ? Colors.green.shade700 : Colors.grey),
                            title: Text('${c['codigo']} · ${(c['porcentaje'] as num).toInt()}%',
                                style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
                            subtitle: Text(
                              c['estado'] == 'Usado'
                                  ? '${c['empresa']} · usado el ${_fecha(c['fechaUso'])} (ahorraste Bs ${(c['montoDescontado'] as num).toStringAsFixed(2)})'
                                  : '${c['empresa']} · vence el ${_fecha(c['fechaVencimiento'])}',
                              style: GoogleFonts.outfit(fontSize: 11),
                            ),
                            trailing: Text((c['estado'] as String).toUpperCase(),
                                style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold)),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}
