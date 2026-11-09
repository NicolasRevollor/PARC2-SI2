import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../theme/aether_theme.dart';
import '../providers/app_state.dart';
import 'home_screen.dart';
import 'collection_screen.dart';
import 'try_on_screen.dart';
import 'profile_screen.dart';
import 'cart_modal.dart';
import 'chat_widget.dart';
import 'offline/staff_shell.dart';

// "Citas" (appointments_screen.dart) se elimino: mezclaba dos conceptos —
// "Reserva de Probador y Prendas" (duplicaba CU12, ya resuelto de verdad
// en try_on_screen.dart/reservation_form_screen.dart desde la Fase 3) y
// "Personal Shopping en Tienda" (un caso de uso que nunca existio en los
// 25 CU documentados del proyecto — no era una integracion pendiente,
// era una pantalla huerfana sin especificacion real detras). Decision del
// usuario: sacarla en vez de inventar un backend para un CU inexistente.
class MainNavigationShell extends StatelessWidget {
  const MainNavigationShell({super.key});

  static const List<Widget> _screens = [
    HomeScreen(),
    CollectionScreen(),
    TryOnScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();

    // [CU12] a [CU20]: el personal entra al modo tienda; el Cliente, a la vitrina.
    final usuario = appState.currentUser;
    if (usuario != null && usuario.rol != 'Cliente') {
      return const StaffShell();
    }

    return Scaffold(
      backgroundColor: AetherTheme.sandLight,
      appBar: AppBar(
        title: Text(
          'A E T H E R',
          style: GoogleFonts.outfit(
            fontSize: 17,
            letterSpacing: 4.5,
            fontWeight: FontWeight.w400,
            color: AetherTheme.charcoalDark,
          ),
        ),
        centerTitle: true,
        backgroundColor: AetherTheme.sandLight.withValues(alpha: 0.95),
        elevation: 0,
        actions: [
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_bag_outlined, color: AetherTheme.charcoalDark, size: 22),
                onPressed: () {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => const CartModal(),
                  );
                },
              ),
              if (appState.totalCartCount > 0)
                Positioned(
                  top: 8,
                  right: 8,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: AetherTheme.charcoalDark,
                      shape: BoxShape.circle,
                    ),
                    constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                    child: Text(
                      '${appState.totalCartCount}',
                      style: GoogleFonts.outfit(
                        color: AetherTheme.sandLight,
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: Column(
        children: [
          // [CU13] Actor Cliente: catalogo guardado en el dispositivo.
          if (appState.catalogoSinConexion)
            Container(
              width: double.infinity,
              color: const Color(0xFFF6E6C4),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Text(
                'CU13 · Modo sin conexion: la informacion puede estar desactualizada'
                '${appState.catalogoActualizado != null ? ' (${appState.catalogoActualizado})' : ''}',
                style: GoogleFonts.outfit(fontSize: 11, color: AetherTheme.charcoalDark),
              ),
            ),
          Expanded(
            child: IndexedStack(
              index: appState.currentTabIndex,
              children: _screens,
            ),
          ),
        ],
      ),
      // Mobile Fase 4 (CU23): FAB persistente en el Scaffold unico que
      // envuelve las 5 tabs via IndexedStack — visible sin importar en que
      // tab este el usuario, equivalente movil del widget flotante fijo
      // que ya existe en la web.
      floatingActionButton: FloatingActionButton(
        backgroundColor: AetherTheme.charcoalDark,
        foregroundColor: AetherTheme.sandLight,
        onPressed: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => const ChatWidget(),
          );
        },
        child: const Icon(Icons.smart_toy_outlined),
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AetherTheme.sandLight,
          border: Border(top: BorderSide(color: Color(0xFFCCC6BC), width: 0.5)),
        ),
        child: BottomNavigationBar(
          currentIndex: appState.currentTabIndex,
          onTap: (index) => appState.setTabIndex(index),
          type: BottomNavigationBarType.fixed,
          backgroundColor: AetherTheme.sandLight,
          selectedItemColor: AetherTheme.charcoalDark,
          unselectedItemColor: const Color(0xFF7B776E),
          selectedLabelStyle: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8),
          unselectedLabelStyle: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.w500),
          elevation: 0,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.home_outlined),
              activeIcon: Icon(Icons.home),
              label: 'Inicio',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.grid_view_outlined),
              activeIcon: Icon(Icons.grid_view),
              label: 'Colección',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.auto_awesome_outlined),
              activeIcon: Icon(Icons.auto_awesome),
              label: 'Try-On',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.person_outline),
              activeIcon: Icon(Icons.person),
              label: 'Perfil',
            ),
          ],
        ),
      ),
    );
  }
}
