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
          // Hero Background Fashion Image
          Image.network(
            'https://lh3.googleusercontent.com/aida-public/AB6AXuDWVEjDuUQ_X1l6JvlGJvjXr68r55cZvMqHoC2dCPjlzv-t0nbhrhq4Qt_M_rHaKnhnkmFT9VkhJw7xmdGauzKUYocKh5oT8KKBmmKVpNPtmgqEAlTXR8sVFtg1gPM6FDbsWDApruzAx205g6Z7njnP5tC_1lM3Jy_74UDWgFyxNjMIdyZ6nN-Hvr22utV3vMdZESNVnP_ZSU4cLhu9Ca4obAm09F1M04b9BiLkQp8f03j57smqHSsmVg',
            fit: BoxFit.cover,
          ),
          // Dark Minimalist Overlay
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  AetherTheme.charcoalDark.withOpacity(0.2),
                  AetherTheme.charcoalDark.withOpacity(0.5),
                  AetherTheme.charcoalDark.withOpacity(0.95),
                ],
              ),
            ),
          ),
          // Content
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    'A E T H E R',
                    style: GoogleFonts.outfit(
                      fontSize: 36,
                      fontWeight: FontWeight.w300,
                      letterSpacing: 10.0,
                      color: AetherTheme.sandLight,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Armario de lujo minimalista. Simulación de drapeado con IA y fittings privados de atelier a medida.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.sourceSerif4(
                      fontSize: 14,
                      height: 1.6,
                      color: AetherTheme.sandLight.withOpacity(0.85),
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pushReplacement(
                          MaterialPageRoute(builder: (_) => const LoginScreen()),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AetherTheme.sandLight,
                        foregroundColor: AetherTheme.charcoalDark,
                        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                        elevation: 0,
                      ),
                      child: Text(
                        'EXPLORAR COLECCIÓN',
                        style: GoogleFonts.outfit(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 2.0,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
