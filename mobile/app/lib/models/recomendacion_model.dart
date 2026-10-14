/// Mobile Fase 4: mapea `RecomendacionOut` (`backend/app/schemas/fase2.py`).
/// `idProducto`/`productoNombre` son null solo en filas viejas creadas a
/// mano por staff antes de CU22 — las generadas por IA siempre los tienen.
class Recomendacion {
  final int idRecomendacion;
  final String nombre;
  final String importancia;
  final int? idProducto;
  final String? productoNombre;

  const Recomendacion({
    required this.idRecomendacion,
    required this.nombre,
    required this.importancia,
    this.idProducto,
    this.productoNombre,
  });

  factory Recomendacion.fromJson(Map<String, dynamic> json) {
    return Recomendacion(
      idRecomendacion: json['idRecomendacion'] as int,
      nombre: json['nombre'] as String,
      importancia: json['importancia'] as String? ?? 'Media',
      idProducto: json['idProducto'] as int?,
      productoNombre: json['producto_nombre'] as String?,
    );
  }
}
