import '../config/api_config.dart';

class Product {
  final String id;
  final String name;
  final double price;
  final String colorName;
  final String colorHex;
  final String category;
  final String imageUrl;
  final String description;
  final List<String> details;
  final List<String> sizes;
  final bool inStock;

  const Product({
    required this.id,
    required this.name,
    required this.price,
    required this.colorName,
    required this.colorHex,
    required this.category,
    required this.imageUrl,
    required this.description,
    required this.details,
    required this.sizes,
    this.inStock = true,
  });
}

class AvatarModel {
  final String id;
  final String name;
  final String height;
  final String imageUrl;

  const AvatarModel({
    required this.id,
    required this.name,
    required this.height,
    required this.imageUrl,
  });
}

class OutfitLook {
  final String id;
  final String title;
  final String subtitle;
  final String imageUrl;
  final List<String> items;
  final List<String> palette;

  const OutfitLook({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.imageUrl,
    required this.items,
    required this.palette,
  });
}

class ColorPaletteItem {
  final String name;
  final String hex;

  const ColorPaletteItem({required this.name, required this.hex});
}

class Measurements {
  final int height;
  final int chest;
  final int waist;
  final int inseam;

  const Measurements({
    required this.height,
    required this.chest,
    required this.waist,
    required this.inseam,
  });

  Measurements copyWith({int? height, int? chest, int? waist, int? inseam}) {
    return Measurements(
      height: height ?? this.height,
      chest: chest ?? this.chest,
      waist: waist ?? this.waist,
      inseam: inseam ?? this.inseam,
    );
  }
}

class UserProfile {
  final String name;
  final String email;
  final String avatarUrl;
  final Measurements measurements;
  final String styleInsights;
  final List<ColorPaletteItem> recommendedPalette;
  final List<String> preferredFit;
  final List<OutfitLook> savedOutfits;

  const UserProfile({
    required this.name,
    required this.email,
    required this.avatarUrl,
    required this.measurements,
    required this.styleInsights,
    required this.recommendedPalette,
    required this.preferredFit,
    required this.savedOutfits,
  });

  UserProfile copyWith({
    String? name,
    String? email,
    String? avatarUrl,
    Measurements? measurements,
    String? styleInsights,
    List<ColorPaletteItem>? recommendedPalette,
    List<String>? preferredFit,
    List<OutfitLook>? savedOutfits,
  }) {
    return UserProfile(
      name: name ?? this.name,
      email: email ?? this.email,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      measurements: measurements ?? this.measurements,
      styleInsights: styleInsights ?? this.styleInsights,
      recommendedPalette: recommendedPalette ?? this.recommendedPalette,
      preferredFit: preferredFit ?? this.preferredFit,
      savedOutfits: savedOutfits ?? this.savedOutfits,
    );
  }
}

const List<Product> dummyProducts = [
  Product(
    id: 'prod-1',
    name: 'Polera Oversize Blanca',
    price: 120.0,
    colorName: 'Blanco',
    colorHex: '#F4F3EF',
    category: 'Polera Oversize',
    imageUrl: '${ApiConfig.webBaseUrl}/productos/polera-oversize-blanca.jpg',
    description: 'Polera oversize unisex de hombro caído, cuerpo amplio y manga al codo. Cuello redondo acanalado.',
    details: ['100% algodón peinado', 'Jersey de 240 g/m²', 'Cuello acanalado 1x1', 'Hombro caído', 'Lavar a máquina en frío'],
    sizes: ['S', 'M', 'L', 'XL'],
  ),
  Product(
    id: 'prod-2',
    name: 'Polera Oversize Negra',
    price: 120.0,
    colorName: 'Negro',
    colorHex: '#1D1D20',
    category: 'Polera Oversize',
    imageUrl: '${ApiConfig.webBaseUrl}/productos/polera-oversize-negra.jpg',
    description: 'Polera oversize unisex de hombro caído, cuerpo amplio y manga al codo. Cuello redondo acanalado.',
    details: ['100% algodón peinado', 'Jersey de 240 g/m²', 'Cuello acanalado 1x1', 'Hombro caído', 'Lavar a máquina en frío'],
    sizes: ['S', 'M', 'L', 'XL'],
  ),
  Product(
    id: 'prod-3',
    name: 'Polera Oversize Guinda',
    price: 120.0,
    colorName: 'Guinda',
    colorHex: '#6B1A2B',
    category: 'Polera Oversize',
    imageUrl: '${ApiConfig.webBaseUrl}/productos/polera-oversize-guinda.jpg',
    description: 'Polera oversize unisex de hombro caído, cuerpo amplio y manga al codo. Cuello redondo acanalado.',
    details: ['100% algodón peinado', 'Jersey de 240 g/m²', 'Cuello acanalado 1x1', 'Hombro caído', 'Lavar a máquina en frío'],
    sizes: ['S', 'M', 'L', 'XL'],
  ),
  Product(
    id: 'prod-4',
    name: 'Polera Oversize Gris',
    price: 120.0,
    colorName: 'Gris',
    colorHex: '#9A9CA2',
    category: 'Polera Oversize',
    imageUrl: '${ApiConfig.webBaseUrl}/productos/polera-oversize-gris.jpg',
    description: 'Polera oversize unisex de hombro caído, cuerpo amplio y manga al codo. Cuello redondo acanalado.',
    details: ['100% algodón peinado', 'Jersey de 240 g/m²', 'Cuello acanalado 1x1', 'Hombro caído', 'Lavar a máquina en frío'],
    sizes: ['S', 'M', 'L', 'XL'],
  ),
  Product(
    id: 'prod-5',
    name: 'Jeans Negro',
    price: 260.0,
    colorName: 'Negro',
    colorHex: '#2A2A2F',
    category: 'Jeans',
    imageUrl: '${ApiConfig.webBaseUrl}/productos/jeans-negro.jpg',
    description: 'Jean unisex de tiro medio y pierna recta. Combina con cualquier polera oversize.',
    details: ['Denim de 13 oz', '98% algodón, 2% elastano', 'Cinco bolsillos', 'Cierre con bragueta y botón metálico'],
    sizes: ['28', '30', '32', '34', '36'],
  ),
  Product(
    id: 'prod-6',
    name: 'Jeans Blanco',
    price: 260.0,
    colorName: 'Blanco',
    colorHex: '#F1EFE9',
    category: 'Jeans',
    imageUrl: '${ApiConfig.webBaseUrl}/productos/jeans-blanco.jpg',
    description: 'Jean unisex de tiro medio y pierna recta. Combina con cualquier polera oversize.',
    details: ['Denim de 13 oz', '98% algodón, 2% elastano', 'Cinco bolsillos', 'Cierre con bragueta y botón metálico'],
    sizes: ['28', '30', '32', '34', '36'],
  ),
];

// Avatares del probador: cada uno muestra un look completo (polera + jean)
// de la coleccion. Antes eran fotos de modelos con blazer y saco.
const List<AvatarModel> dummyAvatars = [
  AvatarModel(
    id: 'm1',
    name: 'Look Blanco 01',
    height: '182cm',
    imageUrl: '${ApiConfig.webBaseUrl}/landing/look-blanca-negro.jpg',
  ),
  AvatarModel(
    id: 'm2',
    name: 'Look Gris 02',
    height: '175cm',
    imageUrl: '${ApiConfig.webBaseUrl}/landing/look-gris-blanco.jpg',
  ),
  AvatarModel(
    id: 'm3',
    name: 'Look Negro 03',
    height: '188cm',
    imageUrl: '${ApiConfig.webBaseUrl}/landing/look-negra-negro.jpg',
  ),
];

const List<OutfitLook> dummySavedOutfits = [
  OutfitLook(
    id: 'look-1',
    title: 'LOOK 01 - CONTRASTE',
    subtitle: 'Polera Oversize Blanca, Jeans Negro',
    imageUrl: '${ApiConfig.webBaseUrl}/landing/look-blanca-negro.jpg',
    items: ['Polera Oversize Blanca', 'Jeans Negro'],
    palette: ['#F4F3EF', '#2A2A2F', '#1D1D20'],
  ),
  OutfitLook(
    id: 'look-2',
    title: 'LOOK 02 - ESENCIALES',
    subtitle: 'Polera Oversize Gris, Jeans Blanco',
    imageUrl: '${ApiConfig.webBaseUrl}/landing/look-gris-blanco.jpg',
    items: ['Polera Oversize Gris', 'Jeans Blanco'],
    palette: ['#9A9CA2', '#F1EFE9', '#1D1D20'],
  ),
];

const UserProfile dummyUserProfile = UserProfile(
  name: 'Jane Doe',
  email: 'jane@example.com',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  measurements: Measurements(height: 182, chest: 98, waist: 81, inseam: 86),
  styleInsights: 'Basado en tus pruebas virtuales y looks guardados, nuestra IA sugiere poleras oversize en tonos neutros (blanco y gris) combinadas con jean negro de pierna recta.',
  recommendedPalette: [
    ColorPaletteItem(name: 'Negro', hex: '#1D1D20'),
    ColorPaletteItem(name: 'Blanco', hex: '#F4F3EF'),
    ColorPaletteItem(name: 'Guinda', hex: '#6B1A2B'),
    ColorPaletteItem(name: 'Gris', hex: '#9A9CA2'),
  ],
  preferredFit: ['Oversize', 'Pierna recta'],
  savedOutfits: dummySavedOutfits,
);
