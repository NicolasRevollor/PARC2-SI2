# stripe-android-issuing-push-provisioning referencia clases de Google
# Wallet (Tap & Pay) que excluimos en el build.gradle.kts raiz porque son
# un SDK privado que no publica en repos publicos y no lo usamos (no
# provisionamos tarjetas a Google Wallet). R8 en modo full necesita que se
# le diga explicitamente que ignore esas clases ausentes, si no
# `minifyReleaseWithR8` falla con "Missing class". Reglas recomendadas por
# la propia documentacion de flutter_stripe.
-dontwarn com.stripe.android.pushProvisioning.**
-dontwarn com.google.android.gms.tapandpay.**

# WorkManager (dependencia transitiva, ni siquiera se usa directo en esta
# app) crashea en runtime con "Failed to create an instance of
# androidx.work.impl.WorkDatabase" — R8 ve que nada referencia esa clase
# de Room directamente (se instancia via reflexion) y le borra el
# constructor sin argumentos al optimizar. Se mantiene explicitamente.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class * extends androidx.work.ListenableWorker {
    <init>(android.content.Context, androidx.work.WorkerParameters);
}
