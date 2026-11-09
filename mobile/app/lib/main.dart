import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'theme/aether_theme.dart';
import 'providers/app_state.dart';
import 'screens/splash_screen.dart';
import 'services/api_client.dart';
import 'services/offline_sync_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  // Stripe se configura desde el backend al iniciar un pago. Un fallo del
  // proveedor no impide abrir la app ni consultar el catalogo.
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()),
        // [CU12] a [CU20]: modo tienda del personal.
        ChangeNotifierProvider(create: (_) => OfflineSyncService(ApiClient())),
      ],
      child: const AetherApp(),
    ),
  );
}

class AetherApp extends StatelessWidget {
  const AetherApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'YouShop',
      debugShowCheckedModeBanner: false,
      theme: AetherTheme.lightTheme,
      home: const SplashScreen(),
    );
  }
}
