import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../providers/app_state.dart';
import '../theme/aether_theme.dart';
import 'main_navigation_shell.dart';

/// Registro real (Mobile Fase 1) — no existia ninguna pantalla de registro
/// en la app movil antes de esto. Misma regla de fortaleza de contraseña
/// que el resto del proyecto (`backend/app/security.py::validate_password_strength`):
/// minimo 10 caracteres, 1 minuscula, 1 mayuscula, 1 numero, 1 caracter
/// especial. Se valida tambien del lado servidor — esto es solo feedback
/// inmediato, no reemplaza esa validacion.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nombreController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _nombreController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String? _validarPassword(String? value) {
    final v = value ?? '';
    if (v.length < 10) return 'Mínimo 10 caracteres.';
    if (!RegExp(r'[a-z]').hasMatch(v)) return 'Necesita al menos una minúscula.';
    if (!RegExp(r'[A-Z]').hasMatch(v)) return 'Necesita al menos una mayúscula.';
    if (!RegExp(r'[0-9]').hasMatch(v)) return 'Necesita al menos un número.';
    if (!RegExp(r'[^a-zA-Z0-9]').hasMatch(v)) return 'Necesita al menos un carácter especial.';
    return null;
  }

  Future<void> _registrar() async {
    if (!_formKey.currentState!.validate()) return;
    final appState = context.read<AppState>();
    final ok = await appState.register(
      _nombreController.text.trim(),
      _emailController.text.trim(),
      _passwordController.text,
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MainNavigationShell()),
      );
    }
  }

  Widget _label(String text) => Text(
        text,
        style: GoogleFonts.outfit(
          fontSize: 10,
          letterSpacing: 1.8,
          fontWeight: FontWeight.w600,
          color: const Color(0xFF7B776E),
        ),
      );

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
                  'Creá tu cuenta.',
                  style: GoogleFonts.outfit(fontSize: 30, fontWeight: FontWeight.w500, color: AetherTheme.charcoalDark),
                ),
                const SizedBox(height: 6),
                Text(
                  'Unite a YouShop para guardar tus compras, reservas y recomendaciones.',
                  style: GoogleFonts.sourceSerif4(fontSize: 14, color: const Color(0xFF4A463F)),
                ),
                const SizedBox(height: 36),
                _label('NOMBRE COMPLETO'),
                TextFormField(
                  controller: _nombreController,
                  style: GoogleFonts.sourceSerif4(fontSize: 14),
                  decoration: const InputDecoration(
                    border: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.outline)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.charcoalDark, width: 1.5)),
                  ),
                  validator: (value) => (value == null || value.trim().isEmpty) ? 'Ingresá tu nombre.' : null,
                ),
                const SizedBox(height: 28),
                _label('CORREO ELECTRÓNICO'),
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  style: GoogleFonts.sourceSerif4(fontSize: 14),
                  decoration: const InputDecoration(
                    border: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.outline)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.charcoalDark, width: 1.5)),
                  ),
                  validator: (value) {
                    final v = value?.trim() ?? '';
                    if (v.isEmpty) return 'Ingresá tu correo.';
                    if (!v.contains('@') || !v.contains('.')) return 'Correo inválido.';
                    return null;
                  },
                ),
                const SizedBox(height: 28),
                _label('CONTRASEÑA'),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  style: GoogleFonts.sourceSerif4(fontSize: 14),
                  decoration: const InputDecoration(
                    border: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.outline)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: AetherTheme.charcoalDark, width: 1.5)),
                    helperText: 'Mín. 10 caracteres, mayúscula, minúscula, número y símbolo.',
                    helperMaxLines: 2,
                  ),
                  validator: _validarPassword,
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
                    onPressed: appState.authLoading ? null : _registrar,
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
                            'CREAR CUENTA',
                            style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 2.0),
                          ),
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
