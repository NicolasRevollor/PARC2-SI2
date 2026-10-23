import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';

/// Excepcion tipada que lleva el mensaje REAL que devolvio el backend
/// (`{"detail": "..."}`) — nunca un texto generico "algo salio mal",
/// mismo criterio que uso la web toda la sesion con `err.error?.detail`.
class ApiException implements Exception {
  final int statusCode;
  final String message;

  ApiException(this.statusCode, this.message);

  @override
  String toString() => message;
}

/// Wrapper HTTP delgado: base URL, header Authorization automatico si hay
/// un token guardado, decodificacion JSON, y extraccion del mensaje real
/// de error del backend en cualquier respuesta no-2xx.
class ApiClient {
  static const _storage = FlutterSecureStorage();

  Future<Map<String, String>> _headers({bool auth = true}) async {
    final headers = {'Content-Type': 'application/json'};
    if (auth) {
      final token = await _storage.read(key: ApiConfig.tokenStorageKey);
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }
    return headers;
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final cleanQuery = query == null
        ? null
        : (query.map((k, v) => MapEntry(k, v.toString()))
          ..removeWhere((k, v) => v == 'null'));
    return Uri.parse('${ApiConfig.baseUrl}$path').replace(
      queryParameters: cleanQuery != null && cleanQuery.isNotEmpty ? cleanQuery : null,
    );
  }

  dynamic _decode(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return null;
      return jsonDecode(utf8.decode(response.bodyBytes));
    }

    String message = 'Error del servidor (${response.statusCode}).';
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      if (body is Map && body['detail'] is String) {
        message = body['detail'] as String;
      }
    } catch (_) {
      // Respuesta no-JSON en un error: se mantiene el mensaje generico de
      // arriba en vez de propagar un fallo de parseo.
    }
    throw ApiException(response.statusCode, message);
  }

  // Una sola renovacion a la vez aunque fallen varias llamadas juntas.
  static Future<bool>? _renovacionEnCurso;

  /// Canjea el refresh token guardado por un access token nuevo. El access
  /// token dura 30 min: antes el refresh token se guardaba pero nunca se
  /// usaba, y a la media hora todo daba 401 (y al reabrir la app se cerraba
  /// la sesion).
  Future<bool> _renovarSesion() {
    return _renovacionEnCurso ??= () async {
      try {
        final refreshToken = await _storage.read(key: ApiConfig.refreshTokenStorageKey);
        if (refreshToken == null || refreshToken.isEmpty) return false;
        final response = await http.post(
          _uri('/api/auth/refresh'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'refresh_token': refreshToken}),
        );
        if (response.statusCode < 200 || response.statusCode >= 300) return false;
        final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
        await _storage.write(key: ApiConfig.tokenStorageKey, value: data['access_token'] as String);
        await _storage.write(key: ApiConfig.refreshTokenStorageKey, value: data['refresh_token'] as String);
        await _storage.write(key: ApiConfig.userStorageKey, value: jsonEncode(data['user']));
        return true;
      } catch (_) {
        return false;
      } finally {
        _renovacionEnCurso = null;
      }
    }();
  }

  /// Ejecuta la llamada y, si el backend responde 401 con una sesion
  /// autenticada, renueva el token y la reintenta UNA vez.
  Future<dynamic> _enviar(
    Future<http.Response> Function(Map<String, String> headers) llamada, {
    required bool auth,
  }) async {
    var response = await llamada(await _headers(auth: auth));
    if (auth && response.statusCode == 401 && await _renovarSesion()) {
      response = await llamada(await _headers(auth: auth));
    }
    return _decode(response);
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query, bool auth = true}) {
    return _enviar((headers) => http.get(_uri(path, query), headers: headers), auth: auth);
  }

  Future<dynamic> post(String path, {Object? body, bool auth = true}) {
    return _enviar(
      (headers) => http.post(
        _uri(path),
        headers: headers,
        body: body == null ? null : jsonEncode(body),
      ),
      auth: auth,
    );
  }

  Future<dynamic> patch(String path, {Object? body, bool auth = true}) {
    return _enviar(
      (headers) => http.patch(
        _uri(path),
        headers: headers,
        body: body == null ? null : jsonEncode(body),
      ),
      auth: auth,
    );
  }

  Future<dynamic> put(String path, {Object? body, bool auth = true}) {
    return _enviar(
      (headers) => http.put(
        _uri(path),
        headers: headers,
        body: body == null ? null : jsonEncode(body),
      ),
      auth: auth,
    );
  }
}
