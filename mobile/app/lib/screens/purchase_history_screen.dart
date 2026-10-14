import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../models/purchase_history_model.dart';
import '../services/api_client.dart';
import '../services/purchase_history_service.dart';
import '../theme/aether_theme.dart';

/// Mobile Fase 5: historial de compras real del Cliente autenticado
/// (`GET /api/purchase-history`). El backend devuelve un item POR LINEA,
/// no por venta — se agrupa por `idVenta` antes de mostrar, para no
/// repetir el mismo total de venta en cada linea (ver
/// `purchase_history_model.dart`).
class PurchaseHistoryScreen extends StatefulWidget {
  const PurchaseHistoryScreen({super.key});

  @override
  State<PurchaseHistoryScreen> createState() => _PurchaseHistoryScreenState();
}

class _PurchaseHistoryScreenState extends State<PurchaseHistoryScreen> {
  final ApiClient _api = ApiClient();
  late final PurchaseHistoryService _purchaseHistoryService = PurchaseHistoryService(_api);

  bool _loading = true;
  String? _error;
  List<PurchaseHistoryItem> _items = [];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _purchaseHistoryService.getHistorialCompras();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudo cargar tu historial de compras.';
        _loading = false;
      });
    }
  }

  /// Agrupa por `idVenta` preservando el orden de llegada — el backend ya
  /// ordena por `fecha.desc()`, asi que no hace falta re-ordenar aca.
  Map<int, List<PurchaseHistoryItem>> _agruparPorVenta(List<PurchaseHistoryItem> items) {
    final grupos = <int, List<PurchaseHistoryItem>>{};
    for (final item in items) {
      grupos.putIfAbsent(item.idVenta, () => []).add(item);
    }
    return grupos;
  }

  String _formatearFecha(String fecha) {
    final parsed = DateTime.tryParse(fecha);
    if (parsed == null) return fecha;
    return DateFormat('dd/MM/yyyy HH:mm').format(parsed.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    final grupos = _agruparPorVenta(_items);
    final ventaIds = grupos.keys.toList();

    return Scaffold(
      backgroundColor: AetherTheme.sandLight,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: AetherTheme.charcoalDark),
        title: Text('Historial de Compras', style: GoogleFonts.outfit(color: AetherTheme.charcoalDark, fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AetherTheme.charcoalDark))
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center, style: GoogleFonts.outfit(fontSize: 12, color: Colors.red.shade700)),
                        const SizedBox(height: 12),
                        OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
                      ],
                    ),
                  ),
                )
              : ventaIds.isEmpty
                  ? Center(
                      child: Text('Todavia no tenes compras.', style: GoogleFonts.sourceSerif4(fontSize: 14, color: const Color(0xFF7B776E))),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: ventaIds.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final idVenta = ventaIds[index];
                        final lineas = grupos[idVenta]!;
                        final primera = lineas.first;
                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.7),
                            border: Border.all(color: const Color(0xFFCCC6BC).withOpacity(0.6)),
                            borderRadius: BorderRadius.circular(2),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Encabezado: datos de LA VENTA (fecha/total unicos por
                              // grupo, tomados de la primera linea).
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text('Venta #$idVenta', style: GoogleFonts.sourceSerif4(fontSize: 14, fontWeight: FontWeight.w600)),
                                  Text(
                                    'Total: \$${primera.total.toStringAsFixed(2)}',
                                    style: GoogleFonts.sourceSerif4(fontSize: 14, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(_formatearFecha(primera.fecha), style: GoogleFonts.outfit(fontSize: 11, color: const Color(0xFF7B776E))),
                              const Divider(height: 18, color: Color(0xFFCCC6BC)),
                              // Items de linea: cada uno con SU PROPIO subtotal,
                              // distinto del total de la venta de arriba.
                              ...lineas.map(
                                (item) => Padding(
                                  padding: const EdgeInsets.only(bottom: 6),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(
                                        child: Text(
                                          '${item.productoNombre ?? 'Producto #${item.idProducto}'}  x${item.cantidad}',
                                          style: GoogleFonts.outfit(fontSize: 12),
                                        ),
                                      ),
                                      Text(
                                        'Subtotal: \$${item.subtotalLinea.toStringAsFixed(2)}',
                                        style: GoogleFonts.outfit(fontSize: 11, color: const Color(0xFF7B776E)),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
    );
  }
}
