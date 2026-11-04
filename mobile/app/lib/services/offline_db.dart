import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import 'offline_rules.dart';

/// [CU12] [RNF03] Base local del dispositivo (SQLite). Es el equivalente de
/// IndexedDB en la web: snapshot de la sucursal, cola de operaciones y metadatos.
/// Una operacion queda escrita aqui antes de confirmarse al usuario.
class OfflineDb {
  Database? _db;

  Future<Database> _abrir() async {
    return _db ??= await openDatabase(
      p.join(await getDatabasesPath(), 'youshop_local.db'),
      version: 1,
      onCreate: (db, _) async {
        await db.execute('CREATE TABLE meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
        await db.execute(
          'CREATE TABLE snapshot (coleccion TEXT NOT NULL, clave TEXT NOT NULL, valor TEXT NOT NULL, '
          'PRIMARY KEY (coleccion, clave))',
        );
        await db.execute('CREATE TABLE operacion (uuid TEXT PRIMARY KEY, fecha TEXT NOT NULL, valor TEXT NOT NULL)');
      },
    );
  }

  Future<void> setMeta(String clave, Object? valor) async {
    final db = await _abrir();
    await db.insert('meta', {'clave': clave, 'valor': jsonEncode(valor)}, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<dynamic> getMeta(String clave) async {
    final db = await _abrir();
    final filas = await db.query('meta', where: 'clave = ?', whereArgs: [clave]);
    return filas.isEmpty ? null : jsonDecode(filas.first['valor'] as String);
  }

  Future<void> borrarMeta(String clave) async {
    final db = await _abrir();
    await db.delete('meta', where: 'clave = ?', whereArgs: [clave]);
  }

  Future<void> vaciar(String coleccion) async {
    final db = await _abrir();
    await db.delete('snapshot', where: 'coleccion = ?', whereArgs: [coleccion]);
  }

  Future<void> agregar(String coleccion, String campoClave, List<dynamic> items) async {
    final db = await _abrir();
    final lote = db.batch();
    for (final item in items) {
      lote.insert(
        'snapshot',
        {'coleccion': coleccion, 'clave': '${item[campoClave]}', 'valor': jsonEncode(item)},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await lote.commit(noResult: true);
  }

  Future<List<Map<String, dynamic>>> leer(String coleccion) async {
    final db = await _abrir();
    final filas = await db.query('snapshot', where: 'coleccion = ?', whereArgs: [coleccion]);
    return filas.map((f) => (jsonDecode(f['valor'] as String) as Map).cast<String, dynamic>()).toList();
  }

  Future<void> guardarOperacion(OperacionLocal op) async {
    final db = await _abrir();
    await db.insert(
      'operacion',
      {'uuid': op.uuidOperacion, 'fecha': op.fechaOperacion, 'valor': jsonEncode(op.toJson())},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Nunca se borran (RF15): cambian de estado.
  Future<List<OperacionLocal>> operaciones() async {
    final db = await _abrir();
    final filas = await db.query('operacion', orderBy: 'fecha DESC');
    return filas
        .map((f) => OperacionLocal.fromJson((jsonDecode(f['valor'] as String) as Map).cast<String, dynamic>()))
        .toList();
  }

  /// Solo cuando no queda nada sin entregar al servidor (CU12 alternativo 5).
  Future<void> limpiar() async {
    final db = await _abrir();
    await db.delete('snapshot');
    await db.delete('operacion');
    await db.delete('meta');
  }
}
