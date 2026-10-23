// Antes este archivo era la plantilla del "contador" de `flutter create`:
// importaba `package:app/main.dart` y `MyApp`, que no existen en este paquete
// (`aether_fashion`, clase `AetherApp`), y `flutter test` no compilaba.
//
// Se prueban piezas puras (sin red ni Stripe) que la app usa al restaurar la
// sesion y al mostrar errores del backend.

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

  test('ApiException muestra el mensaje real del backend', () {
    final error = ApiException(423, 'Cuenta bloqueada temporalmente');

    expect(error.statusCode, 423);
    expect(error.toString(), 'Cuenta bloqueada temporalmente');
  });
}
