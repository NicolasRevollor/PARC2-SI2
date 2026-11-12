import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import 'api_client.dart';
import 'offline_db.dart';
import 'offline_rules.dart';

const _secciones = [
  ('sucursales', 'sucursales', 'codigoSucursal'),
  ('productos', 'catalogo', 'idProducto'),
  ('inventario', 'inventario', 'idInv'),
  ('clientes', 'clientes', 'idCliente'),
  ('reservas', 'reservas', 'codigoReserva'),
  ('ventas', 'ventas', 'idVenta'),
];

/// [CU12] preparacion, [CU13] consultas locales, cola de [CU14] [CU15] [CU19]
/// [CU20] y [CU17] sincronizacion. Es la misma logica que
/// web/src/app/core/services/offline-sync.service.ts, sobre SQLite.
class OfflineSyncService extends ChangeNotifier {
  OfflineSyncService(this._api);

  final ApiClient _api;
  final OfflineDb _db = OfflineDb();
  final Connectivity _conectividad = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _escucha;
  Timer? _reintento;
  int _fallos = 0;
  bool _iniciado = false;

  bool enLinea = true;
  bool sincronizando = false;
  bool descargando = false;
  String? avanceDescarga;
  bool descargaInterrumpida = false;
  bool sesionRequerida = false;
  bool hayPin = false;
  String? bloqueoPropietario;
  Map<String, dynamic>? preparacion;
  Map<String, dynamic>? caja;
  List<OperacionLocal> operaciones = [];
  String? _ultimaVerificacion;
  int? _idUsuario;
  int? _idTenant;

  int get pendientes => operaciones.where((o) => o.pendiente).length;
  int get enConflicto => operaciones.where((o) => o.estado == 'En conflicto').length;
  bool get listo => preparacion != null && bloqueoPropietario == null;
  int? get sucursal => preparacion?['codigoSucursal'] as int?;
  Map<String, dynamic>? get politica => (preparacion?['politica'] as Map?)?.cast<String, dynamic>();
  Map<String, dynamic> get configuracion => ((preparacion?['configuracion'] as Map?) ?? {}).cast<String, dynamic>();

  bool get desactualizado =>
      listo && vencido(preparacion!['fechaDescarga'] as String?, configuracion['horasDatosVigentes'] as int? ?? 24, DateTime.now());

  Future<void> iniciar({int? idUsuario}) async {
    _idUsuario = idUsuario;
    _idTenant = await _api.currentTenantId();
    if (!_iniciado) {
      _iniciado = true;
      await _cargarEstado();
      _escucha = _conectividad.onConnectivityChanged.listen((resultado) {
        final ahora = !resultado.contains(ConnectivityResult.none);
        final recupero = ahora && !enLinea;
        enLinea = ahora;
        notifyListeners();
        if (recupero) unawaited(_alRecuperarConexion());
      });
    } else {
      await _cargarEstado();
    }
    await _revisarPropietario();
    enLinea = !(await _conectividad.checkConnectivity()).contains(ConnectivityResult.none);
    notifyListeners();
    if (enLinea && bloqueoPropietario == null) await _alRecuperarConexion();
  }

  Future<void> _revisarPropietario() async {
    final anterior = await _db.getMeta('propietario');
    final operacionesLocales = await _db.operaciones();
    final pendientesLocales = operacionesLocales.where((op) => op.sinConfirmar).toList();
    final tenantAnterior = anterior is Map ? anterior['idTenant'] : null;
    final tenantGuardado = tenantAnterior ?? preparacion?['idTenant'];
    final otroTenant = _idTenant != null && tenantGuardado != null && tenantGuardado != _idTenant;
    final colaAjena = pendientesLocales.any((op) => op.idTenant != _idTenant);

    bloqueoPropietario = null;
    if (pendientesLocales.isNotEmpty && _idTenant == null) {
      bloqueoPropietario = 'No se pudo verificar la empresa de las operaciones locales. Inicie sesion con conexion para proteger la cola.';
      notifyListeners();
      return;
    }
    if ((_idTenant != null && colaAjena) || (otroTenant && pendientesLocales.isNotEmpty)) {
      bloqueoPropietario =
          'Este dispositivo conserva ${pendientesLocales.length} operacion(es) de otra empresa. Inicie sesion con esa empresa para sincronizarlas.';
      notifyListeners();
      return;
    }

    if (otroTenant && pendientesLocales.isEmpty) {
      await _db.limpiar();
      preparacion = null;
      caja = null;
      operaciones = [];
    }

    if (_idTenant != null) {
      await _db.setMeta('propietario', {'idUsuario': _idUsuario, 'idTenant': _idTenant});
    }
  }

  @override
  void dispose() {
    _escucha?.cancel();
    _reintento?.cancel();
    super.dispose();
  }

  Future<void> _cargarEstado() async {
    final prep = await _db.getMeta('preparacion');
    preparacion = prep == null ? null : (prep as Map).cast<String, dynamic>();
    final local = await _db.getMeta('caja');
    caja = local == null ? null : (local as Map).cast<String, dynamic>();
    hayPin = await _db.getMeta('pin') != null;
    _ultimaVerificacion = await _db.getMeta('ultimaVerificacion') as String?;
    descargaInterrumpida = await _db.getMeta('progreso') != null;
    await _refrescarOperaciones();
  }

  Future<void> _refrescarOperaciones() async {
    operaciones = await _db.operaciones();
    notifyListeners();
  }

  Future<void> _alRecuperarConexion() async {
    if (bloqueoPropietario != null) return;
    await _marcarVerificacion();
    await sincronizar();
    final progreso = await _db.getMeta('progreso');
    if (progreso != null) {
      await preparar(progreso['codigoSucursal'] as int);
    } else if (sucursal != null) {
      await preparar(sucursal!);
    }
  }

  // --- [CU12] Preparar dispositivo ---------------------------------------

  /// Devuelve null si salio bien; si no, el motivo.
  Future<String?> preparar(int codigoSucursal) async {
    if (bloqueoPropietario != null) return bloqueoPropietario;
    if (!enLinea || descargando) return 'Se necesita conexion para descargar los datos.';
    descargando = true;
    descargaInterrumpida = false;
    notifyListeners();
    final guardado = await _db.getMeta('progreso');
    var inicio = guardado != null && guardado['codigoSucursal'] == codigoSucursal ? guardado['seccion'] as int : 0;
    var paginaInicial = guardado != null && guardado['codigoSucursal'] == codigoSucursal ? guardado['pagina'] as int : 1;
    try {
      final servidor = await _api.get('/api/sync/preparacion', query: {'codigoSucursal': codigoSucursal}) as Map<String, dynamic>;
      for (var s = inicio; s < _secciones.length; s++) {
        final (seccion, coleccion, clave) = _secciones[s];
        avanceDescarga = seccion;
        notifyListeners();
        var pagina = s == inicio ? paginaInicial : 1;
        var hayMas = true;
        while (hayMas) {
          await _db.setMeta('progreso', {'codigoSucursal': codigoSucursal, 'seccion': s, 'pagina': pagina});
          final datos = await _api.get('/api/sync/snapshot/$seccion',
              query: {'codigoSucursal': codigoSucursal, 'pagina': pagina, 'tam': 100}) as Map<String, dynamic>;
          if (pagina == 1) await _db.vaciar(coleccion);
          await _db.agregar(coleccion, clave, datos['items'] as List);
          hayMas = datos['hayMas'] as bool;
          pagina += 1;
        }
      }
      final politicaServidor = await _api.get('/api/sync/snapshot/politica', query: {'codigoSucursal': codigoSucursal}) as Map<String, dynamic>;
      await _actualizarCaja(codigoSucursal);
      preparacion = {
        'idTenant': servidor['idTenant'],
        'codigoSucursal': codigoSucursal,
        'sucursalNombre': servidor['sucursalNombre'],
        'idClienteGenerico': servidor['idClienteGenerico'],
        'configuracion': servidor['configuracion'],
        'politica': (politicaServidor['items'] as List).first,
        'fechaDescarga': DateTime.now().toUtc().toIso8601String(),
      };
      await _db.setMeta('preparacion', preparacion);
      _idTenant ??= servidor['idTenant'] as int?;
      await _db.setMeta('propietario', {'idUsuario': _idUsuario, 'idTenant': _idTenant});
      await _db.borrarMeta('progreso');
      await _refrescarOperaciones();
      return null;
    } on ApiException catch (e) {
      if (e.statusCode == 402 || e.statusCode == 403) await _db.borrarMeta('progreso');
      return e.message;
    } catch (_) {
      // [CU12] flujo alternativo 4: lo descargado se conserva y se reanuda solo.
      descargaInterrumpida = true;
      return 'Descarga interrumpida: se reanuda al volver la conexion.';
    } finally {
      descargando = false;
      avanceDescarga = null;
      notifyListeners();
    }
  }

  Future<void> _actualizarCaja(int codigoSucursal) async {
    if (caja?['origen'] == 'sin_conexion' && caja?['idCaja'] == null) return;
    try {
      final abierta = await _api.get('/api/caja/actual', query: {'codigoSucursal': codigoSucursal});
      await guardarCaja(abierta == null ? null : _cajaDesdeServidor(abierta as Map<String, dynamic>));
    } catch (_) {
      // Sin respuesta se conserva lo conocido.
    }
  }

  Map<String, dynamic> _cajaDesdeServidor(Map<String, dynamic> c) => {
        'uuidOperacion': c['uuidOperacion'],
        'idCaja': c['idCaja'],
        'codigoSucursal': c['codigoSucursal'],
        'montoInicial': c['montoInicial'],
        'fechaApertura': c['fechaApertura'],
        'origen': 'en_linea',
        'ingresosServidor': c['ingresos'],
        'egresosServidor': c['egresos'],
      };

  Future<void> guardarCaja(Map<String, dynamic>? nueva) async {
    caja = nueva;
    if (nueva == null) {
      await _db.borrarMeta('caja');
    } else {
      await _db.setMeta('caja', nueva);
    }
    notifyListeners();
  }

  /// Ingresos y egresos de la caja abierta, incluido lo hecho en el dispositivo.
  ({double ingresos, double egresos}) efectivoDeCaja() {
    final actual = caja;
    if (actual == null) return (ingresos: 0, egresos: 0);
    final base = actual['origen'] == 'en_linea' ? operaciones.where((o) => o.sinConfirmar).toList() : operaciones;
    final local = efectivoDeOperaciones(base, actual['uuidOperacion'] as String);
    return (
      ingresos: local.ingresos + (actual['ingresosServidor'] as num).toDouble(),
      egresos: local.egresos + (actual['egresosServidor'] as num).toDouble(),
    );
  }

  // --- [CU13] Consultas locales ------------------------------------------

  Future<List<Map<String, dynamic>>> catalogo() => _db.leer('catalogo');
  Future<List<Map<String, dynamic>>> clientes() => _db.leer('clientes');
  Future<List<Map<String, dynamic>>> sucursales() => _db.leer('sucursales');
  Future<List<Map<String, dynamic>>> reservas() => _db.leer('reservas');

  Future<Map<int, int>> existencias() async {
    final fechaDescarga = preparacion?['fechaDescarga'] as String?;
    final mapa = <int, int>{};
    for (final fila in await _db.leer('inventario')) {
      final id = fila['idProducto'] as int;
      final base = (fila['cantidad_actual'] as int) - (fila['cantidad_reservada'] as int);
      mapa[id] = existenciaLocal(base, operaciones, id, fechaDescarga);
    }
    return mapa;
  }

  /// [CU19] paso 1: las descargadas mas las registradas en este dispositivo.
  Future<List<Map<String, dynamic>>> ventas() async {
    final descargadas = await _db.leer('ventas');
    final catalogoLocal = {for (final p in await catalogo()) p['idProducto']: p};
    final propias = operaciones
        .where((o) => o.tipo == 'venta' && !['Rechazada', 'Anulada'].contains(o.estado))
        .where((o) => !descargadas.any((v) => v['uuidOperacion'] == o.uuidOperacion))
        .map((o) => <String, dynamic>{
              'idVenta': o.idServidor,
              'uuidOperacion': o.uuidOperacion,
              'fecha': o.fechaOperacion,
              'cliente': o.datos['clienteNombre'] ?? 'Cliente de esta venta',
              'ci': null,
              'total': o.total,
              'lineas': (o.datos['items'] as List).map((i) {
                final prenda = catalogoLocal[i['idProducto']];
                return {
                  'idProducto': i['idProducto'],
                  'nombre': prenda?['nombre'] ?? 'Producto ${i['idProducto']}',
                  'talla': prenda?['talla'],
                  'color': prenda?['color'],
                  'tipo': prenda?['tipo'],
                  'idModelo': prenda?['idModelo'],
                  'cantidad': i['cantidad'],
                  'precioPagado': i['precioUnitario'],
                  'disponibles': i['cantidad'],
                  'cambios': 0,
                };
              }).toList(),
            });
    return [...propias, ...descargadas];
  }

  // --- Sesion guardada y PIN (CU14 flujo alternativo 5) ------------------

  String _huella(String pin, String sal) {
    List<int> valor = utf8.encode('$sal:$pin');
    for (var i = 0; i < 20000; i++) {
      valor = sha256.convert(valor).bytes;
    }
    return base64Encode(valor);
  }

  Future<void> definirPin(String pin) async {
    final sal = const Uuid().v4();
    await _db.setMeta('pin', {'sal': sal, 'huella': _huella(pin, sal)});
    hayPin = true;
    notifyListeners();
  }

  Future<bool> verificarPin(String pin) async {
    final guardado = await _db.getMeta('pin');
    if (guardado == null) return false;
    final ok = _huella(pin, guardado['sal'] as String) == guardado['huella'];
    if (ok) await _marcarVerificacion();
    return ok;
  }

  Future<void> _marcarVerificacion() async {
    _ultimaVerificacion = DateTime.now().toUtc().toIso8601String();
    await _db.setMeta('ultimaVerificacion', _ultimaVerificacion);
    sesionRequerida = false;
  }

  bool get necesitaPin {
    if (!listo || enLinea || !hayPin) return false;
    return vencido(_ultimaVerificacion, configuracion['horasSesionSinConexion'] as int? ?? 12, DateTime.now());
  }

  // --- Cola ---------------------------------------------------------------

  /// [RNF03] Devuelve la operacion ya escrita en SQLite.
  Future<OperacionLocal> registrar({
    required String tipo,
    required Map<String, dynamic> datos,
    required String resumen,
    double total = 0,
    String? dependeDe,
    String? uuid,
  }) async {
    if (!listo) throw StateError(bloqueoPropietario ?? 'Prepare el dispositivo antes de registrar operaciones.');
    final op = OperacionLocal(
      uuidOperacion: uuid ?? const Uuid().v4(),
      tipo: tipo,
      estado: 'Registrada localmente',
      idTenant: preparacion?['idTenant'] as int?,
      idUsuario: _idUsuario,
      codigoSucursal: sucursal,
      fechaOperacion: DateTime.now().toUtc().toIso8601String(),
      dependeDe: dependeDe,
      total: total,
      resumen: resumen,
      datos: datos,
    );
    await _db.guardarOperacion(op);
    await _refrescarOperaciones();
    if (enLinea) unawaited(sincronizar());
    return op;
  }

  /// [CU17] Sincronizar operaciones pendientes.
  Future<int> sincronizar() async {
    if (!enLinea || sincronizando || bloqueoPropietario != null) return 0;
    sincronizando = true;
    notifyListeners();
    var confirmadas = 0;
    try {
      final cola = ordenarCola((await _db.operaciones()).where((o) => o.pendiente).toList());
      for (var i = 0; i < cola.length; i += 50) {
        final lote = cola.sublist(i, i + 50 > cola.length ? cola.length : i + 50);
        final ahora = DateTime.now().toUtc().toIso8601String();
        for (final op in lote) {
          op
            ..estado = 'Enviada'
            ..intentos += 1
            ..ultimoIntento = ahora;
          await _db.guardarOperacion(op);
        }
        await _refrescarOperaciones();
        final respuesta = await _api.post('/api/sync/lote', body: {
          'operaciones': lote
              .map((op) => {
                    'uuidOperacion': op.uuidOperacion,
                    'tipo': op.tipo,
                    'idTenant': op.idTenant,
                    'idUsuario': op.idUsuario,
                    'codigoSucursal': op.codigoSucursal,
                    'fechaOperacion': op.fechaOperacion,
                    'dependeDe': op.dependeDe,
                    'datos': op.datos,
                  })
              .toList(),
        }) as Map<String, dynamic>;
        for (final r in (respuesta['resultados'] as List).cast<Map<String, dynamic>>()) {
          final op = lote.firstWhere((o) => o.uuidOperacion == r['uuidOperacion']);
          if (await _aplicarResultado(op, r)) confirmadas += 1;
        }
      }
      await _actualizarConflictos();
      _fallos = 0;
      if (confirmadas > 0) await _marcarVerificacion();
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        // [CU17] flujo alternativo 6: todo queda guardado en el dispositivo.
        sesionRequerida = true;
      } else {
        _programarReintento();
      }
    } catch (_) {
      // [CU17] flujo alternativo 1: quedan "Enviada" y se reintenta.
      _programarReintento();
    } finally {
      sincronizando = false;
      await _refrescarOperaciones();
    }
    return confirmadas;
  }

  Future<bool> _aplicarResultado(OperacionLocal op, Map<String, dynamic> r) async {
    final estado = r['estado'] as String;
    if (estado == 'Reintentar' || estado == 'Desconocida') {
      op.estado = 'Registrada localmente';
      op.motivo = r['motivo'] as String?;
      await _db.guardarOperacion(op);
      return false;
    }
    op
      ..estado = estado
      ..idServidor = r['idServidor'] as int?
      ..motivo = r['motivo'] as String?
      ..tipoConflicto = r['tipoConflicto'] as String?
      ..fechaConfirmacion = estado == 'Confirmada' ? DateTime.now().toUtc().toIso8601String() : null;
    await _db.guardarOperacion(op);
    if (op.tipo == 'caja_apertura' && estado == 'Confirmada' && caja?['uuidOperacion'] == op.uuidOperacion) {
      await guardarCaja({...caja!, 'idCaja': op.idServidor});
    }
    return estado == 'Confirmada';
  }

  /// [CU16]: un conflicto pudo resolverse desde la web.
  Future<void> _actualizarConflictos() async {
    final abiertas = (await _db.operaciones()).where((o) => o.estado == 'En conflicto').toList();
    if (abiertas.isEmpty) return;
    final resultados = await _api.post('/api/sync/estado', body: {'uuids': abiertas.map((o) => o.uuidOperacion).toList()}) as List;
    for (final r in resultados.cast<Map<String, dynamic>>()) {
      await _aplicarResultado(abiertas.firstWhere((o) => o.uuidOperacion == r['uuidOperacion']), r);
    }
  }

  void _programarReintento() {
    _fallos += 1;
    _reintento?.cancel();
    _reintento = Timer(esperaReintento(_fallos), () => unawaited(sincronizar()));
  }

  List<String> sinConfirmarDeCaja(String uuidCaja) =>
      operaciones.where((o) => o.sinConfirmar && o.datos['uuidCaja'] == uuidCaja).map((o) => o.uuidOperacion).toList();

  // --- [CU20] Caja --------------------------------------------------------

  Future<void> abrirCaja(double monto) async {
    if (enLinea) {
      final c = await _api.post('/api/caja/abrir', body: {'codigoSucursal': sucursal, 'montoInicial': monto}) as Map<String, dynamic>;
      await guardarCaja(_cajaDesdeServidor(c));
      return;
    }
    final uuid = const Uuid().v4();
    final op = await registrar(
      tipo: 'caja_apertura', uuid: uuid, total: monto, resumen: 'Apertura de caja con Bs ${monto.toStringAsFixed(2)}',
      datos: {'montoInicial': monto},
    );
    await guardarCaja({
      'uuidOperacion': uuid, 'idCaja': null, 'codigoSucursal': sucursal, 'montoInicial': monto,
      'fechaApertura': op.fechaOperacion, 'origen': 'sin_conexion', 'ingresosServidor': 0, 'egresosServidor': 0,
    });
  }

  /// Devuelve el estado con que quedo la caja.
  Future<String> cerrarCaja(double contado, String? justificacion) async {
    final actual = caja!;
    final uuidCaja = actual['uuidOperacion'] as String;
    final pendientesCaja = sinConfirmarDeCaja(uuidCaja);
    if (enLinea && actual['idCaja'] != null) {
      final c = await _api.post('/api/caja/${actual['idCaja']}/cerrar', body: {
        'efectivoContado': contado, 'justificacion': justificacion, 'operacionesPendientes': pendientesCaja,
      }) as Map<String, dynamic>;
      await guardarCaja(null);
      return c['estado'] as String;
    }
    await registrar(
      tipo: 'caja_cierre', total: contado, resumen: 'Cierre de caja: contado Bs ${contado.toStringAsFixed(2)}',
      datos: {'uuidCaja': uuidCaja, 'efectivoContado': contado, 'justificacion': justificacion, 'pendientes': pendientesCaja},
    );
    await guardarCaja(null);
    return 'CierreProvisional';
  }

  /// Al cerrar sesion: lo no entregado se conserva (RNF03).
  Future<void> limpiar() async {
    if (!(await _db.operaciones()).any((o) => o.sinConfirmar)) {
      await _db.limpiar();
      preparacion = null;
      caja = null;
    }
    _iniciado = false;
    await _escucha?.cancel();
    operaciones = [];
  }
}
