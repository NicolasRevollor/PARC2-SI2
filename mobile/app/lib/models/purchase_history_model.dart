/// Mobile Fase 5: mapea `PurchaseHistoryItem`
/// (`backend/app/schemas/fase2.py`, servido por
/// `GET /api/purchase-history`). Cada fila es un ITEM DE LINEA, no una
/// venta completa: varias filas comparten el mismo `idVenta`/`fecha`/
/// `total` cuando una compra tuvo varios productos — `total` es el total
/// DE LA VENTA (repetido en cada fila), no el subtotal de esa linea. El
/// subtotal de linea es `cantidad * precioUnitario`, calculado aparte.
/// `fecha` se deja como `String` (mismo criterio que `ReservationsService`/
/// `MyReservationsScreen` con datos crudos del backend) — se parsea a
/// `DateTime` solo al momento de mostrarla, con `DateTime.tryParse`, mismo
/// patron que ya uso `cart_modal.dart` (Fase 2) para el fecha de la Venta
/// confirmada.
class PurchaseHistoryItem {
  final int idVenta;
  final String fecha;
  final double total;
  final int idProducto;
  final String? productoNombre;
  final int cantidad;
  final double precioUnitario;
  final int? codigoHistorial;

  const PurchaseHistoryItem({
    required this.idVenta,
    required this.fecha,
    required this.total,
    required this.idProducto,
    this.productoNombre,
    required this.cantidad,
    required this.precioUnitario,
    this.codigoHistorial,
  });

  /// Subtotal de ESTA linea (`cantidad * precioUnitario`) — distinto del
  /// `total` de la venta completa, que se repite en cada fila del grupo.
  double get subtotalLinea => cantidad * precioUnitario;

  factory PurchaseHistoryItem.fromJson(Map<String, dynamic> json) {
    return PurchaseHistoryItem(
      idVenta: json['idVenta'] as int,
      fecha: json['fecha'] as String,
      total: (json['total'] as num).toDouble(),
      idProducto: json['idProducto'] as int,
      productoNombre: json['producto_nombre'] as String?,
      cantidad: json['cantidad'] as int,
      precioUnitario: (json['precio_unitario'] as num).toDouble(),
      codigoHistorial: json['codigoHistorial'] as int?,
    );
  }
}
