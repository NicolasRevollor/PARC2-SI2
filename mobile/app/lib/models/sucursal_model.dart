/// Sucursal real del backend (`GET /api/inventory/locations`,
/// `backend/app/schemas/inventory.py::LocationOut`). Mobile Fase 3.
class Sucursal {
  final int codigoSucursal;
  final String nombre;
  final String direccion;
  final String ciudad;

  const Sucursal({
    required this.codigoSucursal,
    required this.nombre,
    required this.direccion,
    required this.ciudad,
  });

  factory Sucursal.fromJson(Map<String, dynamic> json) {
    return Sucursal(
      codigoSucursal: json['codigoSucursal'] as int,
      nombre: json['nombre'] as String? ?? '',
      direccion: json['direccion'] as String? ?? '',
      ciudad: json['ciudad'] as String? ?? '',
    );
  }
}
