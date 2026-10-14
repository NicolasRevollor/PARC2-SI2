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
    name: 'Blazer de Lana Oversized',
    price: 450.0,
    colorName: 'Carbón',
    colorHex: '#2C2A26',
    category: 'Oversized',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAS3Pgr-0HgR4Y0c4vqpLSMDp_dsZDI731uVLYgd1CdUge1VDz-M8HK6l6G9T33kVjLXo4sWDNh7mtpECNpkpTXXBQ3EqIdPAk3CJHSqnIBJaNn-2cnXgZWUaKQTZjaC4VUkoYzOGZi1S7Xx1ip8ukqbqcnwR607-p6Q1v57oJxhCSlkKlK_ZF-IB0MEXjJqeVbYI1AuCUG8qynAJpvtY6spCP32IjzrkuWCo1L4cejXujb7-q3K9O4Fg',
    description: 'Blazer unisex minimalista de doble pecho tejido en lana virgen. Hombros caídos arquitectónicos y estructura relajada.',
    details: ['100% Lana Virgen', 'Forro de Cupro', 'Botones de Cuerno', 'Solo tintorería', 'Confeccionado éticamente en Italia'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
  ),
  Product(
    id: 'prod-2',
    name: 'Pantalones de Lino de Pierna Ancha',
    price: 280.0,
    colorName: 'Arena',
    colorHex: '#DDD9D8',
    category: 'Oversized',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCziKS78n1d7bPmrvqAPnwQ_YYBESPFSrpM5a-CdZH2eMhKfk70f55xwdMlR-sdE78gRCHIeS1pFj1WKT3mCLwNApl65v6gY53JbfnvWDyNrGfCfCCn8sSivIljn_GnrOcHHSqKo5cUpFGD4mIL1pNabyBLl4PVl0wEKrZuVScfrccp_XjSMWpMd_3v1JxymyPgPnraAkEhEaWs6xMjzBLgy55WJHZlCydXy_qmduBlhbcJ-d7hfR7Jdw',
    description: 'Pantalones claros de tiro alto con pliegues delanteros profundos y piernas anchas fluidas confeccionados en lino orgánico de Normandía.',
    details: ['100% Lino Orgánico', 'Cierre con gancho oculto', 'Bolsillos laterales profundos', 'Preclavado para suavidad al tacto'],
    sizes: ['28', '30', '32', '34', '36'],
  ),
  Product(
    id: 'prod-3',
    name: 'Camisa de Popelin Estructural',
    price: 195.0,
    colorName: 'Blanco Óptico',
    colorHex: '#FFFFFF',
    category: 'Regular',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBLoHn_VVYXbjQVVL6EQsQg3BZthf3SyhAlEz6MjsG6-xJi_kf_RrmLbEb8fHhZVaDIJEDPvjhjeOw8TYLN89nX2qXAqoGvH3KtiSe3yXrEvgqHF0fOkWIC9OEe4e-b6nlpvs1McWDOm7IwJZ88ifgODZVEv63IpQbwTVZiP7PWZqO0bGgEn11SJmaTwfyrxp-KB0jtgHabiB6GwujpTkjVT_BdmI7xwpe2nRx2_AUFujVo9xFAwfbsOQ',
    description: 'Camisa de popelín de algodón de alta densidad con plegado geométrico arquitectónico, cuello limpio y cuello oculto.',
    details: ['100% Popelín de Algodón Giza', 'Botones de Madreperla', 'Costuras reforzadas', 'Fabricada en Portugal'],
    sizes: ['S', 'M', 'L', 'XL'],
  ),
  Product(
    id: 'prod-4',
    name: 'Abrigo Impermeable Volumétrico',
    price: 620.0,
    colorName: 'Topo',
    colorHex: '#A88D6D',
    category: 'Abrigos',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAo6aSAMiLjGR6AThLG6TY56gqfRtEkLKK9c3iZFnD6ty3dvwxoVeI0KClyHsfkzpuMYiCl-mvAzhXIw3-ywvPRpllarVhAgWgOHpVwrZBtu8-5B88SAOg64fKMeuv5ngwYx6L7vM3NZKp9eTip_vE2jSGHL8_7QkAdFug926R6RAdrGzCHtMcPw0RIuiN85Ar5c2vvXXWZimGqchi3gfsylj_Nt0Wd5TqQ9s9wVLfgXauPCM1PGPFFTg',
    description: 'Silueta envolvente generosa con solapa de tormenta, cinturón de cintura y cuello de tormenta en gabardina de algodón denso resistente al agua.',
    details: ['100% Algodón Impermeable', 'Tiras de puño ajustables', 'Broche de cuello de tormenta', 'Bolsillos acolchados'],
    sizes: ['XS/S', 'M/L', 'L/XL'],
  ),
  Product(
    id: 'prod-5',
    name: 'Pantalones de Lana Ajustados',
    price: 310.0,
    colorName: 'Negro',
    colorHex: '#171612',
    category: 'Sastrería',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB6W11YiP56I1uuhXZvv_zg_E2uEbJGKZnL01Z6PKAcAHhH_d6DsvpKJ5ynFCJFxkKq8FmDEaiNmOG0D6jDWp5v-wvDBSx9OEwOWM1hItMMjuAgMoUHeM9y8N_Kte-Pp32h73DXAUZI-sIQkBtoJv3kHwvDCsotnI2Td2rPvEXB0lF-r3Q3QV4lq_rRPOOjtqwUzq3P2PDE2nG_Afmm2cmqocX6lXdT8iR_qZzWi5iZpaKuEjLwIdkyDg',
    description: 'Pantalones limpios y ajustados con pliegues centrales definidos y una caída impecable sobre el calzado.',
    details: ['Lana Italiana Super 120s', 'Ajustadores de cintura', 'Puntos sin doblar para sastrería personalizada', 'Tintorería'],
    sizes: ['29', '31', '33', '35'],
  ),
  Product(
    id: 'prod-6',
    name: 'Sobrecamisa de Lino',
    price: 210.0,
    colorName: 'Salvia',
    colorHex: '#8C9A86',
    category: 'Regular',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAsOfC-2PviiBs6YyprrBSv5R9OpANASyE21GI8SYLDMNn1kNij9Yibdgn3EEZgwkENO_tpaT9zpE775O5AMtcJmTKwohViMhTj3CJRWXBwuIoiUB2smTvJAnCbG4cWVuS3Ubp_UzxRG40n6ILJtPnuMAd_mrzmWAe9QLt0Z25xdkYteyF0QCRTfT5R7X7ZeeZdgld-gMWPMm7Z4cgDA6PgYhc3oYHWV_T2IHxQvA0dhj7PopNczzEWCg',
    description: 'Camisa de lino teñida en pieza, relajada, diseñada para usarse abierta como capa ligera o abotonada como sastrería independiente.',
    details: ['100% Lino Belga', 'Teñida en pieza', 'Bolsillo parche en pecho', 'Ribete curvo'],
    sizes: ['S', 'M', 'L', 'XL'],
  ),
];

const List<AvatarModel> dummyAvatars = [
  AvatarModel(
    id: 'm1',
    name: 'Andrógino 01',
    height: '182cm',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDWVEjDuUQ_X1l6JvlGJvjXr68r55cZvMqHoC2dCPjlzv-t0nbhrhq4Qt_M_rHaKnhnkmFT9VkhJw7xmdGauzKUYocKh5oT8KKBmmKVpNPtmgqEAlTXR8sVFtg1gPM6FDbsWDApruzAx205g6Z7njnP5tC_1lM3Jy_74UDWgFyxNjMIdyZ6nN-Hvr22utV3vMdZESNVnP_ZSU4cLhu9Ca4obAm09F1M04b9BiLkQp8f03j57smqHSsmVg',
  ),
  AvatarModel(
    id: 'm2',
    name: 'Arquitectónico 02',
    height: '175cm',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAS3Pgr-0HgR4Y0c4vqpLSMDp_dsZDI731uVLYgd1CdUge1VDz-M8HK6l6G9T33kVjLXo4sWDNh7mtpECNpkpTXXBQ3EqIdPAk3CJHSqnIBJaNn-2cnXgZWUaKQTZjaC4VUkoYzOGZi1S7Xx1ip8ukqbqcnwR607-p6Q1v57oJxhCSlkKlK_ZF-IB0MEXjJqeVbYI1AuCUG8qynAJpvtY6spCP32IjzrkuWCo1L4cejXujb7-q3K9O4Fg',
  ),
  AvatarModel(
    id: 'm3',
    name: 'Minimalista 03',
    height: '188cm',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAo6aSAMiLjGR6AThLG6TY56gqfRtEkLKK9c3iZFnD6ty3dvwxoVeI0KClyHsfkzpuMYiCl-mvAzhXIw3-ywvPRpllarVhAgWgOHpVwrZBtu8-5B88SAOg64fKMeuv5ngwYx6L7vM3NZKp9eTip_vE2jSGHL8_7QkAdFug926R6RAdrGzCHtMcPw0RIuiN85Ar5c2vvXXWZimGqchi3gfsylj_Nt0Wd5TqQ9s9wVLfgXauPCM1PGPFFTg',
  ),
];

const List<OutfitLook> dummySavedOutfits = [
  OutfitLook(
    id: 'look-1',
    title: 'LOOK 01 - EDICIÓN OTOÑO',
    subtitle: 'Abrigo Estructurado, Pantalones de Pierna Ancha',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDpwv2ewSgkTgqPcisvYqM-iYU508P7vgIVc_gQb4r5Aehncy1jJN921ptd_68QPT133K09xGIbpb6lu8RxZkHm4dRJz6O5J3iSVtOBcw7aMtx7gF-DY6u9penKEJAwJarg0AYZho69FSKKnkNPbKu_03m6l7plWRWPFZ-TdDHmr231o-_pX0Fq7-9SBZUhnQkQ2x6DwiVP86YeRo4kuPgK5x6u97CtmLn3ec2vBROQ-gA_Qd9g_s5QLw',
    items: ['Volume Trench Coat', 'Wide-Leg Linen Trousers'],
    palette: ['#171612', '#FFFFFF', '#DDD9D8'],
  ),
  OutfitLook(
    id: 'look-2',
    title: 'LOOK 02 - ESENCIALES',
    subtitle: 'Suéter de Punto Drapeado, Pantalones Ajustados',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCzMJ0FByOp53QqtoUEZTdUN18N_lMYuyd56oTogYXLplZN3ZIdv44_ZA3ErLGDB0IjpXiSc-kzc9fBSSG9qdgfNV_EKOurALSqM4Rhb3Ghcam6MmAG-S4DXQHDjbbH2ibAw3f0SvE9Dtoe4kMDjXRmImarI4MyqwB07ZLh-PThpWIHagCT34qZBeb8DNQDXAPZNTWiFMhz_1qZLn9kcuw1fNZaJZji9ds0ALeBWoaswQ0P7WRNLFssQw',
    items: ['Linen Overshirt', 'Tailored Wool Trousers'],
    palette: ['#DDD9D8', '#695D43', '#171612'],
  ),
];

const UserProfile dummyUserProfile = UserProfile(
  name: 'Jane Doe',
  email: 'jane@example.com',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  measurements: Measurements(height: 182, chest: 98, waist: 81, inseam: 86),
  styleInsights: 'Basado en tus recientes pruebas virtuales y colecciones guardadas, nuestra IA sugiere que tiendes hacia siluetas arquitectónicas minimalistas con preferencia por tonos neutros de alto contraste.',
  recommendedPalette: [
    ColorPaletteItem(name: 'Negro Carbón', hex: '#171612'),
    ColorPaletteItem(name: 'Blanco Puro', hex: '#FFFFFF'),
    ColorPaletteItem(name: 'Arena Cálida', hex: '#FDF8F7'),
    ColorPaletteItem(name: 'Oliva Bronce', hex: '#695D43'),
  ],
  preferredFit: ['Sastrería Relajada', 'Drapeado'],
  savedOutfits: dummySavedOutfits,
);
