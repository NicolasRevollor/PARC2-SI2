import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state.dart';
import '../../services/api_client.dart';
import '../../services/offline_rules.dart';
import '../../services/offline_sync_service.dart';
import '../../theme/aether_theme.dart';

// ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
// Modo tienda para el personal (rol distinto de Cliente). Una pantalla por CU:
// [CU12] _PrepararPantalla  [CU13] _CatalogoPantalla  [CU20] _CajaPantalla
// [CU14] _VentaPantalla     [CU15] _ReservaPantalla   [CU19] _CambioPantalla
// [CU16] [CU17] _OperacionesPantalla
// [CU18] es solo web (como indica el informe).
// ==================================================================

final _dinero = NumberFormat('0.00');
String bs(num valor) => 'Bs ${_dinero.format(valor)}';
String fechaCorta(String? iso) => iso == null ? '-' : DateFormat('dd/MM/yyyy HH:mm').format(DateTime.parse(iso).toLocal());

void _avisar(BuildContext context, String texto) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));

/// Marca visible del caso de uso.
class CuMarca extends StatelessWidget {
  const CuMarca(this.cu, this.nombre, {super.key});
  final String cu;
  final String nombre;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(border: Border.all(color: AetherTheme.bronze), borderRadius: BorderRadius.circular(4)),
          child: Text(cu, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AetherTheme.bronze)),
        ),
        const SizedBox(width: 8),
        Expanded(child: Text(nombre, style: const TextStyle(fontSize: 12, color: AetherTheme.olive))),
      ]),
    );
  }
}

class StaffShell extends StatefulWidget {
  const StaffShell({super.key});

  @override
  State<StaffShell> createState() => _StaffShellState();
}

class _StaffShellState extends State<StaffShell> {
  static const _paginas = [
    ('Preparar', Icons.download_for_offline_outlined, 'CU12'),
    ('Catalogo', Icons.search, 'CU13'),
    ('Caja', Icons.point_of_sale, 'CU20'),
    ('Venta', Icons.shopping_cart_outlined, 'CU14'),
    ('Reserva', Icons.event_available, 'CU15'),
    ('Cambio', Icons.swap_horiz, 'CU19'),
    ('Operaciones', Icons.sync, 'CU16-17'),
  ];
  int _indice = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<OfflineSyncService>().iniciar());
  }

  Widget _pagina(int indice) => switch (indice) {
        0 => const _PrepararPantalla(),
        1 => const _CatalogoPantalla(),
        2 => const _CajaPantalla(),
        3 => const _VentaPantalla(),
        4 => const _ReservaPantalla(),
        5 => const _CambioPantalla(),
        _ => const _OperacionesPantalla(),
      };

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<OfflineSyncService>();
    final app = context.read<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: Text(_paginas[_indice].$1),
        actions: [
          Chip(
            label: Text(sync.enLinea ? 'En linea' : 'Modo sin conexion', style: const TextStyle(fontSize: 11)),
            backgroundColor: sync.enLinea ? const Color(0xFFDDEFE3) : const Color(0xFFF6E6C4),
          ),
          if (sync.pendientes > 0)
            Padding(padding: const EdgeInsets.only(left: 6), child: CircleAvatar(radius: 11, child: Text('${sync.pendientes}', style: const TextStyle(fontSize: 11)))),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              final navegador = Navigator.of(context);
              await sync.limpiar();
              await app.logout();
              navegador.popUntil((r) => r.isFirst);
            },
          ),
        ],
      ),
      drawer: Drawer(
        child: ListView(children: [
          const DrawerHeader(child: Text('YouShop · Modo tienda')),
          for (var i = 0; i < _paginas.length; i++)
            ListTile(
              leading: Icon(_paginas[i].$2),
              title: Text(_paginas[i].$1),
              trailing: Text(_paginas[i].$3, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
              selected: i == _indice,
              onTap: () {
                setState(() => _indice = i);
                Navigator.pop(context);
              },
            ),
        ]),
      ),
      body: _pagina(_indice),
    );
  }
}

// --- [CU12] Preparar dispositivo ---------------------------------------------

class _PrepararPantalla extends StatefulWidget {
  const _PrepararPantalla();

  @override
  State<_PrepararPantalla> createState() => _PrepararPantallaState();
}

class _PrepararPantallaState extends State<_PrepararPantalla> {
  final _pin = TextEditingController();
  List<Map<String, dynamic>> _sucursales = [];
  int? _sucursal;

  @override
  void initState() {
    super.initState();
    final sync = context.read<OfflineSyncService>();
    _sucursal = sync.sucursal;
    ApiClient().get('/api/inventory/locations').then((datos) {
      if (mounted) setState(() => _sucursales = (datos as List).cast<Map<String, dynamic>>());
    }).catchError((_) {});
  }

  Future<void> _preparar() async {
    final sync = context.read<OfflineSyncService>();
    if (_pin.text.isNotEmpty) {
      if (!RegExp(r'^\d{4,6}$').hasMatch(_pin.text)) return _avisar(context, 'El PIN debe tener de 4 a 6 digitos.');
      await sync.definirPin(_pin.text);
      _pin.clear();
    }
    final error = await sync.preparar(_sucursal!);
    if (mounted) _avisar(context, error ?? 'Dispositivo listo para operar sin conexion');
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<OfflineSyncService>();
    return ListView(padding: const EdgeInsets.all(16), children: [
      const CuMarca('CU12', 'Preparar dispositivo para operacion sin conexion'),
      DropdownButtonFormField<int>(
        key: ValueKey(_sucursales.length),
        initialValue: _sucursal,
        decoration: const InputDecoration(labelText: 'Sucursal'),
        items: _sucursales
            .map((s) => DropdownMenuItem(value: s['codigoSucursal'] as int, child: Text(s['nombre'] as String)))
            .toList(),
        onChanged: (v) => setState(() => _sucursal = v),
      ),
      TextField(controller: _pin, obscureText: true, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'PIN local (4 a 6 digitos)')),
      const SizedBox(height: 12),
      FilledButton(
        onPressed: _sucursal == null || !sync.enLinea || sync.descargando ? null : _preparar,
        child: Text(sync.listo ? 'Actualizar datos' : 'Preparar modo sin conexion'),
      ),
      if (sync.descargando) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Descargando ${sync.avanceDescarga ?? ''}...')),
      if (sync.descargaInterrumpida) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Descarga interrumpida: lo descargado se conservo y se reanuda al volver la conexion.')),
      if (sync.listo)
        Card(
          margin: const EdgeInsets.only(top: 16),
          child: ListTile(
            leading: const Icon(Icons.check_circle, color: Colors.green),
            title: const Text('Dispositivo listo para operar sin conexion'),
            subtitle: Text('${sync.preparacion!['sucursalNombre']} · ${fechaCorta(sync.preparacion!['fechaDescarga'] as String?)}'),
          ),
        ),
    ]);
  }
}

// --- [CU13] Catalogo ----------------------------------------------------------

class _CatalogoPantalla extends StatefulWidget {
  const _CatalogoPantalla();

  @override
  State<_CatalogoPantalla> createState() => _CatalogoPantallaState();
}

class _CatalogoPantallaState extends State<_CatalogoPantalla> {
  List<Map<String, dynamic>> _productos = [];
  Map<int, int> _stock = {};
  String _busqueda = '';

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final sync = context.read<OfflineSyncService>();
    final productos = await sync.catalogo();
    final stock = await sync.existencias();
    if (mounted) setState(() { _productos = productos; _stock = stock; });
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<OfflineSyncService>();
    final terminos = _busqueda.toLowerCase().split(' ').where((t) => t.isNotEmpty);
    final filtrados = _productos.where((p) {
      final texto = [p['nombre'], p['codigo'], p['tipo'], p['talla'], p['color']].join(' ').toLowerCase();
      return terminos.every(texto.contains);
    }).take(60).toList();
    return ListView(padding: const EdgeInsets.all(16), children: [
      const CuMarca('CU13', 'Consultar catalogo, precios y existencias sin conexion'),
      Text('Actualizado: ${fechaCorta(sync.preparacion?['fechaDescarga'] as String?)}', style: const TextStyle(fontSize: 12)),
      if (sync.desactualizado) const Text('La informacion puede estar desactualizada', style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold)),
      TextField(decoration: const InputDecoration(labelText: 'Nombre, codigo, categoria, talla o color'), onChanged: (v) => setState(() => _busqueda = v)),
      const SizedBox(height: 8),
      if (_productos.isEmpty) const Text('Prepare el dispositivo primero (CU12).'),
      if (_productos.isNotEmpty && filtrados.isEmpty) const Text('Ese producto no esta disponible sin conexion.'),
      for (final p in filtrados)
        ListTile(
          dense: true,
          title: Text('${p['nombre']}'),
          subtitle: Text('${p['codigo']} · Talla ${p['talla'] ?? '-'} · ${p['color'] ?? '-'}'),
          trailing: Text('${bs(p['venta'] as num)}\nExistencia ${_stock[p['idProducto']] ?? 0}', textAlign: TextAlign.right),
        ),
    ]);
  }
}

// --- [CU20] Caja --------------------------------------------------------------

class _CajaPantalla extends StatefulWidget {
  const _CajaPantalla();

  @override
  State<_CajaPantalla> createState() => _CajaPantallaState();
}

class _CajaPantallaState extends State<_CajaPantalla> {
  final _monto = TextEditingController();
  final _contado = TextEditingController();
  final _justificacion = TextEditingController();

  Future<void> _abrir() async {
    try {
      await context.read<OfflineSyncService>().abrirCaja(double.tryParse(_monto.text) ?? 0);
    } on ApiException catch (e) {
      if (mounted) _avisar(context, e.message);
    }
  }

  Future<void> _cerrar() async {
    final contado = double.tryParse(_contado.text);
    if (contado == null) return;
    try {
      final justificacion = _justificacion.text.trim();
      final estado = await context.read<OfflineSyncService>().cerrarCaja(contado, justificacion.isEmpty ? null : justificacion);
      _contado.clear();
      _justificacion.clear();
      if (mounted) _avisar(context, 'Caja: $estado');
    } on ApiException catch (e) {
      if (mounted) _avisar(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<OfflineSyncService>();
    final caja = sync.caja;
    final efectivo = sync.efectivoDeCaja();
    final inicial = (caja?['montoInicial'] as num? ?? 0).toDouble();
    final esperado = inicial + efectivo.ingresos - efectivo.egresos;
    final contado = double.tryParse(_contado.text);
    final diferencia = contado == null ? null : contado - esperado;
    final umbral = (sync.configuracion['umbralDiferenciaCaja'] as num? ?? 50).toDouble();
    return ListView(padding: const EdgeInsets.all(16), children: [
      const CuMarca('CU20', 'Gestionar apertura y cierre de caja'),
      if (!sync.listo) const Text('Prepare el dispositivo primero (CU12).'),
      if (sync.listo && caja == null) ...[
        TextField(controller: _monto, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Monto inicial en efectivo')),
        const SizedBox(height: 12),
        FilledButton(onPressed: _abrir, child: const Text('Abrir caja')),
      ],
      if (caja != null) ...[
        Text('Caja abierta desde ${fechaCorta(caja['fechaApertura'] as String?)}'),
        Text('Monto inicial: ${bs(inicial)}'),
        Text('Ingresos: ${bs(efectivo.ingresos)}'),
        Text('Egresos: ${bs(efectivo.egresos)}'),
        Text('Monto esperado: ${bs(esperado)}', style: const TextStyle(fontWeight: FontWeight.bold)),
        const Divider(),
        TextField(controller: _contado, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Efectivo contado'), onChanged: (_) => setState(() {})),
        if (diferencia != null) Text(diferencia == 0 ? 'Sin diferencia' : '${diferencia > 0 ? 'Sobrante' : 'Faltante'}: ${bs(diferencia.abs())}'),
        if (diferencia != null && diferencia.abs() > umbral)
          TextField(controller: _justificacion, decoration: const InputDecoration(labelText: 'Justificacion')),
        if (sync.sinConfirmarDeCaja(caja['uuidOperacion'] as String).isNotEmpty)
          const Text('Hay operaciones sin confirmar: se registrara un cierre provisional.', style: TextStyle(color: Colors.orange)),
        const SizedBox(height: 12),
        FilledButton(onPressed: contado == null ? null : _cerrar, child: const Text('Confirmar cierre')),
      ],
    ]);
  }
}

// --- Seleccion de prendas y cliente (CU14 y CU15) ------------------------------

class _BuscadorPrendas extends StatefulWidget {
  const _BuscadorPrendas({required this.alElegir});
  final void Function(Map<String, dynamic> prenda, int existencia) alElegir;

  @override
  State<_BuscadorPrendas> createState() => _BuscadorPrendasState();
}

class _BuscadorPrendasState extends State<_BuscadorPrendas> {
  List<Map<String, dynamic>> _productos = [];
  Map<int, int> _stock = {};
  final _busqueda = TextEditingController();

  @override
  void initState() {
    super.initState();
    final sync = context.read<OfflineSyncService>();
    sync.catalogo().then((p) async {
      final stock = await sync.existencias();
      if (mounted) setState(() { _productos = p; _stock = stock; });
    });
  }

  @override
  Widget build(BuildContext context) {
    final q = _busqueda.text.toLowerCase();
    final filtrados = q.isEmpty
        ? const <Map<String, dynamic>>[]
        : _productos.where((p) => [p['nombre'], p['codigo'], p['talla'], p['color']].join(' ').toLowerCase().contains(q)).take(15).toList();
    return Column(children: [
      TextField(controller: _busqueda, decoration: const InputDecoration(labelText: 'Codigo (YS-000123) o nombre'), onChanged: (_) => setState(() {})),
      for (final p in filtrados)
        ListTile(
          dense: true,
          title: Text('${p['nombre']} · ${p['talla'] ?? '-'} · ${p['color'] ?? '-'}'),
          subtitle: Text('${bs(p['venta'] as num)} · existencia ${_stock[p['idProducto']] ?? 0}'),
          onTap: () {
            widget.alElegir(p, _stock[p['idProducto']] ?? 0);
            _busqueda.clear();
            setState(() {});
          },
        ),
    ]);
  }
}

class _Cliente {
  int? id;
  String nombreNuevo = '';
  String ciNuevo = '';
  String etiqueta = 'Cliente generico';

  bool get incompleto => (nombreNuevo.isEmpty) != (ciNuevo.isEmpty);
  Map<String, dynamic> get datos => {
        'idCliente': id,
        'clienteNuevo': nombreNuevo.isNotEmpty && ciNuevo.isNotEmpty ? {'nombre': nombreNuevo, 'ci': ciNuevo} : null,
        'clienteNombre': nombreNuevo.isNotEmpty ? nombreNuevo : etiqueta,
      };
}

class _SelectorCliente extends StatefulWidget {
  const _SelectorCliente({required this.cliente});
  final _Cliente cliente;

  @override
  State<_SelectorCliente> createState() => _SelectorClienteState();
}

class _SelectorClienteState extends State<_SelectorCliente> {
  List<Map<String, dynamic>> _clientes = [];

  @override
  void initState() {
    super.initState();
    context.read<OfflineSyncService>().clientes().then((c) {
      if (mounted) setState(() => _clientes = c);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.cliente;
    return Column(children: [
      DropdownButtonFormField<int?>(
        initialValue: c.id,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Cliente'),
        items: [
          const DropdownMenuItem<int?>(value: null, child: Text('Cliente generico o nuevo')),
          ..._clientes.take(200).map((x) => DropdownMenuItem<int?>(value: x['idCliente'] as int, child: Text('${x['nombre']}'))),
        ],
        onChanged: (v) => setState(() {
          c.id = v;
          c.etiqueta = v == null ? 'Cliente generico' : _clientes.firstWhere((x) => x['idCliente'] == v)['nombre'] as String;
        }),
      ),
      if (c.id == null)
        Row(children: [
          Expanded(child: TextField(decoration: const InputDecoration(labelText: 'Nombre (cliente nuevo)'), onChanged: (v) => c.nombreNuevo = v.trim())),
          const SizedBox(width: 8),
          Expanded(child: TextField(decoration: const InputDecoration(labelText: 'CI'), onChanged: (v) => c.ciNuevo = v.trim())),
        ]),
    ]);
  }
}

Future<void> _comprobante(BuildContext context, String titulo, OperacionLocal op, String leyenda, List<String> lineas) {
  return showDialog(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(titulo),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final l in lineas) Text(l),
        const SizedBox(height: 8),
        Text(op.uuidOperacion, style: const TextStyle(fontSize: 10)),
        const SizedBox(height: 8),
        Text(leyenda, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.orange)),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Listo'))],
    ),
  );
}

// --- [CU14] Venta -------------------------------------------------------------

class _VentaPantalla extends StatefulWidget {
  const _VentaPantalla();

  @override
  State<_VentaPantalla> createState() => _VentaPantallaState();
}

class _VentaPantallaState extends State<_VentaPantalla> {
  final List<Map<String, dynamic>> _lineas = [];
  final _recibido = TextEditingController();
  final _pin = TextEditingController();
  _Cliente _cliente = _Cliente();
  bool _pinOk = false;

  double get _total => _lineas.fold(0, (s, l) => s + (l['precioUnitario'] as num) * (l['cantidad'] as int));

  void _agregar(Map<String, dynamic> p, int existencia) {
    final sync = context.read<OfflineSyncService>();
    final sinStock = sync.configuracion['permiteVentaSinStock'] as bool? ?? false;
    final actual = _lineas.where((l) => l['idProducto'] == p['idProducto']).firstOrNull;
    final cantidad = (actual?['cantidad'] as int? ?? 0) + 1;
    if (cantidad > existencia && !sinStock) return _avisar(context, 'La existencia local conocida no alcanza.');
    setState(() {
      if (actual != null) {
        actual['cantidad'] = cantidad;
      } else {
        _lineas.add({
          'idProducto': p['idProducto'], 'nombre': '${p['nombre']} ${p['talla'] ?? ''}', 'cantidad': 1,
          'precioUnitario': p['venta'], 'stockNoConfirmado': existencia <= 0,
        });
      }
    });
  }

  Future<void> _confirmar() async {
    final sync = context.read<OfflineSyncService>();
    final recibido = double.tryParse(_recibido.text) ?? 0;
    final cambio = calcularCambio(_total, recibido);
    if (cambio == null) return _avisar(context, 'El monto recibido no cubre el total.');
    if (_cliente.incompleto) return _avisar(context, 'El cliente nuevo necesita nombre y CI.');
    final total = _total;
    final op = await sync.registrar(
      tipo: 'venta', total: total, resumen: 'Venta · ${_lineas.length} prenda(s)',
      datos: {
        ..._cliente.datos, 'items': _lineas, 'total': total, 'formaPago': 'Efectivo', 'montoRecibido': recibido,
        'uuidCaja': sync.caja!['uuidOperacion'],
      },
    );
    if (!mounted) return;
    await _comprobante(context, 'Venta de contado', op, 'Sujeto a confirmacion del servidor', [
      for (final l in _lineas) '${l['cantidad']} x ${l['nombre']}',
      'Total: ${bs(total)}', 'Recibido: ${bs(recibido)}', 'Cambio: ${bs(cambio)}',
    ]);
    setState(() {
      _lineas.clear();
      _cliente = _Cliente();
      _recibido.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<OfflineSyncService>();
    return ListView(padding: const EdgeInsets.all(16), children: [
      const CuMarca('CU14', 'Registrar venta de contado sin conexion'),
      if (!sync.listo) const Text('Prepare el dispositivo primero (CU12).'),
      if (sync.listo && sync.caja == null) const Text('La caja debe estar abierta para vender (CU20).'),
      if (sync.necesitaPin && !_pinOk) ...[
        const Text('La sesion guardada vencio: ingrese su PIN local.'),
        TextField(controller: _pin, obscureText: true, keyboardType: TextInputType.number),
        FilledButton(
          onPressed: () async {
            final ok = await sync.verificarPin(_pin.text);
            _pin.clear();
            if (ok) setState(() => _pinOk = true);
          },
          child: const Text('Continuar'),
        ),
      ] else if (sync.caja != null) ...[
        _BuscadorPrendas(alElegir: _agregar),
        for (final l in _lineas)
          ListTile(
            dense: true,
            title: Text('${l['cantidad']} x ${l['nombre']}'),
            trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => setState(() => _lineas.remove(l))),
          ),
        if (_lineas.isNotEmpty) ...[
          Text('Total: ${bs(_total)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          _SelectorCliente(cliente: _cliente),
          const Text('Sin conexion solo se acepta efectivo.', style: TextStyle(fontSize: 12)),
          TextField(controller: _recibido, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Monto recibido')),
          const SizedBox(height: 12),
          FilledButton(onPressed: _confirmar, child: const Text('Confirmar recepcion del efectivo')),
        ],
      ],
    ]);
  }
}

// --- [CU15] Reserva -----------------------------------------------------------

class _ReservaPantalla extends StatefulWidget {
  const _ReservaPantalla();

  @override
  State<_ReservaPantalla> createState() => _ReservaPantallaState();
}

class _ReservaPantallaState extends State<_ReservaPantalla> {
  final List<Map<String, dynamic>> _lineas = [];
  final _deposito = TextEditingController();
  _Cliente _cliente = _Cliente();

  void _agregar(Map<String, dynamic> p, int existencia) {
    final actual = _lineas.where((l) => l['idProducto'] == p['idProducto']).firstOrNull;
    if ((actual?['cantidad'] as int? ?? 0) + 1 > existencia) return _avisar(context, 'No se puede reservar esa variante: sin existencia.');
    setState(() {
      if (actual != null) {
        actual['cantidad'] += 1;
      } else {
        _lineas.add({'idProducto': p['idProducto'], 'nombre': '${p['nombre']} ${p['talla'] ?? ''}', 'cantidad': 1, 'precioUnitario': p['venta']});
      }
    });
  }

  Future<void> _confirmar() async {
    final sync = context.read<OfflineSyncService>();
    if (_cliente.incompleto) return _avisar(context, 'El cliente nuevo necesita nombre y CI.');
    final deposito = double.tryParse(_deposito.text) ?? 0;
    if (deposito > 0 && sync.caja == null) return _avisar(context, 'Para recibir un deposito la caja debe estar abierta (CU20).');
    final horas = sync.configuracion['horasRetiroReserva'] as int? ?? 48;
    final limite = DateTime.now().toUtc().add(Duration(hours: horas));
    final op = await sync.registrar(
      tipo: 'reserva', total: deposito, resumen: _lineas.map((l) => '${l['cantidad']} x ${l['nombre']}').join(', '),
      datos: {
        ..._cliente.datos, 'items': _lineas, 'fechaLimite': limite.toIso8601String(), 'deposito': deposito,
        'uuidCaja': sync.caja?['uuidOperacion'],
      },
    );
    if (!mounted) return;
    await _comprobante(context, 'Reserva de prendas', op, 'La reserva sera confirmada al restablecerse la conexion', [
      for (final l in _lineas) '${l['cantidad']} x ${l['nombre']}',
      'Deposito: ${bs(deposito)}', 'Retiro hasta: ${fechaCorta(limite.toIso8601String())}',
    ]);
    setState(() {
      _lineas.clear();
      _cliente = _Cliente();
      _deposito.clear();
    });
  }

  Future<void> _cancelar(OperacionLocal op) async {
    final sync = context.read<OfflineSyncService>();
    await sync.registrar(
      tipo: 'cancelar_reserva', total: op.total, resumen: 'Cancelar: ${op.resumen}', dependeDe: op.uuidOperacion,
      datos: {'uuidReserva': op.uuidOperacion, 'devolverDeposito': op.datos['deposito'] ?? 0, 'uuidCaja': sync.caja?['uuidOperacion']},
    );
    if (mounted) _avisar(context, 'Reserva cancelada: se libero la existencia apartada.');
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<OfflineSyncService>();
    final canceladas = sync.operaciones.where((o) => o.tipo == 'cancelar_reserva').map((o) => o.datos['uuidReserva']).toSet();
    final vigentes = sync.operaciones.where((o) => o.tipo == 'reserva' && o.sinConfirmar && !canceladas.contains(o.uuidOperacion));
    return ListView(padding: const EdgeInsets.all(16), children: [
      const CuMarca('CU15', 'Registrar reserva de prendas sin conexion'),
      if (!sync.listo) const Text('Prepare el dispositivo primero (CU12).'),
      if (sync.listo) ...[
        _BuscadorPrendas(alElegir: _agregar),
        for (final l in _lineas) ListTile(dense: true, title: Text('${l['cantidad']} x ${l['nombre']}')),
        if (_lineas.isNotEmpty) ...[
          _SelectorCliente(cliente: _cliente),
          TextField(controller: _deposito, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Deposito en efectivo (opcional)')),
          const SizedBox(height: 12),
          FilledButton(onPressed: _confirmar, child: const Text('Registrar reserva')),
        ],
        const Divider(),
        for (final r in vigentes)
          ListTile(
            dense: true,
            title: Text(r.resumen),
            subtitle: Text(r.estado),
            trailing: TextButton(onPressed: () => _cancelar(r), child: const Text('Cancelar')),
          ),
      ],
    ]);
  }
}

// --- [CU19] Cambio ------------------------------------------------------------

class _CambioPantalla extends StatefulWidget {
  const _CambioPantalla();

  @override
  State<_CambioPantalla> createState() => _CambioPantallaState();
}

class _CambioPantallaState extends State<_CambioPantalla> {
  List<Map<String, dynamic>> _ventas = [];
  List<Map<String, dynamic>> _catalogo = [];
  Map<int, int> _stock = {};
  Map<String, dynamic>? _venta;
  Map<String, dynamic>? _linea;
  Map<String, dynamic>? _nueva;
  String _condicion = 'apta';
  String _busqueda = '';
  final _custodia = TextEditingController();
  final _clienteCustodia = TextEditingController();

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final sync = context.read<OfflineSyncService>();
    final ventas = await sync.ventas();
    final catalogo = await sync.catalogo();
    final stock = await sync.existencias();
    if (mounted) setState(() { _ventas = ventas; _catalogo = catalogo; _stock = stock; });
  }

  double _diferencia(Map<String, dynamic> politica) {
    final linea = _linea!;
    final original = _catalogo.where((p) => p['idProducto'] == linea['idProducto']).firstOrNull;
    final pagado = (linea['precioPagado'] as num).toDouble();
    return diferenciaCambio(
      precioPagado: pagado,
      precioActualOriginal: (original?['venta'] as num? ?? pagado).toDouble(),
      precioActualNueva: (_nueva!['venta'] as num).toDouble(),
      cantidad: 1,
      descuentoDeterioroPct: _condicion == 'deteriorada' ? (politica['descuentoDeterioroPct'] as num).toDouble() : 0,
      respetarPrecioOriginal: politica['respetarPrecioOriginal'] as bool,
    );
  }

  Future<void> _confirmar(Map<String, dynamic> politica) async {
    final sync = context.read<OfflineSyncService>();
    final diferencia = _diferencia(politica);
    final cobrado = diferencia > 0 ? diferencia : 0.0;
    final linea = _linea!;
    final nueva = _nueva!;
    final tipo = nueva['color'] != linea['color'] && nueva['talla'] == linea['talla'] ? 'cambio_color' : 'cambio_talla';
    final uuidVenta = _venta!['uuidOperacion'] as String;
    final op = await sync.registrar(
      tipo: 'cambio', total: cobrado, resumen: 'Cambio: ${linea['nombre']} ${linea['talla'] ?? ''} a ${nueva['talla'] ?? ''}',
      dependeDe: sync.operaciones.any((o) => o.uuidOperacion == uuidVenta) ? uuidVenta : null,
      datos: {
        'idVenta': _venta!['idVenta'], 'uuidVenta': uuidVenta, 'idProducto': linea['idProducto'], 'idProductoNuevo': nueva['idProducto'],
        'cantidad': 1, 'tipo': tipo, 'motivoCategoria': tipo == 'cambio_color' ? 'color' : 'talla', 'condicion': _condicion,
        'diferencia': diferencia, 'montoCobrado': cobrado, 'uuidCaja': sync.caja!['uuidOperacion'],
      },
    );
    if (!mounted) return;
    await _comprobante(context, 'Cambio de prenda', op, 'Sujeto a confirmacion del servidor', [
      if (diferencia > 0) 'Cobrado: ${bs(diferencia)}',
      if (diferencia < 0) 'Saldo a favor pendiente: ${bs(-diferencia)}',
      if (diferencia == 0) 'Cambio sin costo',
    ]);
    setState(() { _venta = null; _linea = null; _nueva = null; _condicion = 'apta'; });
    _cargar();
  }

  Future<void> _registrarCustodia() async {
    final sync = context.read<OfflineSyncService>();
    if (_clienteCustodia.text.trim().length < 2 || _custodia.text.trim().length < 2) return _avisar(context, 'Indique el cliente y la prenda.');
    final op = await sync.registrar(
      tipo: 'custodia', resumen: 'Custodia: ${_custodia.text.trim()}',
      datos: {'clienteNombre': _clienteCustodia.text.trim(), 'descripcionPrenda': _custodia.text.trim()},
    );
    if (!mounted) return;
    await _comprobante(context, 'Recepcion en custodia', op, 'El cambio se completara al recuperar la conexion', [_custodia.text.trim()]);
    _custodia.clear();
    _clienteCustodia.clear();
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<OfflineSyncService>();
    final politica = sync.politica;
    final encabezado = <Widget>[
      const CuMarca('CU19', 'Registrar cambio de prenda sin conexion'),
      const Text('Solo talla o color del mismo modelo. Reembolso o cambio por otro producto requieren conexion.', style: TextStyle(fontSize: 12)),
    ];
    if (!sync.listo || politica == null) return ListView(padding: const EdgeInsets.all(16), children: [...encabezado, const Text('Prepare el dispositivo primero (CU12).')]);
    if (sync.caja == null) return ListView(padding: const EdgeInsets.all(16), children: [...encabezado, const Text('La caja debe estar abierta (CU20).')]);

    final venta = _venta;
    if (venta == null) {
      final q = _busqueda.toLowerCase();
      final filtradas = _ventas.where((v) => '${v['idVenta']} ${v['cliente']} ${v['ci']}'.toLowerCase().contains(q)).take(30);
      return ListView(padding: const EdgeInsets.all(16), children: [
        ...encabezado,
        TextField(decoration: const InputDecoration(labelText: 'N.o de venta, cliente o CI'), onChanged: (v) => setState(() => _busqueda = v)),
        for (final v in filtradas)
          ListTile(
            dense: true,
            title: Text('${v['idVenta'] ?? 'Venta sin conexion'} · ${v['cliente'] ?? 'Cliente'}'),
            subtitle: Text('${fechaCorta(v['fecha'] as String?)} · ${bs(v['total'] as num)}'),
            onTap: () => setState(() => _venta = v),
          ),
        const Divider(),
        const Text('Recepcion en custodia (la venta no esta aqui)', style: TextStyle(fontWeight: FontWeight.bold)),
        TextField(controller: _clienteCustodia, decoration: const InputDecoration(labelText: 'Cliente')),
        TextField(controller: _custodia, decoration: const InputDecoration(labelText: 'Prenda recibida')),
        TextButton(onPressed: _registrarCustodia, child: const Text('Registrar custodia')),
      ]);
    }

    final lineas = (venta['lineas'] as List).cast<Map>().map((l) => l.cast<String, dynamic>()).toList();
    final linea = _linea;
    final motivo = linea == null
        ? null
        : motivoNoCambio(
            fechaVenta: DateTime.parse(venta['fecha'] as String), linea: linea, cantidad: 1,
            esDefecto: _condicion == 'defectuosa', politica: politica, ahora: DateTime.now(),
          );
    final rechazada = _condicion == 'deteriorada' && politica['accionDeterioro'] == 'rechazar';
    final variantes = linea == null
        ? const <Map<String, dynamic>>[]
        : _catalogo.where((p) => p['idModelo'] != null && p['idModelo'] == linea['idModelo'] && p['idProducto'] != linea['idProducto'] && (_stock[p['idProducto']] ?? 0) > 0).toList();
    return ListView(padding: const EdgeInsets.all(16), children: [
      ...encabezado,
      TextButton(onPressed: () => setState(() { _venta = null; _linea = null; _nueva = null; }), child: const Text('Otra venta')),
      for (final l in lineas)
        ListTile(
          dense: true,
          selected: l['idProducto'] == linea?['idProducto'],
          title: Text('${l['nombre']} · ${l['talla'] ?? '-'} · ${l['color'] ?? '-'}'),
          subtitle: Text('${bs(l['precioPagado'] as num)} · ${l['disponibles']} disponible'),
          onTap: () => setState(() { _linea = l; _nueva = null; }),
        ),
      if (linea != null) ...[
        DropdownButtonFormField<String>(
          initialValue: _condicion,
          decoration: const InputDecoration(labelText: 'Inspeccion de la prenda'),
          items: const [
            DropdownMenuItem(value: 'apta', child: Text('Apta')),
            DropdownMenuItem(value: 'defectuosa', child: Text('Defecto de fabrica')),
            DropdownMenuItem(value: 'deteriorada', child: Text('Deteriorada')),
          ],
          onChanged: (v) => setState(() => _condicion = v ?? 'apta'),
        ),
        if (motivo != null) Text(motivo, style: const TextStyle(color: Colors.red)),
        if (rechazada) const Text('La politica no acepta prendas deterioradas.', style: TextStyle(color: Colors.red)),
        if (motivo == null && !rechazada) ...[
          for (final p in variantes)
            ListTile(
              dense: true,
              selected: p['idProducto'] == _nueva?['idProducto'],
              title: Text('Talla ${p['talla'] ?? '-'} · ${p['color'] ?? '-'}'),
              subtitle: Text('${bs(p['venta'] as num)} · existencia ${_stock[p['idProducto']] ?? 0}'),
              onTap: () => setState(() => _nueva = p),
            ),
          if (_nueva != null) ...[
            Text(() {
              final d = _diferencia(politica);
              return d > 0 ? 'A cobrar en efectivo: ${bs(d)}' : d < 0 ? 'Saldo a favor: ${bs(-d)} (se devuelve al sincronizar)' : 'Cambio sin costo';
            }(), style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => _confirmar(politica), child: const Text('Registrar cambio')),
          ],
        ],
      ],
    ]);
  }
}

// --- [CU16] [CU17] Operaciones ------------------------------------------------

class _OperacionesPantalla extends StatefulWidget {
  const _OperacionesPantalla();

  @override
  State<_OperacionesPantalla> createState() => _OperacionesPantallaState();
}

class _OperacionesPantallaState extends State<_OperacionesPantalla> {
  String? _estado;

  void _detalle(OperacionLocal op) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('${op.tipo} · ${op.estado}'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(op.resumen),
          Text(op.uuidOperacion, style: const TextStyle(fontSize: 10)),
          Text('Intentos de envio: ${op.intentos}'),
          Text('Ultimo intento: ${fechaCorta(op.ultimoIntento)}'),
          Text('Identificador en el servidor: ${op.idServidor ?? '-'}'),
          if (op.motivo != null) Text('Motivo: ${op.motivo}', style: const TextStyle(color: Colors.red)),
          if (op.estado == 'En conflicto') const Text('Lo resuelve el Encargado en la web (CU18).'),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<OfflineSyncService>();
    final filtradas = sync.operaciones.where((o) => _estado == null || o.estado == _estado).toList();
    return ListView(padding: const EdgeInsets.all(16), children: [
      const CuMarca('CU16', 'Consultar operaciones pendientes y resultado de sincronizacion'),
      const CuMarca('CU17', 'Sincronizar operaciones pendientes'),
      if (sync.sesionRequerida) const Text('Inicie sesion de nuevo: sus operaciones siguen guardadas.', style: TextStyle(color: Colors.orange)),
      Row(children: [
        Expanded(
          child: DropdownButton<String?>(
            value: _estado,
            isExpanded: true,
            hint: const Text('Todos los estados'),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('Todos los estados')),
              for (final e in const ['Registrada localmente', 'Enviada', 'Confirmada', 'Rechazada', 'En conflicto', 'Anulada'])
                DropdownMenuItem<String?>(value: e, child: Text(e)),
            ],
            onChanged: (v) => setState(() => _estado = v),
          ),
        ),
        const SizedBox(width: 8),
        FilledButton(
          onPressed: sync.enLinea && !sync.sincronizando ? () => sync.sincronizar() : null,
          child: Text(sync.sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'),
        ),
      ]),
      if (filtradas.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No hay operaciones pendientes'))),
      for (final op in filtradas)
        ListTile(
          dense: true,
          title: Text(op.resumen, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text('${op.uuidOperacion.substring(0, 8)} · ${fechaCorta(op.fechaOperacion)} · ${bs(op.total)}'),
          trailing: Text(op.estado, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
          onTap: () => _detalle(op),
        ),
    ]);
  }
}
