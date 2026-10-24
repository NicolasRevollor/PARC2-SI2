// Antes este archivo era la plantilla del "contador" de `flutter create`:
// importaba `package:app/main.dart` y `MyApp`, que no existen en este paquete
// (`aether_fashion`, clase `AetherApp`), y `flutter test` no compilaba.
//
// Se prueban piezas puras (sin red ni Stripe) que la app usa al restaurar la
// sesion y al mostrar errores del backend.

import 'package:aether_fashion/config/api_config.dart';
import 'package:aether_fashion/services/api_client.dart';
import 'package:aether_fashion/services/auth_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('AuthUser se guarda y se restaura igual (sesion sin conexion)', () {
    final original = AuthUser(
      idUser: 7,
      nombre: 'Ana',
      correo: 'ana@mail.com',
      rol: 'Cliente',
      permisos: ['venta.crear', 'reserva.crear'],
    );

    final restaurado = AuthUser.fromJson(original.toJson());

    expect(restaurado.idUser, 7);
    expect(restaurado.correo, 'ana@mail.com');
    expect(restaurado.rol, 'Cliente');
    expect(restaurado.permisos, ['venta.crear', 'reserva.crear']);
  });

  test('las rutas relativas del catalogo se completan con la web de Vercel', () {
    expect(
      ApiConfig.urlImagen('/productos/polera-oversize-guinda.jpg'),
      'https://parc-2-si-2.vercel.app/productos/polera-oversize-guinda.jpg',
    );
    // Una foto subida a Supabase ya es absoluta: no se toca.
    expect(ApiConfig.urlImagen('https://x.supabase.co/a.png'), 'https://x.supabase.co/a.png');
    expect(ApiConfig.urlImagen(null), ApiConfig.imagenSinFoto);
    expect(ApiConfig.urlImagen(''), ApiConfig.imagenSinFoto);
  });

  test('el probador con camara usa el recorte transparente de la prenda', () {
    expect(
      ApiConfig.urlRecorte('https://parc-2-si-2.vercel.app/productos/jeans-negro.jpg'),
      'https://parc-2-si-2.vercel.app/productos/recorte/jeans-negro.png',
    );
    // Fotos propias o la imagen por defecto no tienen recorte.
    expect(ApiConfig.urlRecorte('https://x.supabase.co/a.jpg'), 'https://x.supabase.co/a.jpg');
    expect(ApiConfig.urlRecorte(ApiConfig.imagenSinFoto), ApiConfig.imagenSinFoto);
  });

  test('ApiException muestra el mensaje real del backend', () {
    final error = ApiException(423, 'Cuenta bloqueada temporalmente');

    expect(error.statusCode, 423);
    expect(error.toString(), 'Cuenta bloqueada temporalmente');
  });
}
