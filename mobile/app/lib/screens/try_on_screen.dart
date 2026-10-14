import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../theme/aether_theme.dart';
import '../providers/app_state.dart';
import '../models/product_model.dart';
import '../services/api_client.dart';
import '../services/customer_service.dart';
import '../services/size_chart.dart';
import 'ar_try_on_screen.dart';
import 'reservation_form_screen.dart';

class TryOnScreen extends StatelessWidget {
  const TryOnScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final product = appState.selectedTryOnProduct;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.auto_awesome, size: 16, color: AetherTheme.bronze),
              const SizedBox(width: 6),
              Text(
                'AI NEURAL FITTING ENGINE',
                style: GoogleFonts.outfit(fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1.8, color: AetherTheme.bronze),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Virtual Try-On',
            style: GoogleFonts.outfit(fontSize: 22, fontWeight: FontWeight.w500, color: AetherTheme.charcoalDark),
          ),
          Text(
            'Simulación biomecánica de caída y drapeado en tiempo real.',
            style: GoogleFonts.sourceSerif4(fontSize: 12, color: const Color(0xFF4A463F)),
          ),
          const SizedBox(height: 12),

          // 1. Mirror Canvas 3:4 — foto estatica (default) o camara RA real (CU11)
          _MirrorCanvas(
            product: product,
            isSimulatingTryOn: appState.isSimulatingTryOn,
            selectedSize: appState.selectedSize,
          ),

          const SizedBox(height: 14),

          // 2. Avatar Presets Carousel
          Text('AVATAR 3D / MODELO', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: const Color(0xFF7B776E))),
          const SizedBox(height: 8),
          SizedBox(
            height: 46,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: dummyAvatars.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final avatar = dummyAvatars[index];
                final isSelected = appState.selectedAvatar.id == avatar.id;
                return InkWell(
                  onTap: () => appState.selectAvatar(avatar),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: isSelected ? Colors.white : Colors.white.withOpacity(0.4),
                      border: Border.all(color: isSelected ? AetherTheme.charcoalDark : const Color(0xFFCCC6BC)),
                      borderRadius: BorderRadius.circular(2),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 14,
                          backgroundImage: NetworkImage(avatar.imageUrl),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(avatar.name, style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.w600)),
                            Text(avatar.height, style: GoogleFonts.sourceSerif4(fontSize: 9, color: const Color(0xFF7B776E))),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 14),

          // 3. Catalog Horizontal Strip
          Text('ELEGIR PRENDA DEL CATÁLOGO', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: const Color(0xFF7B776E))),
          const SizedBox(height: 8),
          SizedBox(
            height: 110,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: appState.products.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final p = appState.products[index];
                final isSelected = p.id == product.id;
                return InkWell(
                  onTap: () => appState.selectTryOnProduct(p),
                  child: Container(
                    width: 85,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: isSelected ? Colors.white : Colors.white.withOpacity(0.4),
                      border: Border.all(color: isSelected ? AetherTheme.charcoalDark : const Color(0xFFCCC6BC), width: isSelected ? 1.5 : 1),
                      borderRadius: BorderRadius.circular(2),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: CachedNetworkImage(
                            imageUrl: p.imageUrl,
                            fit: BoxFit.cover,
                            width: double.infinity,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.outfit(fontSize: 9)),
                        Text('\$${p.price.toInt()}', style: GoogleFonts.sourceSerif4(fontSize: 9, color: const Color(0xFF7B776E))),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 14),

          // 4. Fit Mode
          Text('SILUETA Y CAÍDA (FIT)', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: const Color(0xFF7B776E))),
          const SizedBox(height: 8),
          Row(
              children: ['Relajado', 'Talla Real', 'Oversized'].map((mode) {
              final isSel = appState.fitMode == mode;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2.0),
                  child: InkWell(
                    onTap: () => appState.setFitMode(mode),
                    child: Container(
                      height: 38,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: isSel ? AetherTheme.charcoalDark : Colors.white.withOpacity(0.6),
                        border: Border.all(color: isSel ? AetherTheme.charcoalDark : const Color(0xFFCCC6BC)),
                        borderRadius: BorderRadius.circular(2),
                      ),
                      child: Text(
                        mode,
                        style: GoogleFonts.outfit(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: isSel ? AetherTheme.sandLight : AetherTheme.charcoalDark,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 14),

          // 5. Size Selection
          Text('TALLAS DISPONIBLES', style: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: const Color(0xFF7B776E))),
          const SizedBox(height: 8),
          Row(
            children: product.sizes.map((sz) {
              final isSel = appState.selectedSize == sz;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2.0),
                  child: InkWell(
                    onTap: () => appState.setSelectedSize(sz),
                    child: Container(
                      height: 38,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: isSel ? AetherTheme.charcoalDark : Colors.white.withOpacity(0.6),
                        border: Border.all(color: isSel ? AetherTheme.charcoalDark : const Color(0xFFCCC6BC)),
                        borderRadius: BorderRadius.circular(2),
                      ),
                      child: Text(
                        sz,
                        style: GoogleFonts.outfit(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: isSel ? AetherTheme.sandLight : AetherTheme.charcoalDark,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 20),

          // 6. Action CTAs
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.shopping_bag_outlined, size: 16),
              label: Text('ANADIR A LA BOLSA (\$${product.price.toInt()})', style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AetherTheme.charcoalDark,
                foregroundColor: AetherTheme.sandLight,
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
              ),
              onPressed: () {
                appState.addToCart(product, appState.selectedSize);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('${product.name} anadida a la bolsa.')),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.bookmark_border, size: 16),
              label: Text('GUARDAR LOOK EN PERFIL', style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
              style: OutlinedButton.styleFrom(
                foregroundColor: AetherTheme.charcoalDark,
                side: const BorderSide(color: AetherTheme.charcoalDark),
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
              ),
              onPressed: () {
                appState.saveLookToProfile();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Look guardado en tu perfil de estilo.')),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          // Mobile Fase 3 (CU12): reservar esta prenda con deposito 10% via
          // Stripe. Mismo lugar donde CU12 vive en la web, junto al flujo
          // de compra del mismo producto.
          SizedBox(
            width: double.infinity,
            height: 44,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.event_available, size: 16),
              label: Text('RESERVAR EN SUCURSAL', style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
              style: OutlinedButton.styleFrom(
                foregroundColor: AetherTheme.charcoalDark,
                side: const BorderSide(color: AetherTheme.charcoalDark),
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
              ),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => ReservationFormScreen(product: product)),
                );
              },
            ),
          ),
          const SizedBox(height: 30),
        ],
      ),
    );
  }
}

/// Envuelve el "espejo" 3:4: por defecto muestra la foto estatica del
/// producto (comportamiento previo, sin camara), con un boton para activar
/// la camara RA real (CU11, `ArTryOnScreen`). Stateful local únicamente
/// porque el toggle on/off de la camara no necesita vivir en `AppState` —
/// nadie mas de la app lee "esta la camara activa ahora mismo".
class _MirrorCanvas extends StatefulWidget {
  final Product product;
  final bool isSimulatingTryOn;
  final String selectedSize;

  const _MirrorCanvas({
    required this.product,
    required this.isSimulatingTryOn,
    required this.selectedSize,
  });

  @override
  State<_MirrorCanvas> createState() => _MirrorCanvasState();
}

class _MirrorCanvasState extends State<_MirrorCanvas> {
  bool _arActivo = false;
  final CustomerService _customerService = CustomerService(ApiClient());
  int? _pecho;
  int? _cintura;

  @override
  void initState() {
    super.initState();
    // CU11 — determinar ajuste real: se piden las medidas del cliente una
    // sola vez al entrar al probador. Si falla (ej. sin conexion), el HUD
    // simplemente cae al estado "sin medidas" — nunca bloquea la pantalla.
    _customerService.getMiPerfil().then((perfil) {
      if (!mounted) return;
      setState(() {
        _pecho = perfil.pecho;
        _cintura = perfil.cintura;
      });
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: AspectRatio(
        aspectRatio: 3 / 4,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (_arActivo)
              // Sin Key propia a proposito: si tuviera una Key derivada del
              // producto, Flutter la tratatia como un widget nuevo al
              // cambiar de prenda y reiniciaria la camara en cada cambio.
              // Sin Key, el mismo State persiste y `widget.product` se
              // actualiza solo — ver el comentario en `ArTryOnScreen.build`.
              ArTryOnScreen(product: widget.product)
            else ...[
              CachedNetworkImage(
                imageUrl: widget.product.imageUrl,
                fit: BoxFit.cover,
              ),
              if (widget.isSimulatingTryOn)
                Container(
                  color: Colors.black.withOpacity(0.55),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SizedBox(
                          width: 28,
                          height: 28,
                          child: CircularProgressIndicator(color: AetherTheme.sandLight, strokeWidth: 2),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Ajustando drapeado IA...',
                          style: GoogleFonts.outfit(color: AetherTheme.sandLight, fontSize: 11, letterSpacing: 1.2),
                        ),
                      ],
                    ),
                  ),
                ),
              // HUD Overlay — CU11: veredicto real de ajuste (talla del
              // producto vs. medidas cargadas por el cliente en su perfil),
              // ya no un numero decorativo fijo.
              Positioned(
                bottom: 10,
                left: 10,
                right: 10,
                child: Builder(builder: (context) {
                  final resultado = determinarAjuste(
                    talla: widget.selectedSize,
                    pecho: _pecho,
                    cintura: _cintura,
                  );
                  final color = switch (resultado?.nivel) {
                    NivelAjuste.perfecto => AetherTheme.mutedGold,
                    NivelAjuste.ajustado || NivelAjuste.holgado => Colors.orangeAccent,
                    _ => Colors.white70,
                  };
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(2),
                      border: Border.all(color: Colors.white.withOpacity(0.2)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            resultado?.mensaje ?? 'Calculando ajuste...',
                            style: GoogleFonts.outfit(color: color, fontSize: 9.5, fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(
                          'Talla: ${widget.selectedSize}',
                          style: GoogleFonts.outfit(color: Colors.white, fontSize: 9.5),
                        ),
                      ],
                    ),
                  );
                }),
              ),
            ],

            // Boton toggle camara RA (CU11) — arriba a la derecha, siempre visible.
            Positioned(
              top: 8,
              right: 8,
              child: Material(
                color: Colors.black.withOpacity(0.6),
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => setState(() => _arActivo = !_arActivo),
                  child: Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Icon(
                      _arActivo ? Icons.photo_camera_back_outlined : Icons.camera_alt_outlined,
                      color: AetherTheme.sandLight,
                      size: 18,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
