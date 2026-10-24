import '../config/api_config.dart';
import '../models/product_model.dart';
import 'api_client.dart';

/// Mapeo aproximado nombre-de-color -> hex: el backend NO tiene un campo
/// de color en hexadecimal, solo un nombre de texto libre (`color`). Esto
/// cubre los colores mas comunes del catalogo sembrado; cualquier color no
/// mapeado cae en un gris neutro. Es una aproximacion visual, no un dato
/// real del backend.
const Map<String, String> _colorHexAproximado = {
  // Los cuatro colores de la polera oversize y los dos del jean (mismos
  // tonos que las fotos del catalogo).
  'negro': '#1D1D20',
  'blanco': '#F4F3EF',
  'gris': '#9A9CA2',
  'guinda': '#6B1A2B',
  'azul': '#2a78d6',
  'rojo': '#e34948',
  'verde': '#1baf7a',
  'amarillo': '#eda100',
  'naranja': '#eb6834',
  'beige': '#DDD9D8',
  'arena': '#DDD9D8',
  'marron': '#695D43',
  'café': '#695D43',
};

/// `GET /api/products` real (Mobile Fase 1). Convierte cada `ProductoOut`
/// del backend al `Product` local que ya consumen las pantallas
/// existentes.
///
/// LIMITACION CONOCIDA, no un bug: el catalogo real es POR VARIANTE — cada
/// combinacion talla/color es su propia fila con su propio `idProducto`
/// (mismo modelo que usa la web). El `Product` local de esta app asume UN
/// producto con una LISTA de tallas seleccionable. Esta fase no reagrupa
/// variantes en una sola tarjeta con selector de talla (eso es trabajo de
/// `try_on_screen.dart`, fuera de esta fase) — cada variante real aparece
/// como su propia tarjeta, con `sizes` conteniendo un unico valor.
class ProductsService {
  final ApiClient _api;

  ProductsService(this._api);

  Future<List<Product>> getProducts({
    String? tipo,
    String? talla,
    String? color,
    String? q,
    int page = 1,
    int size = 20,
  }) async {
    final data = await _api.get(
      '/api/products',
      auth: false,
      query: {
        if (tipo != null) 'tipo': tipo,
        if (talla != null) 'talla': talla,
        if (color != null) 'color': color,
        if (q != null) 'q': q,
        'page': page,
        'size': size,
      },
    ) as Map<String, dynamic>;

    final items = (data['items'] as List).cast<Map<String, dynamic>>();
    return items.map(_fromApi).toList();
  }

  Product _fromApi(Map<String, dynamic> json) {
    final nombreColor = (json['color'] as String?)?.toLowerCase().trim();
    final colorHex = nombreColor != null ? (_colorHexAproximado[nombreColor] ?? '#9CA3AF') : '#9CA3AF';
    final talla = json['talla'] as String?;
    final imagen = json['imagen_url'] as String?;

    return Product(
      id: (json['idProducto'] as num).toString(),
      name: json['nombre'] as String,
      price: (json['venta'] as num).toDouble(),
      colorName: json['color'] as String? ?? '',
      colorHex: colorHex,
      category: json['tipo'] as String? ?? '',
      // El catalogo guarda rutas relativas de la web (/productos/...): se
      // completan con el dominio de Vercel. Sin imagen -> foto neutra (evita
      // romper CachedNetworkImage con un string vacio).
      imageUrl: ApiConfig.urlImagen(imagen),
      description: json['descripcion'] as String? ?? '',
      // El backend no tiene un campo equivalente a "details" (lista de
      // caracteristicas de venta tipo "100% Lana Virgen") — se deja vacio.
      details: const [],
      sizes: talla != null && talla.isNotEmpty ? [talla] : const [],
      // El listado de catalogo no trae stock (eso es un concepto de
      // Inventario, por sucursal, separado) — `true` aca es honesto sobre
      // "el producto existe en el catalogo", no una afirmacion de stock.
      inStock: true,
    );
  }
}
