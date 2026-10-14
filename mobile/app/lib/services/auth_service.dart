import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/api_config.dart';
import 'api_client.dart';

/// Usuario autenticado — mapea 1:1 el `UserSummary` que devuelve el
/// backend (`backend/app/schemas/auth.py`).
class AuthUser {
  final int idUser;
  final String nombre;
  final String correo;
  final String rol;
  final List<String> permisos;

  AuthUser({
    required this.idUser,
    required this.nombre,
    required this.correo,
    required this.rol,
    required this.permisos,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        idUser: json['idUser'] as int,
        nombre: json['nombre'] as String,
        correo: json['correo'] as String,
        rol: json['rol'] as String,
        permisos: (json['permisos'] as List).map((p) => p.toString()).toList(),
      );

  Map<String, dynamic> toJson() => {
        'idUser': idUser,
        'nombre': nombre,
        'correo': correo,
        'rol': rol,
        'permisos': permisos,
      };
}

/// Login/registro reales contra `/api/auth/*` (Mobile Fase 1). El token JWT
/// se guarda en `flutter_secure_storage` (Android Keystore) — sobrevive a
/// un restart de la app.
class AuthService {
  final ApiClient _api;
  static const _storage = FlutterSecureStorage();

  AuthService(this._api);

  Future<void> _guardarSesion(Map<String, dynamic> tokenResponse) async {
    await _storage.write(key: ApiConfig.tokenStorageKey, value: tokenResponse['access_token'] as String);
    await _storage.write(key: ApiConfig.refreshTokenStorageKey, value: tokenResponse['refresh_token'] as String);
    await _storage.write(key: ApiConfig.userStorageKey, value: jsonEncode(tokenResponse['user']));
  }

  /// Lanza [ApiException] con el mensaje REAL del backend en caso de
  /// fallo (incluye los mensajes de bloqueo progresivo, HTTP 423, y el
  /// "te quedan N intentos" de un 401) — el caller debe mostrar
  /// `e.message` tal cual, nunca reemplazarlo por un texto generico.
  Future<AuthUser> login(String email, String password) async {
    final data = await _api.post(
      '/api/auth/login',
      auth: false,
      body: {'email': email, 'password': password},
    ) as Map<String, dynamic>;
    await _guardarSesion(data);
    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// Misma regla de fortaleza de contraseña que el resto del proyecto
  /// (min 10 caracteres, 1 minuscula, 1 mayuscula, 1 numero, 1 especial) —
  /// validada tambien del lado servidor
  /// (`backend/app/security.py::validate_password_strength`); el registro
  /// deja al usuario logueado de una, igual que login.
  Future<AuthUser> register(String nombre, String email, String password) async {
    final data = await _api.post(
      '/api/auth/register',
      auth: false,
      body: {'nombre': nombre, 'email': email, 'password': password},
    ) as Map<String, dynamic>;
    await _guardarSesion(data);
    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    await _storage.delete(key: ApiConfig.tokenStorageKey);
    await _storage.delete(key: ApiConfig.refreshTokenStorageKey);
    await _storage.delete(key: ApiConfig.userStorageKey);
  }

  /// Se llama al arrancar la app. Si hay un token guardado, lo valida de
  /// verdad contra `GET /api/auth/me` (en vez de confiar ciegamente en que
  /// sigue vigente) — si el backend lo rechaza (expirado, revocado), la
  /// sesion local se limpia y se trata como "no autenticado", nunca se
  /// deja a la app en un estado a medias.
  Future<AuthUser?> tryRestoreSession() async {
    final token = await _storage.read(key: ApiConfig.tokenStorageKey);
    if (token == null || token.isEmpty) return null;

    try {
      final data = await _api.get('/api/auth/me') as Map<String, dynamic>;
      // `/me` devuelve el mismo shape que `UserSummary`
      // (idUser/nombre/correo/rol/permisos) — se re-guarda por si cambio
      // algo (ej. permisos) desde el ultimo login.
      await _storage.write(key: ApiConfig.userStorageKey, value: jsonEncode(data));
      return AuthUser.fromJson(data);
    } catch (_) {
      await logout();
      return null;
    }
  }
}
