import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../providers/app_state.dart';
import '../theme/aether_theme.dart';
import 'main_navigation_shell.dart';
import 'register_screen.dart';

/// Login real (Mobile Fase 1) — antes esta pantalla era decorativa (campos
/// pre-rellenados con un credencial falso, cualquier boton entraba igual).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _continuarComoInvitado() {
    // Navegacion sin sesion — el catalogo es publico. `AppState` NUNCA se
    // marca como autenticado por este camino.
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const MainNavigationShell()),
    );
  }

  Future<void> _iniciarSesion() async {
    if (!_formKey.currentState!.validate()) return;
    final appState = context.read<AppState>();
    final ok = await appState.login(_emailController.text.trim(), _passwordController.text);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MainNavigationShell()),
      );
    }
    // Si fallo, `appState.authError` ya tiene el mensaje REAL del backend
    // (incluye los mensajes de bloqueo progresivo) — se muestra abajo del
    // formulario, no un texto generico.
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();

    return Scaffold(
      backgroundColor: AetherTheme.sandLight,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AetherTheme.charcoalDark),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 12.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Bienvenido.',
                  style: GoogleFonts.outfit(
                    fontSize: 30,
                    fontWeight: FontWeight.w500,
                    color: AetherTheme.charcoalDark,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Accede a tu perfil biométrico y colecciones exclusivas.',
                  style: GoogleFonts.sourceSerif4(
                    fontSize: 14,
                    color: const Color(0xFF4A463F),
                  ),
                ),
                const SizedBox(height: 36),
                Text(
                  'CORREO ELECTRÓNICO',
                  style: GoogleFonts.outfit(
                    fontSize: 10,
                    letterSpacing: 1.8,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF7B776E),
                  ),
                ),
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  style: GoogleFonts.sourceSerif4(fontSize: 14),
                  decoration: const InputDecoration(
                    border: UnderlineInputBorder(
                      borderSide: BorderSide(color: AetherTheme.outline),
                    ),
                    focusedBorder: UnderlineInputBorder(
                      borderSide: BorderSide(color: AetherTheme.charcoalDark, width: 1.5),
                    ),
                  ),
                  validator: (value) {
                    final v = value?.trim() ?? '';
                    if (v.isEmpty) return 'Ingresá tu correo.';
                    if (!v.contains('@') || !v.contains('.')) return 'Correo inválido.';
                    return null;
                  },
                ),
                const SizedBox(height: 28),
                Text(
                  'CONTRASEÑA',
                  style: GoogleFonts.outfit(
                    fontSize: 10,
                    letterSpacing: 1.8,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF7B776E),
                  ),
                ),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  style: GoogleFonts.sourceSerif4(fontSize: 14),
                  decoration: const InputDecoration(
                    border: UnderlineInputBorder(
                      borderSide: BorderSide(color: AetherTheme.outline),
                    ),
                    focusedBorder: UnderlineInputBorder(
                      borderSide: BorderSide(color: AetherTheme.charcoalDark, width: 1.5),
                    ),
                  ),
                  validator: (value) => (value == null || value.isEmpty) ? 'Ingresá tu contraseña.' : null,
                ),
                if (appState.authError != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    appState.authError!,
                    style: GoogleFonts.sourceSerif4(fontSize: 12, color: const Color(0xFFB3261E)),
                  ),
                ],
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: appState.authLoading ? null : _iniciarSesion,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AetherTheme.charcoalDark,
                      foregroundColor: AetherTheme.sandLight,
                      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                    ),
                    child: appState.authLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(color: AetherTheme.sandLight, strokeWidth: 2),
                          )
                        : Text(
                            'INICIAR SESIÓN',
                            style: GoogleFonts.outfit(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 2.0,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const RegisterScreen()),
                      );
                    },
                    child: Text(
                      '¿No tenés cuenta? Registrate',
                      style: GoogleFonts.outfit(fontSize: 12, color: AetherTheme.bronze, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: _continuarComoInvitado,
                    child: Text(
                      'Continuar como Invitado',
                      style: GoogleFonts.outfit(
                        fontSize: 12,
                        color: const Color(0xFF7B776E),
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
