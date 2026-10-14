import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AetherTheme {
  // Kinetic Silk Palette
  static const Color sand = Color(0xFFF7F4EF);
  static const Color sandLight = Color(0xFFFDF8F7);
  static const Color sandDark = Color(0xFFDDD9D8);
  static const Color charcoal = Color(0xFF2C2A26);
  static const Color charcoalDark = Color(0xFF171612);
  static const Color bronze = Color(0xFF8C7355);
  static const Color mutedGold = Color(0xFFC9B99A);
  static const Color olive = Color(0xFF695D43);
  static const Color outline = Color(0xFFCCC6BC);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: sandLight,
      primaryColor: charcoalDark,
      colorScheme: const ColorScheme.light(
        primary: charcoalDark,
        secondary: bronze,
        surface: sandLight,
        onSurface: charcoalDark,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: sandLight,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: IconThemeData(color: charcoalDark),
      ),
      textTheme: TextTheme(
        displayLarge: GoogleFonts.outfit(
          fontSize: 36,
          fontWeight: FontWeight.w300,
          letterSpacing: 8.0,
          color: charcoalDark,
        ),
        headlineLarge: GoogleFonts.outfit(
          fontSize: 26,
          fontWeight: FontWeight.w400,
          letterSpacing: 1.5,
          color: charcoalDark,
        ),
        headlineMedium: GoogleFonts.outfit(
          fontSize: 20,
          fontWeight: FontWeight.w500,
          letterSpacing: 1.0,
          color: charcoalDark,
        ),
        titleMedium: GoogleFonts.outfit(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
          color: charcoalDark,
        ),
        bodyLarge: GoogleFonts.sourceSerif4(
          fontSize: 15,
          fontWeight: FontWeight.w400,
          height: 1.6,
          color: charcoalDark,
        ),
        bodyMedium: GoogleFonts.sourceSerif4(
          fontSize: 13,
          fontWeight: FontWeight.w400,
          height: 1.5,
          color: const Color(0xFF4A463F),
        ),
        labelLarge: GoogleFonts.outfit(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.8,
          color: charcoalDark,
        ),
      ),
    );
  }
}
