import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:provider/provider.dart';
import 'config/api_config.dart';
import 'theme/aether_theme.dart';
import 'providers/app_state.dart';
import 'screens/splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  // Mobile Fase 2 (checkout): inicializa el SDK de Stripe antes de correr
  // la app — `initPaymentSheet`/`presentPaymentSheet` fallan si esto no
  // corrio primero.
  Stripe.publishableKey = ApiConfig.stripePublishableKey;
  await Stripe.instance.applySettings();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()),
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
