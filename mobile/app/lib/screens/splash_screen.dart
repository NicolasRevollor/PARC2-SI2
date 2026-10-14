import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_state.dart';
import '../theme/aether_theme.dart';
import 'main_navigation_shell.dart';
import 'welcome_screen.dart';

/// Punto de entrada real de la app (Mobile Fase 1): corre
/// `AppState.bootstrap()` (intenta restaurar una sesion guardada + carga
/// el catalogo real) antes de decidir a donde navegar. Si habia una sesion
/// valida, salta directo a `MainNavigationShell`; si no, sigue el flujo
/// existente (`WelcomeScreen` -> `LoginScreen`).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final appState = context.read<AppState>();
    await appState.bootstrap();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => appState.isAuthenticated ? const MainNavigationShell() : const WelcomeScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AetherTheme.charcoalDark,
      body: Center(
        child: CircularProgressIndicator(color: AetherTheme.sandLight, strokeWidth: 2),
      ),
    );
  }
}
