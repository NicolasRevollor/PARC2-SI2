/// Mobile Fase 6: mapea `ClienteFull` (`backend/app/schemas/fase2.py`),
/// servido por `GET/PUT /api/customers/me`. Autogestion del propio
/// Cliente — el backend lo deriva del JWT, nunca se manda `idCliente`
/// ni `idUser` desde el cliente HTTP.
class ClienteMe {
  final int idCliente;
  final String nombre;
  final String? telefono;
  final String? direccion;
  final int idUser;
  final String? correo;
  // Medidas biometricas (CU11 — determinar si una prenda le queda al
  // cliente), en cm. `null` = el cliente todavia no las cargo.
  final int? altura;
  final int? pecho;
  final int? cintura;
  final int? tiro;

  const ClienteMe({
    required this.idCliente,
    required this.nombre,
    this.telefono,
    this.direccion,
    required this.idUser,
    this.correo,
    this.altura,
    this.pecho,
    this.cintura,
    this.tiro,
  });

  factory ClienteMe.fromJson(Map<String, dynamic> json) {
    return ClienteMe(
      idCliente: json['idCliente'] as int,
      nombre: json['nombre'] as String,
      telefono: json['telefono'] as String?,
      direccion: json['direccion'] as String?,
      idUser: json['idUser'] as int,
      correo: json['correo'] as String?,
      altura: json['altura'] as int?,
      pecho: json['pecho'] as int?,
      cintura: json['cintura'] as int?,
      tiro: json['tiro'] as int?,
    );
  }
}
