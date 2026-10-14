import 'package:flutter/material.dart';
import '../models/product_model.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/products_service.dart';

class CartItem {
  final Product product;
  final String size;
  int quantity;

  CartItem({
    required this.product,
    required this.size,
    this.quantity = 1,
  });
}

class AppState extends ChangeNotifier {
  // --- Mobile Fase 1: infra + auth real + catalogo real ---------------
  final ApiClient _api = ApiClient();
  late final AuthService _authService = AuthService(_api);
  late final ProductsService _productsService = ProductsService(_api);

  bool _isAuthenticated = false;
  bool get isAuthenticated => _isAuthenticated;

  AuthUser? _currentUser;
  AuthUser? get currentUser => _currentUser;

  bool _authLoading = false;
  bool get authLoading => _authLoading;

  String? _authError;
  String? get authError => _authError;

  bool _productsLoading = false;
  bool get productsLoading => _productsLoading;

  String? _productsError;
  String? get productsError => _productsError;

  /// Se llama una vez al arrancar la app (ver `main.dart`) para restaurar
  /// una sesion guardada y cargar el catalogo real. No bloquea la UI mas
  /// alla de un splash breve — `main.dart` decide que mostrar mientras
  /// esto corre.
  Future<void> bootstrap() async {
    final user = await _authService.tryRestoreSession();
    _currentUser = user;
    _isAuthenticated = user != null;
    notifyListeners();
    await loadProducts();
  }

  Future<bool> login(String email, String password) async {
    _authLoading = true;
    _authError = null;
    notifyListeners();
    try {
      final user = await _authService.login(email, password);
      _currentUser = user;
      _isAuthenticated = true;
      return true;
    } on ApiException catch (e) {
      _authError = e.message;
      return false;
    } catch (_) {
      _authError = 'No se pudo conectar con el servidor.';
      return false;
    } finally {
      _authLoading = false;
      notifyListeners();
    }
  }

  Future<bool> register(String nombre, String email, String password) async {
    _authLoading = true;
    _authError = null;
    notifyListeners();
    try {
      final user = await _authService.register(nombre, email, password);
      _currentUser = user;
      _isAuthenticated = true;
      return true;
    } on ApiException catch (e) {
      _authError = e.message;
      return false;
    } catch (_) {
      _authError = 'No se pudo conectar con el servidor.';
      return false;
    } finally {
      _authLoading = false;
      notifyListeners();
    }
  }

  /// El modo invitado NUNCA pasa por aca — es solo navegar sin sesion
  /// (el catalogo es publico). Esto es exclusivamente para un logout
  /// explicito de una sesion que si existia.
  Future<void> logout() async {
    await _authService.logout();
    _currentUser = null;
    _isAuthenticated = false;
    notifyListeners();
  }

  Future<void> loadProducts({String? tipo, String? talla, String? color, String? q}) async {
    _productsLoading = true;
    _productsError = null;
    notifyListeners();
    try {
      final real = await _productsService.getProducts(tipo: tipo, talla: talla, color: color, q: q);
      _products
        ..clear()
        ..addAll(real);
      if (_products.isNotEmpty) {
        _selectedTryOnProduct = _products[0];
      }
    } on ApiException catch (e) {
      _productsError = e.message;
    } catch (_) {
      _productsError = 'No se pudo cargar el catalogo. Revisa tu conexion.';
    } finally {
      _productsLoading = false;
      notifyListeners();
    }
  }

  // --- Estado preexistente (sin cambios de comportamiento) -------------

  int _currentTabIndex = 0;
  int get currentTabIndex => _currentTabIndex;

  final List<Product> _products = List.from(dummyProducts);
  List<Product> get products => _products;

  final List<CartItem> _cart = [];
  List<CartItem> get cart => _cart;

  late Product _selectedTryOnProduct;
  Product get selectedTryOnProduct => _selectedTryOnProduct;

  late AvatarModel _selectedAvatar;
  AvatarModel get selectedAvatar => _selectedAvatar;

  String _fitMode = 'Talla Real';
  String get fitMode => _fitMode;

  String _selectedSize = 'M';
  String get selectedSize => _selectedSize;

  bool _isSimulatingTryOn = false;
  bool get isSimulatingTryOn => _isSimulatingTryOn;

  UserProfile _userProfile = dummyUserProfile;
  UserProfile get userProfile => _userProfile;

  AppState() {
    _selectedTryOnProduct = _products[0];
    _selectedAvatar = dummyAvatars[0];
  }

  void setTabIndex(int index) {
    _currentTabIndex = index;
    notifyListeners();
  }

  int get totalCartCount => _cart.fold(0, (sum, item) => sum + item.quantity);

  double get cartSubtotal => _cart.fold(0.0, (sum, item) => sum + (item.product.price * item.quantity));

  void addToCart(Product product, String size) {
    final existingIndex = _cart.indexWhere(
      (item) => item.product.id == product.id && item.size == size,
    );

    if (existingIndex >= 0) {
      _cart[existingIndex].quantity += 1;
    } else {
      _cart.add(CartItem(product: product, size: size, quantity: 1));
    }
    notifyListeners();
  }

  void removeFromCart(int index) {
    if (index >= 0 && index < _cart.length) {
      _cart.removeAt(index);
      notifyListeners();
    }
  }

  void updateCartQuantity(int index, int delta) {
    if (index >= 0 && index < _cart.length) {
      final newQty = _cart[index].quantity + delta;
      if (newQty <= 0) {
        _cart.removeAt(index);
      } else {
        _cart[index].quantity = newQty;
      }
      notifyListeners();
    }
  }

  void clearCart() {
    _cart.clear();
    notifyListeners();
  }

  void selectTryOnProduct(Product product) {
    _selectedTryOnProduct = product;
    _selectedSize = product.sizes.isNotEmpty ? product.sizes[0] : 'M';
    runSimulation();
    notifyListeners();
  }

  void selectAvatar(AvatarModel avatar) {
    _selectedAvatar = avatar;
    runSimulation();
    notifyListeners();
  }

  void setFitMode(String mode) {
    _fitMode = mode;
    runSimulation();
    notifyListeners();
  }

  void setSelectedSize(String size) {
    _selectedSize = size;
    notifyListeners();
  }

  void runSimulation() {
    _isSimulatingTryOn = true;
    notifyListeners();
    Future.delayed(const Duration(milliseconds: 650), () {
      _isSimulatingTryOn = false;
      notifyListeners();
    });
  }

  void saveLookToProfile() {
    final newLook = OutfitLook(
      id: 'look-${DateTime.now().millisecondsSinceEpoch}',
      title: 'LOOK - ${_selectedTryOnProduct.name.toUpperCase()}',
      subtitle: '${_selectedTryOnProduct.category} ($_fitMode)',
      imageUrl: _selectedTryOnProduct.imageUrl,
      items: [_selectedTryOnProduct.name],
      palette: [_selectedTryOnProduct.colorHex, '#171612', '#DDD9D8'],
    );

    final updatedOutfits = [newLook, ..._userProfile.savedOutfits];
    _userProfile = _userProfile.copyWith(savedOutfits: updatedOutfits);
    notifyListeners();
  }

  void updateMeasurements(int height, int chest, int waist, int inseam) {
    final newMeasurements = Measurements(
      height: height,
      chest: chest,
      waist: waist,
      inseam: inseam,
    );
    _userProfile = _userProfile.copyWith(measurements: newMeasurements);
    notifyListeners();
  }
}
