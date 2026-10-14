package com.example.app

import io.flutter.embedding.android.FlutterFragmentActivity

// Fase 2 (Stripe): PaymentSheet usa el Support Fragment Manager para sus
// UI (formulario de tarjeta, 3D Secure) — FlutterActivity normal no lo
// soporta. Confirmado por el crash real en produccion:
// "PlatformException(flutter_stripe initialization failed... Your Main
// Activity class ... is not a subclass FlutterFragmentActivity)".
class MainActivity : FlutterFragmentActivity()
