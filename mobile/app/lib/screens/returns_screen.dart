import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../models/devolucion_model.dart';
import '../models/sucursal_model.dart';
import '../services/api_client.dart';
import '../services/returns_service.dart';
import '../theme/aether_theme.dart';

const _gris = Color(0xFF7B776E);

String _fecha(String? valor, {bool hora = false}) {
  if (valor == null) return '-';
  final parsed = DateTime.tryParse(valor);
  if (parsed == null) return valor;
  return DateFormat(hora ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy').format(parsed.toLocal());
}

/// CU2 alternativo 1: fuera de plazo se muestra la fecha limite en vez de la opcion.
String _textoElegibilidad(Elegibilidad e) {
  switch (e.estado) {
    case 'en_plazo':
      return 'Podés pedir el cambio: quedan ${e.horasRestantes.toStringAsFixed(1)} h';
    case 'fuera_plazo':
      return 'El plazo venció el ${_fecha(e.fechaLimite, hora: true)}. '
          'Por defecto de fábrica tenés hasta el ${_fecha(e.garantiaHasta)}.';
    default:
      return e.mensaje;
  }
}

/// Devoluciones y cambios desde la app (CU2, CU7, CU9, CU11 del lado del
/// cliente): la politica de la tienda, cada compra con la elegibilidad de sus
/// prendas, el estado y el QR de cada solicitud y las notas de credito.
class ReturnsScreen extends StatefulWidget {
  const ReturnsScreen({super.key});

  @override
  State<ReturnsScreen> createState() => _ReturnsScreenState();
}

class _ReturnsScreenState extends State<ReturnsScreen> {
  final ApiClient _api = ApiClient();
  late final ReturnsService _service = ReturnsService(_api);

  bool _loading = true;
  String? _error;
  PoliticaDevolucion? _politica;
  List<CompraDevolucion> _compras = [];
  List<CasoDevolucion> _casos = [];
  List<NotaCreditoCliente> _notas = [];

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
      final compras = await _service.getMisCompras();
      final resultados = await Future.wait([
        _service.getMisCasos(),
        _service.getMisNotas(),
        // La politica es la de la empresa que vendio.
        _service.getPolitica(idTenant: compras.isEmpty ? null : compras.first.idTenant),
      ]);
      if (!mounted) return;
      setState(() {
        _compras = compras;
        _casos = resultados[0] as List<CasoDevolucion>;
        _notas = resultados[1] as List<NotaCreditoCliente>;
        _politica = resultados[2] as PoliticaDevolucion;
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
        _error = 'No se pudieron cargar tus devoluciones.';
        _loading = false;
      });
    }
  }

  BoxDecoration get _tarjeta => BoxDecoration(
        color: Colors.white.withOpacity(0.7),
        border: Border.all(color: AetherTheme.outline.withOpacity(0.6)),
        borderRadius: BorderRadius.circular(2),
      );

  Widget _titulo(String texto) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 8),
        child: Text(texto, style: GoogleFonts.sourceSerif4(fontSize: 16, fontWeight: FontWeight.w600)),
      );

  Widget _vacio(String texto) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: _tarjeta,
        child: Text(texto, style: GoogleFonts.outfit(fontSize: 12, color: _gris)),
      );

  Widget _boton(String texto, VoidCallback? accion, {bool principal = false}) => principal
      ? ElevatedButton(
          onPressed: accion,
          style: ElevatedButton.styleFrom(
            backgroundColor: AetherTheme.charcoalDark,
            foregroundColor: Colors.white,
            shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          ),
          child: Text(texto, style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold)),
        )
      : TextButton(
          onPressed: accion,
          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8), foregroundColor: AetherTheme.charcoalDark),
          child: Text(texto, style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold)),
        );

  Color _colorEstado(String estado) {
    switch (estado) {
      case 'Completada':
        return Colors.green.shade700;
      case 'Rechazada':
      case 'Cancelada':
      case 'Anulada':
        return Colors.red.shade700;
      default:
        return AetherTheme.bronze;
    }
  }

  Future<void> _cancelar(CasoDevolucion caso) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('¿Cancelar la solicitud ${caso.codigo}?', style: GoogleFonts.outfit(fontSize: 15)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sí, cancelar')),
        ],
      ),
    );
    if (confirmar != true) return;
    try {
      await _service.cancelar(caso.idDevolucion);
      await _cargar();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  /// QR de la solicitud y su linea de tiempo (CU2 paso 6, CU11).
  Future<void> _verCaso(CasoDevolucion caso) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AetherTheme.sandLight,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      builder: (_) => _CasoSheet(caso: caso, service: _service),
    );
  }

  void _verPorCodigo(String codigo) {
    final caso = _casos.where((c) => c.codigo == codigo).firstOrNull;
    if (caso != null) _verCaso(caso);
  }

  Future<void> _abrirSolicitud(CompraDevolucion compra, LineaDevolucion linea) async {
    final caso = await showModalBottomSheet<CasoDevolucion>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AetherTheme.sandLight,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      builder: (_) => _SolicitudSheet(compra: compra, linea: linea, politica: _politica, service: _service),
    );
    if (caso != null) {
      await _cargar();
      if (!mounted) return;
      await _verCaso(caso);
    }
  }

  Widget _politicaCard(PoliticaDevolucion p) => Container(
        padding: const EdgeInsets.all(14),
        decoration: _tarjeta,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${p.plazoTexto} para cambios · ${p.plazoGarantiaDias} días de garantía por defecto de fábrica',
                style: GoogleFonts.outfit(fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(p.condiciones, style: GoogleFonts.outfit(fontSize: 11, color: _gris)),
            if (p.recargoTexto != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(p.recargoTexto!, style: GoogleFonts.outfit(fontSize: 11, color: AetherTheme.bronze)),
              ),
          ],
        ),
      );

  Widget _compraCard(CompraDevolucion v) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: _tarjeta,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Compra #${v.idVenta} · ${_fecha(v.fecha, hora: true)}${v.sucursal != null ? ' · ${v.sucursal}' : ''}',
                  style: GoogleFonts.outfit(fontSize: 11, color: _gris)),
              ...v.lineas.map(
                (l) => Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${l.producto} · talla ${l.talla ?? '-'} · ${l.color ?? ''}',
                                style: GoogleFonts.outfit(fontSize: 13, fontWeight: FontWeight.w600)),
                            Text('Bs ${l.precioPagado.toStringAsFixed(2)} · ${_textoElegibilidad(l.elegibilidad)}',
                                style: GoogleFonts.outfit(fontSize: 11, color: l.elegibilidad.puede ? Colors.green.shade700 : _gris)),
                          ],
                        ),
                      ),
                      if (l.solicitudAbierta != null)
                        _boton('VER ${l.solicitudAbierta}', () => _verPorCodigo(l.solicitudAbierta!))
                      else if (l.elegibilidad.puede)
                        _boton('SOLICITAR', _politica?.permiteSolicitudEnLinea == false ? null : () => _abrirSolicitud(v, l), principal: true),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  Widget _casoCard(CasoDevolucion c) {
    final aviso = GoogleFonts.outfit(fontSize: 11, color: AetherTheme.bronze);
    final ok = GoogleFonts.outfit(fontSize: 11, color: Colors.green.shade700);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: _tarjeta,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('${c.codigo} · ${etiquetasTipoDevolucion[c.tipo] ?? c.tipo}',
                      style: GoogleFonts.outfit(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
                Text((etiquetasEstadoDevolucion[c.estado] ?? c.estado).toUpperCase(),
                    style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, color: _colorEstado(c.estado))),
              ],
            ),
            Text(
              '${c.productoNombre ?? ''} ${c.tallaOriginal ?? ''}'
              '${c.productoNuevoNombre != null ? ' → ${c.productoNuevoNombre} ${c.tallaNueva ?? ''}' : ''}',
              style: GoogleFonts.outfit(fontSize: 12),
            ),
            Text(_fecha(c.fecha, hora: true), style: GoogleFonts.outfit(fontSize: 11, color: _gris)),
            if (c.estado == 'PendienteEntrega')
              Text('Entregá la prenda en ${c.sucursalNombre ?? 'la sucursal'} hasta el ${_fecha(c.fechaLimiteEntrega, hora: true)}.',
                  style: aviso),
            if (c.estado == 'CambioPendiente')
              Text('Tu cambio te espera en ${c.sucursalEntregaNombre ?? 'la sucursal'}'
                  '${c.fechaLimiteRetiro != null ? ' hasta el ${_fecha(c.fechaLimiteRetiro)}' : ''}.', style: aviso),
            if (c.motivoRechazo != null)
              Text(c.motivoRechazo!, style: GoogleFonts.outfit(fontSize: 11, color: Colors.red.shade700)),
            if (c.montoDevuelto > 0)
              Text('Reembolso de Bs ${c.montoDevuelto.toStringAsFixed(2)} (${c.metodoReembolso ?? ''}'
                  '${c.estadoReembolso != null && c.estadoReembolso != 'Completado' ? ' · ${c.estadoReembolso}' : ''})', style: ok),
            if (c.notaCodigo != null) Text('Nota de crédito ${c.notaCodigo}', style: ok),
            Row(
              children: [
                _boton('QR Y SEGUIMIENTO', () => _verCaso(c)),
                if (c.estado == 'PendienteEntrega') _boton('CANCELAR', () => _cancelar(c)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _notaCard(NotaCreditoCliente n) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: _tarjeta,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(n.codigo, style: GoogleFonts.robotoMono(fontSize: 13, fontWeight: FontWeight.bold)),
                  Text(n.estado.toUpperCase(),
                      style: GoogleFonts.outfit(
                          fontSize: 10, fontWeight: FontWeight.bold, color: n.estado == 'Vigente' ? Colors.green.shade700 : _gris)),
                ],
              ),
              Text('Bs ${n.saldo.toStringAsFixed(2)}', style: GoogleFonts.sourceSerif4(fontSize: 20, fontWeight: FontWeight.bold)),
              Text('de Bs ${n.monto.toStringAsFixed(2)} · vence ${_fecha(n.fechaVencimiento)}'
                  '${n.codigoDevolucion != null ? ' · caso ${n.codigoDevolucion}' : ''}',
                  style: GoogleFonts.outfit(fontSize: 11, color: _gris)),
              Text('Canjeala en cualquier sucursal de ${n.empresa ?? 'la tienda'} mostrando este código.',
                  style: GoogleFonts.outfit(fontSize: 11, color: _gris)),
              ...n.movimientos.map(
                (m) => Text('${_fecha(m.fecha)} · ${m.tipo} Bs ${m.monto.toStringAsFixed(2)} → saldo ${m.saldoResultante.toStringAsFixed(2)}',
                    style: GoogleFonts.outfit(fontSize: 10, color: _gris)),
              ),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AetherTheme.sandLight,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: AetherTheme.charcoalDark),
        title: Text('Devoluciones y Cambios', style: GoogleFonts.outfit(color: AetherTheme.charcoalDark, fontWeight: FontWeight.w600)),
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
              : RefreshIndicator(
                  onRefresh: _cargar,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_politica != null) _politicaCard(_politica!),
                      _titulo('Mis compras'),
                      if (_compras.isEmpty) _vacio('No tenés compras recientes.'),
                      ..._compras.map(_compraCard),
                      _titulo('Mis solicitudes'),
                      if (_casos.isEmpty) _vacio('Todavía no pediste devoluciones ni cambios.'),
                      ..._casos.map(_casoCard),
                      _titulo('Mis notas de crédito'),
                      if (_notas.isEmpty) _vacio('No tenés notas de crédito.'),
                      ..._notas.map(_notaCard),
                    ],
                  ),
                ),
    );
  }
}

/// Dibuja la matriz del QR que arma el backend (`GET /api/returns/{id}/qr`).
class _QrPainter extends CustomPainter {
  final List<String> modulos;

  _QrPainter(this.modulos);

  @override
  void paint(Canvas canvas, Size size) {
    final n = modulos.length;
    if (n == 0) return;
    // Zona de silencio de 2 modulos alrededor para que lo lea cualquier camara.
    final lado = size.width / (n + 4);
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
    final negro = Paint()..color = Colors.black;
    for (var f = 0; f < n; f++) {
      for (var c = 0; c < modulos[f].length; c++) {
        if (modulos[f][c] == '1') {
          canvas.drawRect(Rect.fromLTWH((c + 2) * lado, (f + 2) * lado, lado + 0.5, lado + 0.5), negro);
        }
      }
    }
  }

  @override
  bool shouldRepaint(_QrPainter old) => old.modulos != modulos;
}

class _CasoSheet extends StatefulWidget {
  final CasoDevolucion caso;
  final ReturnsService service;

  const _CasoSheet({required this.caso, required this.service});

  @override
  State<_CasoSheet> createState() => _CasoSheetState();
}

class _CasoSheetState extends State<_CasoSheet> {
  QrDevolucion? _qr;
  List<EventoDevolucion> _eventos = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final qr = await widget.service.getQr(widget.caso.idDevolucion);
      final eventos = await widget.service.getLineaTiempo(widget.caso.idDevolucion);
      if (!mounted) return;
      setState(() {
        _qr = qr;
        _eventos = eventos;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final caso = widget.caso;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(caso.codigo, style: GoogleFonts.robotoMono(fontSize: 16, fontWeight: FontWeight.bold)),
          Text(etiquetasEstadoDevolucion[caso.estado] ?? caso.estado, style: GoogleFonts.outfit(fontSize: 12, color: AetherTheme.bronze)),
          const SizedBox(height: 12),
          if (_qr != null)
            SizedBox(width: 200, height: 200, child: CustomPaint(painter: _QrPainter(_qr!.modulos)))
          else if (_error == null)
            const SizedBox(height: 200, child: Center(child: CircularProgressIndicator(color: AetherTheme.charcoalDark))),
          if (_error != null) Text(_error!, style: GoogleFonts.outfit(fontSize: 12, color: Colors.red.shade700)),
          const SizedBox(height: 8),
          Text(
            caso.estado == 'PendienteEntrega'
                ? 'Mostralo en ${caso.sucursalNombre ?? 'la sucursal'} hasta el ${_fecha(caso.fechaLimiteEntrega, hora: true)}.'
                : 'Mostralo en la sucursal si te lo piden.',
            textAlign: TextAlign.center,
            style: GoogleFonts.outfit(fontSize: 11, color: _gris),
          ),
          const SizedBox(height: 16),
          Align(alignment: Alignment.centerLeft, child: Text('Seguimiento', style: GoogleFonts.sourceSerif4(fontSize: 15, fontWeight: FontWeight.w600))),
          ..._eventos.map(
            (e) => Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 4, right: 8),
                    child: Icon(Icons.circle, size: 8, color: AetherTheme.bronze),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${e.etapa} · ${_fecha(e.fecha, hora: true)}', style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.w600)),
                        Text(e.detalle, style: GoogleFonts.outfit(fontSize: 11, color: _gris)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Formulario de la solicitud (CU2 pasos 3-6): motivo, que quiere el
/// cliente, la variante a cambio con su disponibilidad por sucursal, en que
/// sucursal entrega la prenda y un detalle opcional.
class _SolicitudSheet extends StatefulWidget {
  final CompraDevolucion compra;
  final LineaDevolucion linea;
  final PoliticaDevolucion? politica;
  final ReturnsService service;

  const _SolicitudSheet({required this.compra, required this.linea, required this.politica, required this.service});

  @override
  State<_SolicitudSheet> createState() => _SolicitudSheetState();
}

class _SolicitudSheetState extends State<_SolicitudSheet> {
  static const _variantes = ['cambio_talla', 'cambio_color'];

  List<ProductoReemplazo> _catalogo = [];
  List<Sucursal> _sucursales = [];
  final Map<int, List<StockSucursal>> _stock = {};
  String _motivoCategoria = 'talla';
  String _tipo = 'cambio_talla';
  int? _idProductoNuevo;
  int? _sucursal;
  int _cantidad = 1;
  final _detalle = TextEditingController();
  bool _enviando = false;
  String? _error;

  List<String> get _tipos => [
        'cambio_talla',
        'cambio_color',
        'cambio_producto',
        if (widget.politica?.permiteReembolso != false || _motivoCategoria == 'defecto') 'devolucion',
        'nota_credito',
      ];

  bool get _esVariante => _variantes.contains(_tipo);

  ProductoReemplazo? get _original => _catalogo.where((p) => p.idProducto == widget.linea.idProducto).firstOrNull;

  /// Misma prenda en otra talla o en otro color (CU2 paso 4), o cualquier otra (CU5).
  List<ProductoReemplazo> get _reemplazos {
    final otras = _catalogo.where((p) => p.idProducto != widget.linea.idProducto).toList();
    final original = _original;
    if (original == null || !_esVariante) return otras;
    return otras
        .where((p) => p.tipo == original.tipo &&
            (_tipo == 'cambio_talla' ? p.color == original.color && p.talla != original.talla : p.talla == original.talla && p.color != original.color))
        .toList();
  }

  @override
  void initState() {
    super.initState();
    _sucursal = widget.compra.codigoSucursal;
    _cargarDatos();
  }

  @override
  void dispose() {
    _detalle.dispose();
    super.dispose();
  }

  Future<void> _cargarDatos() async {
    try {
      final catalogo = await widget.service.getCatalogo(widget.compra.idTenant);
      final sucursales = await widget.service.getSucursales(widget.compra.idTenant);
      if (!mounted) return;
      setState(() {
        _catalogo = catalogo;
        _sucursales = sucursales;
        if (_sucursal == null || !sucursales.any((s) => s.codigoSucursal == _sucursal)) {
          _sucursal = sucursales.isEmpty ? null : sucursales.first.codigoSucursal;
        }
      });
      _cargarStockVariantes();
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'No se pudo cargar el catálogo de la tienda.');
    }
  }

  void _cargarStockVariantes() {
    if (!_esVariante) return;
    for (final p in _reemplazos) {
      _cargarStock(p.idProducto);
    }
  }

  Future<void> _cargarStock(int idProducto) async {
    if (_stock.containsKey(idProducto)) return;
    try {
      final stock = await widget.service.getStock(idProducto);
      if (!mounted) return;
      setState(() => _stock[idProducto] = stock);
    } on ApiException {
      // Sin disponibilidad conocida: igual se puede pedir y la tienda confirma.
    }
  }

  String _disponibilidad(int idProducto) {
    final stock = _stock[idProducto];
    if (stock == null) return 'Consultando disponibilidad…';
    final con = stock.where((s) => s.disponible > 0).map((s) => s.sucursal).toList();
    return con.isEmpty ? 'Sin stock por ahora' : 'Disponible en ${con.join(', ')}';
  }

  bool get _puedeEnviar => !_enviando && _sucursal != null && (!_esVariante || _idProductoNuevo != null);

  Future<void> _enviar() async {
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      final caso = await widget.service.solicitar(
        idVenta: widget.compra.idVenta,
        idProducto: widget.linea.idProducto,
        cantidad: _cantidad,
        motivoCategoria: _motivoCategoria,
        motivo: _detalle.text.trim().isEmpty ? null : _detalle.text.trim(),
        tipo: _tipo,
        idProductoNuevo: _tipo == 'devolucion' || _tipo == 'nota_credito' ? null : _idProductoNuevo,
        codigoSucursal: _sucursal!,
      );
      if (!mounted) return;
      Navigator.of(context).pop(caso);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _enviando = false;
      });
    }
  }

  Widget _chips(Map<String, String> opciones, String actual, ValueChanged<String> elegir) => Wrap(
        spacing: 6,
        runSpacing: 6,
        children: opciones.entries
            .map((o) => ChoiceChip(
                  label: Text(o.value, style: GoogleFonts.outfit(fontSize: 11)),
                  selected: actual == o.key,
                  onSelected: (_) => elegir(o.key),
                ))
            .toList(),
      );

  @override
  Widget build(BuildContext context) {
    final linea = widget.linea;
    final etiqueta = GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.w600);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('SOLICITUD DE DEVOLUCIÓN O CAMBIO',
                style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2, color: AetherTheme.bronze)),
            Text('${linea.producto} · talla ${linea.talla ?? '-'} · ${linea.color ?? ''}',
                style: GoogleFonts.sourceSerif4(fontSize: 18, fontWeight: FontWeight.w600)),
            Text('Pagaste Bs ${linea.precioPagado.toStringAsFixed(2)} · ${_textoElegibilidad(linea.elegibilidad)}',
                style: GoogleFonts.outfit(fontSize: 11, color: _gris)),
            const SizedBox(height: 14),
            Text('Motivo', style: etiqueta),
            const SizedBox(height: 6),
            _chips(etiquetasMotivoDevolucion, _motivoCategoria, (m) => setState(() => _motivoCategoria = m)),
            const SizedBox(height: 12),
            Text('¿Qué querés?', style: etiqueta),
            const SizedBox(height: 6),
            _chips({for (final t in _tipos) t: etiquetasTipoDevolucion[t] ?? t}, _tipo, (t) {
              setState(() {
                _tipo = t;
                _idProductoNuevo = null;
              });
              _cargarStockVariantes();
            }),
            if (_esVariante) ...[
              const SizedBox(height: 12),
              Text('Prenda que querés', style: etiqueta),
              if (_reemplazos.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('No hay otra variante del mismo modelo.', style: GoogleFonts.outfit(fontSize: 11, color: AetherTheme.bronze)),
                ),
              ..._reemplazos.map(
                (p) => ListTile(
                  onTap: () => setState(() => _idProductoNuevo = p.idProducto),
                  leading: Icon(
                    _idProductoNuevo == p.idProducto ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                    color: AetherTheme.charcoalDark,
                    size: 20,
                  ),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text('${p.nombre} · talla ${p.talla ?? '-'} · ${p.color ?? ''} · Bs ${p.venta.toStringAsFixed(0)}',
                      style: GoogleFonts.outfit(fontSize: 12)),
                  subtitle: Text(_disponibilidad(p.idProducto), style: GoogleFonts.outfit(fontSize: 11, color: _gris)),
                ),
              ),
            ],
            if (_tipo == 'cambio_producto') ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<int?>(
                value: _idProductoNuevo,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Producto que te gustaría'),
                items: [
                  DropdownMenuItem<int?>(value: null, child: Text('Lo elijo en la tienda', style: GoogleFonts.outfit(fontSize: 12))),
                  ..._reemplazos.map((p) => DropdownMenuItem<int?>(
                        value: p.idProducto,
                        child: Text('${p.nombre} — talla ${p.talla ?? '-'} · Bs ${p.venta.toStringAsFixed(0)}',
                            overflow: TextOverflow.ellipsis, style: GoogleFonts.outfit(fontSize: 12)),
                      )),
                ],
                onChanged: (v) => setState(() => _idProductoNuevo = v),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Text('Cantidad', style: GoogleFonts.outfit(fontSize: 12)),
                IconButton(
                  onPressed: _cantidad > 1 ? () => setState(() => _cantidad--) : null,
                  icon: const Icon(Icons.remove, size: 18),
                ),
                Text('$_cantidad', style: GoogleFonts.outfit(fontSize: 13, fontWeight: FontWeight.w600)),
                IconButton(
                  onPressed: _cantidad < linea.disponibles ? () => setState(() => _cantidad++) : null,
                  icon: const Icon(Icons.add, size: 18),
                ),
              ],
            ),
            DropdownButtonFormField<int>(
              value: _sucursal,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Sucursal donde entregás la prenda'),
              items: _sucursales
                  .map((s) => DropdownMenuItem(value: s.codigoSucursal, child: Text(s.nombre, style: GoogleFonts.outfit(fontSize: 12))))
                  .toList(),
              onChanged: (v) => setState(() => _sucursal = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _detalle,
              maxLines: 2,
              maxLength: 255,
              decoration: const InputDecoration(labelText: 'Contanos qué pasó (opcional)'),
            ),
            Text(
              'Vas a recibir un código con QR y una fecha límite de ${widget.politica?.diasEntregaEnLinea ?? 3} días para entregar la prenda. '
              'Si pediste una variante disponible, te la apartamos hasta esa fecha.',
              style: GoogleFonts.outfit(fontSize: 11, color: _gris),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(_error!, style: GoogleFonts.outfit(fontSize: 12, color: Colors.red.shade700)),
              ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                onPressed: _puedeEnviar ? _enviar : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AetherTheme.charcoalDark,
                  foregroundColor: Colors.white,
                  shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                ),
                child: Text(_enviando ? 'ENVIANDO…' : 'ENVIAR SOLICITUD',
                    style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
