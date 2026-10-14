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

  Future<dynamic> get(String path, {Map<String, dynamic>? query, bool auth = true}) async {
    final response = await http.get(_uri(path, query), headers: await _headers(auth: auth));
    return _decode(response);
  }

  Future<dynamic> post(String path, {Object? body, bool auth = true}) async {
    final response = await http.post(
      _uri(path),
      headers: await _headers(auth: auth),
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(response);
  }

  Future<dynamic> patch(String path, {Object? body, bool auth = true}) async {
    final response = await http.patch(
      _uri(path),
      headers: await _headers(auth: auth),
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(response);
  }

  Future<dynamic> put(String path, {Object? body, bool auth = true}) async {
    final response = await http.put(
      _uri(path),
      headers: await _headers(auth: auth),
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(response);
  }
}
