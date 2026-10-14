import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../theme/aether_theme.dart';
import '../providers/app_state.dart';
import '../models/product_model.dart';

class CollectionScreen extends StatefulWidget {
  const CollectionScreen({super.key});

  @override
  State<CollectionScreen> createState() => _CollectionScreenState();
}

class _CollectionScreenState extends State<CollectionScreen> {
  String selectedFilter = 'Todos';
  final List<String> filters = ['Todos', 'Oversized', 'Regular', 'Sastrería', 'Abrigos'];

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();

    final filteredProducts = selectedFilter == 'Todos'
        ? appState.products
        : appState.products.where((p) => p.category.toLowerCase() == selectedFilter.toLowerCase()).toList();

    return Column(
      children: [
        // Filter Chips Bar
        Container(
          height: 48,
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            scrollDirection: Axis.horizontal,
            itemCount: filters.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final f = filters[index];
              final isSel = f == selectedFilter;
              return ChoiceChip(
                label: Text(f, style: GoogleFonts.outfit(fontSize: 11, fontWeight: isSel ? FontWeight.bold : FontWeight.w500)),
                selected: isSel,
                selectedColor: AetherTheme.charcoalDark,
                backgroundColor: Colors.white.withOpacity(0.6),
                side: const BorderSide(color: Color(0xFFCCC6BC), width: 0.6),
                labelStyle: TextStyle(color: isSel ? AetherTheme.sandLight : AetherTheme.charcoalDark),
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                showCheckmark: false,
                onSelected: (_) => setState(() => selectedFilter = f),
              );
            },
          ),
        ),

        // Product Grid (catalogo real — Mobile Fase 1)
        if (appState.productsLoading && appState.products.isEmpty)
          const Expanded(
            child: Center(child: CircularProgressIndicator(color: AetherTheme.bronze, strokeWidth: 2)),
          )
        else if (appState.productsError != null && appState.products.isEmpty)
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      appState.productsError!,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.sourceSerif4(fontSize: 12, color: const Color(0xFF7B776E)),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => appState.loadProducts(),
                      child: Text('Reintentar', style: GoogleFonts.outfit(fontSize: 11, color: AetherTheme.bronze, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            ),
          )
        else if (filteredProducts.isEmpty)
          Expanded(
            child: Center(
              child: Text(
                'No hay productos en esta categoría.',
                style: GoogleFonts.sourceSerif4(fontSize: 12, color: const Color(0xFF7B776E)),
              ),
            ),
          )
        else
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.58,
              crossAxisSpacing: 12,
              mainAxisSpacing: 16,
            ),
            itemCount: filteredProducts.length,
            itemBuilder: (context, index) {
              final product = filteredProducts[index];
              return Container(
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.5),
                  border: Border.all(color: const Color(0xFFCCC6BC).withOpacity(0.5)),
                  borderRadius: BorderRadius.circular(2),
                ),
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Product Image
                    Expanded(
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(2),
                              child: CachedNetworkImage(
                                imageUrl: product.imageUrl,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                          Positioned(
                            top: 4,
                            left: 4,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                              color: AetherTheme.sandLight.withOpacity(0.9),
                              child: Text(
                                product.category.toUpperCase(),
                                style: GoogleFonts.outfit(fontSize: 7.5, fontWeight: FontWeight.bold),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      product.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.sourceSerif4(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '\$${product.price.toInt()}',
                      style: GoogleFonts.sourceSerif4(fontSize: 12, color: const Color(0xFF7B776E)),
                    ),
                    const SizedBox(height: 8),
                    // Probar IA Button
                    SizedBox(
                      width: double.infinity,
                      height: 30,
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.face_retouching_natural, size: 13, color: AetherTheme.bronze),
                        label: Text('PROBAR IA', style: GoogleFonts.outfit(fontSize: 9, fontWeight: FontWeight.bold)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AetherTheme.charcoalDark,
                          side: const BorderSide(color: Color(0xFFCCC6BC)),
                          padding: EdgeInsets.zero,
                          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                        ),
                        onPressed: () {
                          appState.selectTryOnProduct(product);
                          appState.setTabIndex(2);
                        },
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
