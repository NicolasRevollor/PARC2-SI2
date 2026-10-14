/// Configuracion de la URL base del backend (Mobile Fase 1).
///
/// IMPORTANTE (Android, unico target de esta app): un emulador Android NO
/// puede usar `localhost`/`127.0.0.1` para llegar a la maquina host que
/// corre el backend — `localhost` dentro del emulador apunta al propio
/// emulador. `10.0.2.2` es el alias especial que el emulador de Android
/// resuelve hacia el host. Si en cambio se prueba en un DISPOSITIVO FISICO
/// conectado a la misma red que la maquina del backend, hay que reemplazar
/// esto por la IP LAN de esa maquina (ej. `http://192.168.1.50:8000`),
/// nunca `localhost` ni `10.0.2.2` (esos solo tienen sentido en el
/// emulador).
class ApiConfig {
  // Apunta al backend en produccion (Render) — el APK distribuible se
  // conecta a esta URL desde cualquier red, no solo la LAN local.
  //
  // Para volver a probar contra el backend local durante desarrollo:
  //   - Emulador Android: 'http://10.0.2.2:8000'
  //   - Dispositivo fisico en la misma WiFi que la maquina del backend:
  //     la IP LAN de esa maquina (ej. 'http://192.168.1.50:8000',
  //     verificar con `ip -4 addr show` si cambia de red).
  static const String baseUrl = 'https://primparcsi2.onrender.com';

  // Claves de flutter_secure_storage. Compartidas entre ApiClient (lee el
  // token para el header Authorization) y AuthService (lo escribe/borra) —
  // viven aca, no en ninguno de los dos servicios, para que ApiClient no
  // tenga que depender de AuthService (evita un ciclo de dependencias).
  static const String tokenStorageKey = 'youshop_access_token';
  static const String refreshTokenStorageKey = 'youshop_refresh_token';
  static const String userStorageKey = 'youshop_user';

  // Mobile Fase 2 (checkout): misma clave de TEST (publishable, no
  // secreta) que ya usan `web/.env` y `backend/.env` — segura de embeber
  // en la app igual que en la web.
  static const String stripePublishableKey =
      'pk_test_51TgzB6CY05m6u9g0zbKDhfoWgScewf5szVvdwX1im5zEZLZgG5KMkd2RoCOsGpMkyRWJ0kKX4MtTXXbmCxWxIAUX00BlBgWTrJ';
}
