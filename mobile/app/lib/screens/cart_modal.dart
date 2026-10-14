import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../theme/aether_theme.dart';
import '../providers/app_state.dart';
import '../services/api_client.dart';
import '../services/payments_service.dart';
import '../services/sales_service.dart';

/// Mobile Fase 2: checkout real. Misma maquina de estados que
/// `web/src/app/features/customer/checkout/purchase-modal.component.ts`
/// (ya probada esta sesion) — el pago SIEMPRE se obtiene antes de crear la
/// Venta, y si la Venta falla DESPUES de un cobro ya verificado, el
/// `idMetPago` se retiene para reintentar sin volver a cobrar.
enum _CheckoutStatus { idle, cobrando, cobradoSinVenta, error }

class CartModal extends StatefulWidget {
  const CartModal({super.key});

  @override
  State<CartModal> createState() => _CartModalState();
}

class _CartModalState extends State<CartModal> {
  final ApiClient _api = ApiClient();
  late final PaymentsService _paymentsService = PaymentsService(_api);
  late final SalesService _salesService = SalesService(_api);

  _CheckoutStatus _status = _CheckoutStatus.idle;
  String? _errorMessage;
  int? _idMetPagoRetenido;
  List<Map<String, dynamic>>? _itemsRetenidos;

  List<Map<String, dynamic>> _itemsDesdeCarrito(AppState appState) {
    return appState.cart
        .map((item) => {
              'idProducto': int.parse(item.product.id),
              'cantidad': item.quantity,
            })
        .toList();
  }

  Future<void> _iniciarCheckout(AppState appState) async {
    final items = _itemsDesdeCarrito(appState);
    setState(() {
      _status = _CheckoutStatus.cobrando;
      _errorMessage = null;
    });

    try {
      final intent = await _paymentsService.crearIntent(items, concepto: 'Compra YouShop');
      final clientSecret = intent['clientSecret'] as String;

      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'YouShop',
        ),
      );
      // Si el usuario cancela o la tarjeta es rechazada, esto lanza
      // StripeException y no se llega a cobrar nada — el carrito queda
      // intacto y se puede reintentar desde cero (nuevo intent).
      await Stripe.instance.presentPaymentSheet();

      final paymentIntentId = intent['paymentIntentId'] as String;
      final verificado = await _paymentsService.verificarIntent(paymentIntentId);

      final pagado = verificado['pagado'] == true;
      final idMetPago = verificado['idMetPago'] as int?;
      if (!pagado || idMetPago == null) {
        // El widget reporto exito del lado del cliente, pero el servidor
        // aun no confirma el cobro: NUNCA se crea la Venta en este caso
        // (mismo criterio que la web).
        setState(() {
          _status = _CheckoutStatus.error;
          _errorMessage =
              'No se pudo confirmar el cobro con el servidor. Si tu tarjeta fue debitada, contacta a soporte antes de reintentar.';
        });
        return;
      }

      await _crearVenta(appState, idMetPago, items);
    } on StripeException catch (e) {
      // API de flutter_stripe no verificada contra pub.dev en esta sesion
      // (sin toolchain) — `e.error.localizedMessage` es el campo esperado
      // en versiones recientes del paquete; se cae a `.code` si viniera
      // null, para nunca mostrar un mensaje vacio.
      setState(() {
        _status = _CheckoutStatus.error;
        _errorMessage = e.error.localizedMessage ?? 'El pago fue cancelado o rechazado (${e.error.code}).';
      });
    } on ApiException catch (e) {
      setState(() {
        _status = _CheckoutStatus.error;
        _errorMessage = e.message;
      });
    } catch (_) {
      setState(() {
        _status = _CheckoutStatus.error;
        _errorMessage = 'No se pudo completar la compra. Intenta de nuevo.';
      });
    }
  }

  Future<void> _crearVenta(AppState appState, int idMetPago, List<Map<String, dynamic>> items) async {
    try {
      final venta = await _salesService.crearVenta(idMetPago, items);
      appState.clearCart();
      setState(() {
        _status = _CheckoutStatus.idle;
        _idMetPagoRetenido = null;
        _itemsRetenidos = null;
      });
      if (!mounted) return;
      Navigator.of(context).pop();
      _mostrarConfirmacion(venta);
    } on ApiException catch (e) {
      // El idMetPago YA fue cobrado (verificado): se retiene para
      // reintentar, NUNCA se vuelve a cobrar.
      setState(() {
        _status = _CheckoutStatus.cobradoSinVenta;
        _errorMessage = e.message;
        _idMetPagoRetenido = idMetPago;
        _itemsRetenidos = items;
      });
    } catch (_) {
      setState(() {
        _status = _CheckoutStatus.cobradoSinVenta;
        _errorMessage = 'Cobro confirmado, pero no pudimos registrar la venta.';
        _idMetPagoRetenido = idMetPago;
        _itemsRetenidos = items;
      });
    }
  }

  Future<void> _reintentarVenta(AppState appState) async {
    final idMetPago = _idMetPagoRetenido;
    final items = _itemsRetenidos;
    if (idMetPago == null || items == null) return;
    setState(() => _status = _CheckoutStatus.cobrando);
    await _crearVenta(appState, idMetPago, items);
  }

  void _mostrarConfirmacion(Map<String, dynamic> venta) {
    final fecha = DateTime.tryParse(venta['fecha'] as String? ?? '');
    final fechaTexto = fecha != null ? DateFormat('dd/MM/yyyy HH:mm').format(fecha.toLocal()) : '';
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AetherTheme.sandLight,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        title: Text('Compra confirmada', style: GoogleFonts.outfit(fontWeight: FontWeight.w600)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Venta #${venta['idVenta']}', style: GoogleFonts.sourceSerif4(fontSize: 14)),
            if (fechaTexto.isNotEmpty) Text(fechaTexto, style: GoogleFonts.outfit(fontSize: 12, color: const Color(0xFF7B776E))),
            const SizedBox(height: 8),
            Text(
              'Total: \$${(venta['total'] as num).toStringAsFixed(2)}',
              style: GoogleFonts.sourceSerif4(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final cobrando = _status == _CheckoutStatus.cobrando;
    final cobradoSinVenta = _status == _CheckoutStatus.cobradoSinVenta;

    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: const BoxDecoration(
        color: AetherTheme.sandLight,
        borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
      ),
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Bolsa de Compras (${appState.totalCartCount})', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.w600)),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFCCC6BC)),

          // Items list
          Expanded(
            child: appState.cart.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.shopping_bag_outlined, size: 48, color: Color(0xFFCCC6BC)),
                        const SizedBox(height: 12),
                        Text('Tu bolsa está vacía.', style: GoogleFonts.sourceSerif4(fontSize: 14, color: const Color(0xFF7B776E))),
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: appState.cart.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final item = appState.cart[index];
                      return Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(2),
                            child: SizedBox(
                              width: 60,
                              height: 75,
                              child: CachedNetworkImage(imageUrl: item.product.imageUrl, fit: BoxFit.cover),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item.product.name, style: GoogleFonts.sourceSerif4(fontSize: 13, fontWeight: FontWeight.w600)),
                                Text('Talla: ${item.size} • Color: ${item.product.colorName}', style: GoogleFonts.outfit(fontSize: 10, color: const Color(0xFF7B776E))),
                                const SizedBox(height: 4),
                                Text('\$${item.product.price.toInt()}', style: GoogleFonts.sourceSerif4(fontSize: 12, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                          Row(
                            children: [
                              IconButton(
                                icon: const Icon(Icons.remove, size: 16),
                                onPressed: cobrando ? null : () => appState.updateCartQuantity(index, -1),
                              ),
                              Text('${item.quantity}', style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
                              IconButton(
                                icon: const Icon(Icons.add, size: 16),
                                onPressed: cobrando ? null : () => appState.updateCartQuantity(index, 1),
                              ),
                            ],
                          ),
                        ],
                      );
                    },
                  ),
          ),

          // Footer
          if (appState.cart.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: Color(0xFFCCC6BC), width: 0.5)),
              ),
              child: Column(
                children: [
                  if (_errorMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        _errorMessage!,
                        style: GoogleFonts.outfit(fontSize: 11, color: Colors.red.shade700),
                      ),
                    ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Subtotal', style: GoogleFonts.outfit(fontSize: 14)),
                      Text('\$${appState.cartSubtotal.toInt()}', style: GoogleFonts.sourceSerif4(fontSize: 16, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AetherTheme.charcoalDark,
                        foregroundColor: AetherTheme.sandLight,
                        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                      ),
                      onPressed: cobrando
                          ? null
                          : cobradoSinVenta
                              ? () => _reintentarVenta(appState)
                              : () => _iniciarCheckout(appState),
                      child: cobrando
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: AetherTheme.sandLight),
                            )
                          : Text(
                              cobradoSinVenta ? 'REINTENTAR REGISTRO' : 'FINALIZAR COMPRA',
                              style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.5),
                            ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
