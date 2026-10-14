# AETHER - Minimalist Luxury Fashion (Flutter App)

Esta aplicación móvil está desarrollada con **Flutter 3.x** y **Dart**, utilizando una arquitectura limpia basada en **Provider** para la gestión de estados globales y **Material 3** con la tipografía personalizada de Google Fonts (`Outfit` y `Source Serif 4`).

---

## 🚀 Pasos para Ejecutar en tu Computadora

1. **Asegúrate de tener Flutter instalado**:
   ```bash
   flutter doctor
   ```

2. **Crea el proyecto o clónalo**:
   ```bash
   flutter create aether_fashion
   cd aether_fashion
   ```

3. **Copia los archivos del proyecto** en la carpeta `lib/` y reemplaza el archivo `pubspec.yaml`.

4. **Instala las dependencias**:
   ```bash
   flutter pub get
   ```

5. **Ejecuta la aplicación**:
   ```bash
   flutter run
   ```

---

## 📦 Estructura del Proyecto

```
lib/
├── main.dart                      # Punto de entrada de la app
├── theme/
│   └── aether_theme.dart          # Paleta Kinetic Silk & Tipografía AETHER
├── models/
│   └── product_model.dart         # Modelos de Producto, Avatar 3D, Perfil, etc.
├── providers/
│   └── app_state.dart             # Estado global (Carrito, Try-On IA, Perfil)
└── screens/
    ├── welcome_screen.dart        # Pantalla de bienvenida
    ├── login_screen.dart          # Inicio de sesión
    ├── main_navigation_shell.dart # Barra de navegación inferior (5 pestañas)
    ├── home_screen.dart           # Editorial y destacados
    ├── collection_screen.dart     # Catálogo y filtros por categoría
    ├── try_on_screen.dart         # Probador Virtual con IA y drapeado
    ├── appointments_screen.dart   # Reserva de citas en Atelier
    ├── profile_screen.dart        # Perfil biométrico y Style Insights
    └── cart_modal.dart            # Bolsa de compras y checkout
```
