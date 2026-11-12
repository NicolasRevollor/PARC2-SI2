import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/aether_theme.dart';
import 'login_screen.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AetherTheme.charcoalDark,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // La fotografía es decorativa: el degradado local mantiene una
          // portada completa aunque el dispositivo no tenga conexión.
          const _WelcomeBackdrop(),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, viewport) => SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(26, 22, 26, 20),
                child: ConstrainedBox(
                  constraints:
                      BoxConstraints(minHeight: viewport.maxHeight - 42),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AetherTheme.bronze,
                              borderRadius: BorderRadius.circular(13),
                            ),
                            child: const Icon(Icons.checkroom_rounded,
                                color: Colors.white, size: 25),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'YOUSHOP',
                            style: GoogleFonts.outfit(
                              color: AetherTheme.sandLight,
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 3.2,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 92),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AetherTheme.bronze.withValues(alpha: 0.22),
                          borderRadius: BorderRadius.circular(30),
                          border: Border.all(
                              color:
                                  AetherTheme.mutedGold.withValues(alpha: 0.4)),
                        ),
                        child: Text(
                          'MODA · ESTILO · VOS',
                          style: GoogleFonts.outfit(
                            color: AetherTheme.mutedGold,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.8,
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        'Encontrá tu\npróximo favorito.',
                        style: GoogleFonts.sourceSerif4(
                          color: Colors.white,
                          fontSize: 39,
                          height: 1.08,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Explorá nuevas colecciones, probá tu estilo y disfrutá una experiencia de compra hecha para vos.',
                        style: GoogleFonts.outfit(
                          color: AetherTheme.sand.withValues(alpha: 0.9),
                          fontSize: 14,
                          height: 1.6,
                        ),
                      ),
                      const SizedBox(height: 30),
                      SizedBox(
                        width: double.infinity,
                        height: 54,
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.of(context).pushReplacement(
                              MaterialPageRoute(
                                  builder: (_) => const LoginScreen()),
                            );
                          },
                          icon:
                              const Icon(Icons.arrow_forward_rounded, size: 18),
                          label: Text(
                            'ENTRAR A YOUSHOP',
                            style: GoogleFonts.outfit(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.5,
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AetherTheme.bronze,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14)),
                            elevation: 0,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Center(
                        child: Text(
                          'COMPRA ONLINE · CATÁLOGO · PROBADOR VIRTUAL',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.outfit(
                            color:
                                AetherTheme.sandLight.withValues(alpha: 0.58),
                            fontSize: 9,
                            letterSpacing: 1.15,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WelcomeBackdrop extends StatelessWidget {
  const _WelcomeBackdrop();

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF121316), Color(0xFF21151B), Color(0xFF121316)],
              stops: [0, 0.55, 1],
            ),
          ),
        ),
        Positioned(
          top: 65,
          right: -105,
          child: Container(
            width: 310,
            height: 310,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  AetherTheme.bronze.withValues(alpha: 0.42),
                  Colors.transparent
                ],
              ),
            ),
          ),
        ),
        Positioned(
          top: 140,
          right: 8,
          child: Icon(
            Icons.checkroom_rounded,
            size: 205,
            color: AetherTheme.mutedGold.withValues(alpha: 0.09),
          ),
        ),
        Positioned(
          top: 112,
          right: 28,
          child: Container(
            width: 165,
            height: 165,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                  color: Colors.white.withValues(alpha: 0.08), width: 1),
            ),
          ),
        ),
      ],
    );
  }
}
