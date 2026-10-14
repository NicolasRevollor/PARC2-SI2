import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../models/product_model.dart';
import '../models/sucursal_model.dart';
import '../services/api_client.dart';
import '../services/locations_service.dart';
import '../services/payments_service.dart';
import '../services/reservations_service.dart';
import '../theme/aether_theme.dart';

/// Mobile Fase 3 (CU12): reservar `product` para retirar en sucursal, con
/// deposito del 10% via Stripe. Misma maquina de estados que
/// `cart_modal.dart` (Fase 2), adaptada: `proposito: 'reserva_deposito'` +
/// `codigoSucursal` obligatorio (a diferencia de la compra online) — el
/// backend valida stock EN esa sucursal y aplica un piso minimo de deposito
/// ANTES de llamar a Stripe. El pago SIEMPRE se obtiene antes de
/// `POST /api/reservations`; si la reserva falla DESPUES de un cobro ya
/// verificado, se retiene `idMetPago` para reintentar SIN volver a cobrar
/// (mismo criterio que `web/.../reservation-form.component.ts`, ya probado
/// esta sesion).
enum _ReservaStatus { idle, cargandoSucursales, cobrando, cobradoSinReserva, error }

/// `HH:MM` — compatible con `time.fromisoformat` del backend. En un metodo
/// dedicado, no repetido inline (mismo criterio que la web).
final RegExp _horarioPattern = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');

class ReservationFormScreen extends StatefulWidget {
  final Product product;

  const ReservationFormScreen({super.key, required this.product});

  @override
  State<ReservationFormScreen> createState() => _ReservationFormScreenState();
}

class _ReservationFormScreenState extends State<ReservationFormScreen> {
  final ApiClient _api = ApiClient();
  late final LocationsService _locationsService = LocationsService(_api);
  late final PaymentsService _paymentsService = PaymentsService(_api);
  late final ReservationsService _reservationsService = ReservationsService(_api);

  _ReservaStatus _status = _ReservaStatus.cargandoSucursales;
  String? _errorMessage;
  int? _idMetPagoRetenido;

  List<Sucursal> _sucursales = [];
  Sucursal? _sucursalSeleccionada;
  DateTime? _fechaSeleccionada;
  TimeOfDay? _horarioSeleccionado;

  @override
  void initState() {
    super.initState();
    _cargarSucursales();
  }

  Future<void> _cargarSucursales() async {
    try {
      final sucursales = await _locationsService.getSucursales();
      if (!mounted) return;
      setState(() {
        _sucursales = sucursales;
        _sucursalSeleccionada = sucursales.isNotEmpty ? sucursales.first : null;
        _status = _ReservaStatus.idle;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _status = _ReservaStatus.error;
        _errorMessage = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _status = _ReservaStatus.error;
        _errorMessage = 'No se pudieron cargar las sucursales.';
      });
    }
  }

  /// `_horarioTexto` se guarda ya formateado HH:MM (zero-padded manual, no
  /// se confia en `TimeOfDay.format(context)` — su salida depende del
  /// locale/12h-vs-24h del dispositivo y el backend exige exactamente
  /// `HH:MM` en 24h).
  String? get _horarioTexto {
    final t = _horarioSeleccionado;
    if (t == null) return null;
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  bool get _formularioValido {
    if (_sucursalSeleccionada == null) return false;
    final fecha = _fechaSeleccionada;
    if (fecha == null) return false;
    final hoy = DateTime.now();
    final fechaSolo = DateTime(fecha.year, fecha.month, fecha.day);
    final hoySolo = DateTime(hoy.year, hoy.month, hoy.day);
    if (fechaSolo.isBefore(hoySolo)) return false;
    final horario = _horarioTexto;
    if (horario == null || !_horarioPattern.hasMatch(horario)) return false;
    return true;
  }

  Future<void> _seleccionarFecha() async {
    final hoy = DateTime.now();
    final seleccionada = await showDatePicker(
      context: context,
      initialDate: _fechaSeleccionada ?? hoy,
      firstDate: DateTime(hoy.year, hoy.month, hoy.day),
      lastDate: hoy.add(const Duration(days: 365)),
    );
    if (seleccionada != null) {
      setState(() => _fechaSeleccionada = seleccionada);
    }
  }

  Future<void> _seleccionarHorario() async {
    final seleccionado = await showTimePicker(
      context: context,
      initialTime: _horarioSeleccionado ?? TimeOfDay.now(),
    );
    if (seleccionado != null) {
      setState(() => _horarioSeleccionado = seleccionado);
    }
  }

  Future<void> _iniciarReserva() async {
    final sucursal = _sucursalSeleccionada;
    final fecha = _fechaSeleccionada;
    final horario = _horarioTexto;
    if (sucursal == null || fecha == null || horario == null || !_formularioValido) return;

    setState(() {
      _status = _ReservaStatus.cobrando;
      _errorMessage = null;
    });

    final idProducto = int.parse(widget.product.id);
    final fechaTexto = DateFormat('yyyy-MM-dd').format(fecha);

    try {
      final intent = await _paymentsService.crearIntent(
        [
          {'idProducto': idProducto, 'cantidad': 1},
        ],
        concepto: 'Reserva ${widget.product.name}',
        proposito: 'reserva_deposito',
        codigoSucursal: sucursal.codigoSucursal,
      );
      final clientSecret = intent['clientSecret'] as String;

      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'YouShop',
        ),
      );
      // Si el usuario cancela o la tarjeta es rechazada, esto lanza
      // StripeException y no se llega a cobrar nada.
      await Stripe.instance.presentPaymentSheet();

      final paymentIntentId = intent['paymentIntentId'] as String;
      final verificado = await _paymentsService.verificarIntent(paymentIntentId);

      final pagado = verificado['pagado'] == true;
      final idMetPago = verificado['idMetPago'] as int?;
      if (!pagado || idMetPago == null) {
        // El widget reporto exito del lado del cliente, pero el servidor
        // aun no confirma el cobro: NUNCA se crea la Reserva en este caso.
        setState(() {
          _status = _ReservaStatus.error;
          _errorMessage =
              'No se pudo confirmar el cobro del deposito con el servidor. Si tu tarjeta fue debitada, contacta a soporte antes de reintentar.';
        });
        return;
      }

      await _crearReserva(idMetPago, fechaTexto, horario, sucursal.codigoSucursal, idProducto);
    } on StripeException catch (e) {
      // Misma nota que cart_modal.dart: `e.error.localizedMessage` no
      // verificado contra pub.dev en esta sesion (sin toolchain).
      setState(() {
        _status = _ReservaStatus.error;
        _errorMessage = e.error.localizedMessage ?? 'El pago fue cancelado o rechazado (${e.error.code}).';
      });
    } on ApiException catch (e) {
      setState(() {
        _status = _ReservaStatus.error;
        _errorMessage = e.message;
      });
    } catch (_) {
      setState(() {
        _status = _ReservaStatus.error;
        _errorMessage = 'No se pudo completar la reserva. Intenta de nuevo.';
      });
    }
  }

  Future<void> _crearReserva(
    int idMetPago,
    String fecha,
    String horario,
    int codigoSucursal,
    int idProducto,
  ) async {
    try {
      final reserva = await _reservationsService.crearReserva(
        fecha: fecha,
        horario: horario,
        codigoSucursal: codigoSucursal,
        idProducto: idProducto,
        idMetPago: idMetPago,
      );
      setState(() {
        _status = _ReservaStatus.idle;
        _idMetPagoRetenido = null;
      });
      if (!mounted) return;
      _mostrarConfirmacion(reserva);
    } on ApiException catch (e) {
      // El idMetPago YA fue cobrado (verificado): se retiene para
      // reintentar, NUNCA se vuelve a cobrar.
      setState(() {
        _status = _ReservaStatus.cobradoSinReserva;
        _errorMessage = e.message;
        _idMetPagoRetenido = idMetPago;
      });
    } catch (_) {
      setState(() {
        _status = _ReservaStatus.cobradoSinReserva;
        _errorMessage = 'Deposito confirmado, pero no pudimos registrar la reserva.';
        _idMetPagoRetenido = idMetPago;
      });
    }
  }

  Future<void> _reintentarReserva() async {
    final idMetPago = _idMetPagoRetenido;
    final fecha = _fechaSeleccionada;
    final horario = _horarioTexto;
    final sucursal = _sucursalSeleccionada;
    if (idMetPago == null || fecha == null || horario == null || sucursal == null) return;
    setState(() => _status = _ReservaStatus.cobrando);
    await _crearReserva(
      idMetPago,
      DateFormat('yyyy-MM-dd').format(fecha),
      horario,
      sucursal.codigoSucursal,
      int.parse(widget.product.id),
    );
  }

  void _mostrarConfirmacion(Map<String, dynamic> reserva) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AetherTheme.sandLight,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        title: Text('Reserva confirmada', style: GoogleFonts.outfit(fontWeight: FontWeight.w600)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Reserva #${reserva['codigoReserva']}', style: GoogleFonts.sourceSerif4(fontSize: 14)),
            Text('${reserva['fecha']} • ${reserva['horario']}', style: GoogleFonts.outfit(fontSize: 12, color: const Color(0xFF7B776E))),
            if (reserva['sucursal_nombre'] != null)
              Text('${reserva['sucursal_nombre']}', style: GoogleFonts.outfit(fontSize: 12, color: const Color(0xFF7B776E))),
            if (reserva['montoDeposito'] != null) ...[
              const SizedBox(height: 8),
              Text(
                'Deposito: \$${(reserva['montoDeposito'] as num).toStringAsFixed(2)}',
                style: GoogleFonts.sourceSerif4(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).pop();
            },
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cargandoSucursales = _status == _ReservaStatus.cargandoSucursales;
    final cobrando = _status == _ReservaStatus.cobrando;
    final cobradoSinReserva = _status == _ReservaStatus.cobradoSinReserva;

    return Scaffold(
      backgroundColor: AetherTheme.sandLight,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: AetherTheme.charcoalDark),
        title: Text('Reservar', style: GoogleFonts.outfit(color: AetherTheme.charcoalDark, fontWeight: FontWeight.w600)),
      ),
      body: cargandoSucursales
          ? const Center(child: CircularProgressIndicator(color: AetherTheme.charcoalDark))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.product.name, style: GoogleFonts.sourceSerif4(fontSize: 18, fontWeight: FontWeight.w600)),
                  Text(
                    'Deposito del 10% para reservar esta prenda en tienda.',
                    style: GoogleFonts.outfit(fontSize: 12, color: const Color(0xFF7B776E)),
                  ),
                  const SizedBox(height: 24),

                  Text('SUCURSAL', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: const Color(0xFF7B776E))),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<Sucursal>(
                    initialValue: _sucursalSeleccionada,
                    isExpanded: true,
                    decoration: const InputDecoration(border: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.outline))),
                    items: _sucursales
                        .map((s) => DropdownMenuItem(value: s, child: Text('${s.nombre} — ${s.ciudad}', overflow: TextOverflow.ellipsis)))
                        .toList(),
                    onChanged: cobrando ? null : (s) => setState(() => _sucursalSeleccionada = s),
                  ),
                  const SizedBox(height: 20),

                  Text('FECHA', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: const Color(0xFF7B776E))),
                  const SizedBox(height: 6),
                  InkWell(
                    onTap: cobrando ? null : _seleccionarFecha,
                    child: InputDecorator(
                      decoration: const InputDecoration(border: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.outline))),
                      child: Text(
                        _fechaSeleccionada != null ? DateFormat('dd/MM/yyyy').format(_fechaSeleccionada!) : 'Seleccionar fecha',
                        style: GoogleFonts.sourceSerif4(fontSize: 14),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  Text('HORARIO', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: const Color(0xFF7B776E))),
                  const SizedBox(height: 6),
                  InkWell(
                    onTap: cobrando ? null : _seleccionarHorario,
                    child: InputDecorator(
                      decoration: const InputDecoration(border: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.outline))),
                      child: Text(
                        _horarioTexto ?? 'Seleccionar horario',
                        style: GoogleFonts.sourceSerif4(fontSize: 14),
                      ),
                    ),
                  ),

                  if (_errorMessage != null) ...[
                    const SizedBox(height: 16),
                    Text(_errorMessage!, style: GoogleFonts.outfit(fontSize: 11, color: Colors.red.shade700)),
                  ],

                  const SizedBox(height: 28),
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
                          : cobradoSinReserva
                              ? _reintentarReserva
                              : (_formularioValido ? _iniciarReserva : null),
                      child: cobrando
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: AetherTheme.sandLight),
                            )
                          : Text(
                              cobradoSinReserva ? 'REINTENTAR REGISTRO' : 'RESERVAR (PAGAR DEPOSITO)',
                              style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.5),
                            ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
