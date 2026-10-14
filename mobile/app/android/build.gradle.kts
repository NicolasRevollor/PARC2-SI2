allprojects {
    repositories {
        google()
        mavenCentral()
    }

    // play-services-tapandpay es un SDK privado de Google (Tap & Pay) que
    // stripe-android-issuing-push-provisioning (dependencia transitiva de
    // flutter_stripe) referencia pero no publica en ningun repositorio
    // publico — sin este excluye, `lintVitalAnalyzeRelease` falla al
    // intentar resolverlo en el release build. No lo usamos (no hacemos
    // push provisioning de tarjetas a Google Wallet). Fix confirmado en
    // https://github.com/flutter-stripe/flutter_stripe/issues/2471
    configurations.all {
        exclude(group = "com.google.android.gms", module = "play-services-tapandpay")
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
