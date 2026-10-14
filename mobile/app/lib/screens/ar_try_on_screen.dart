import 'dart:io' show Platform;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';

import '../models/product_model.dart';
import '../services/api_client.dart';
import '../services/customer_service.dart';
import '../services/size_chart.dart';
import '../theme/aether_theme.dart';

/// CU11 — Vestidor Virtual (RA), version acotada: camara real en vivo +
/// deteccion de pose (hombros) para anclar la imagen del producto sobre el
/// torso detectado. NO es simulacion de caida de tela ni RA biomecanica —
/// las fotos del catalogo son fotos de estudio con fondo opaco, no recortes
/// con transparencia, asi que el overlay se ve como una foto semi-
/// transparente que sigue el cuerpo, no una prenda "puesta" fotorealista.
class ArTryOnScreen extends StatefulWidget {
  final Product product;

  const ArTryOnScreen({super.key, required this.product});

  @override
  State<ArTryOnScreen> createState() => _ArTryOnScreenState();
}

class _ArTryOnScreenState extends State<ArTryOnScreen> {
  CameraController? _controller;
  PoseDetector? _poseDetector;
  bool _isDetecting = false;
  bool _permissionDenied = false;
  String? _errorMessage;
  Pose? _lastPose;
  final CustomerService _customerService = CustomerService(ApiClient());
  int? _pecho;
  int? _cintura;

  @override
  void initState() {
    super.initState();
    _poseDetector = PoseDetector(options: PoseDetectorOptions());
    _initCamera();
    // CU11 — mismo veredicto de ajuste que la vista estatica, no depende
    // de la deteccion de pose (la talla ya viene del producto elegido).
    _customerService.getMiPerfil().then((perfil) {
      if (!mounted) return;
      setState(() {
        _pecho = perfil.pecho;
        _cintura = perfil.cintura;
      });
    }).catchError((_) {});
  }

  Future<void> _initCamera() async {
    setState(() {
      _permissionDenied = false;
      _errorMessage = null;
    });
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (!mounted) return;
        setState(() => _errorMessage = 'No se encontro ninguna camara disponible en este dispositivo.');
        return;
      }
      final camera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        camera,
        ResolutionPreset.medium,
        enableAudio: false,
        // NV21 en Android / BGRA8888 en iOS: son los unicos dos formatos que
        // el mapeo simple de `_cameraImageToInputImage` de abajo entiende
        // (imagen de un solo plano). Sin este `imageFormatGroup`, Android
        // entrega YUV420 en 3 planos y ese camino de conversion no aplica.
        imageFormatGroup: Platform.isAndroid ? ImageFormatGroup.nv21 : ImageFormatGroup.bgra8888,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
      await controller.startImageStream(_processCameraImage);
    } on CameraException catch (e) {
      if (!mounted) return;
      final codigosPermiso = {
        'CameraAccessDenied',
        'CameraAccessDeniedWithoutPrompt',
        'CameraAccessRestricted',
      };
      if (codigosPermiso.contains(e.code)) {
        setState(() => _permissionDenied = true);
      } else {
        setState(() => _errorMessage = 'No se pudo iniciar la camara (${e.code}).');
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorMessage = 'No se pudo iniciar la camara.');
    }
  }

  void _processCameraImage(CameraImage image) {
    final controller = _controller;
    final detector = _poseDetector;
    if (_isDetecting || detector == null || controller == null) return;
    _isDetecting = true;

    final inputImage = _cameraImageToInputImage(image, controller.description);
    if (inputImage == null) {
      _isDetecting = false;
      return;
    }

    detector.processImage(inputImage).then((poses) {
      if (mounted) {
        setState(() => _lastPose = poses.isNotEmpty ? poses.first : null);
      }
    }).catchError((_) {
      // Se ignora el fallo de un frame puntual — se sigue intentando con el
      // siguiente frame del stream, nunca se corta la camara por esto.
    }).whenComplete(() {
      _isDetecting = false;
    });
  }

  /// Conversion CameraImage -> InputImage para ML Kit. Este es el punto MAS
  /// fragil de toda la integracion camera + google_mlkit_pose_detection: el
  /// mapeo exacto de rotacion/formato cambio entre versiones de ambos
  /// paquetes en el pasado. Si `flutter analyze` marca algo en este metodo,
  /// es el primer lugar a revisar contra la app de ejemplo del paquete
  /// instalado.
  InputImage? _cameraImageToInputImage(CameraImage image, CameraDescription description) {
    final rotation = InputImageRotationValue.fromRawValue(description.sensorOrientation) ?? InputImageRotation.rotation0deg;

    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;

    // `InputImage.fromBytes` (via este camino simple) solo entiende un
    // buffer de un solo plano (NV21/BGRA8888, forzado arriba via
    // `imageFormatGroup`). Si el dispositivo entrega mas de un plano pese a
    // esa configuracion, se descarta el frame en vez de fallar.
    if (image.planes.length != 1) return null;
    final plane = image.planes.first;

    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  @override
  void dispose() {
    final controller = _controller;
    if (controller != null && controller.value.isStreamingImages) {
      controller.stopImageStream();
    }
    controller?.dispose();
    _poseDetector?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_permissionDenied) {
      return _MessageOverlay(
        icon: Icons.no_photography_outlined,
        message: 'YouShop necesita permiso de camara para el probador virtual. Activalo en los ajustes del sistema.',
        actionLabel: 'Reintentar',
        onAction: _initCamera,
      );
    }
    if (_errorMessage != null) {
      return _MessageOverlay(icon: Icons.error_outline, message: _errorMessage!, actionLabel: 'Reintentar', onAction: _initCamera);
    }

    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const ColoredBox(
        color: Colors.black87,
        child: Center(child: CircularProgressIndicator(color: AetherTheme.sandLight, strokeWidth: 2)),
      );
    }

    final pose = _lastPose;

    final talla = widget.product.sizes.isNotEmpty ? widget.product.sizes.first : null;
    final resultado = determinarAjuste(talla: talla, pecho: _pecho, cintura: _cintura);

    return Stack(
      fit: StackFit.expand,
      children: [
        CameraPreview(controller),
        if (resultado != null)
          Positioned(
            top: 8,
            left: 8,
            right: 56,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(color: Colors.black.withOpacity(0.6), borderRadius: BorderRadius.circular(2)),
              child: Text(
                resultado.mensaje,
                style: GoogleFonts.outfit(color: AetherTheme.sandLight, fontSize: 10.5, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        if (pose != null)
          _GarmentOverlay(previewSize: controller.value.previewSize, pose: pose, imageUrl: widget.product.imageUrl)
        else
          Positioned(
            bottom: 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: Colors.black.withOpacity(0.6), borderRadius: BorderRadius.circular(2)),
                child: Text('Buscando tu silueta...', style: GoogleFonts.outfit(color: AetherTheme.sandLight, fontSize: 11)),
              ),
            ),
          ),
      ],
    );
  }
}

class _GarmentOverlay extends StatelessWidget {
  final Size? previewSize;
  final Pose pose;
  final String imageUrl;

  const _GarmentOverlay({required this.previewSize, required this.pose, required this.imageUrl});

  @override
  Widget build(BuildContext context) {
    final size = previewSize;
    final left = pose.landmarks[PoseLandmarkType.leftShoulder];
    final right = pose.landmarks[PoseLandmarkType.rightShoulder];
    if (size == null || left == null || right == null) {
      return const SizedBox.shrink();
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        // Las coordenadas de los landmarks de ML Kit estan en el espacio de
        // pixeles de la imagen FUENTE capturada por el sensor (no en el
        // espacio del widget). `previewSize` (ancho x alto tal como lo
        // reporta el sensor) suele venir en orientacion landscape nativa
        // aunque el telefono este en portrait — de ahi el swap de ejes de
        // abajo. Si el overlay se ve corrido/rotado en un dispositivo real,
        // este es el primer lugar a revisar.
        final imageW = size.height;
        final imageH = size.width;
        if (imageW <= 0 || imageH <= 0) return const SizedBox.shrink();

        final scaleX = constraints.maxWidth / imageW;
        final scaleY = constraints.maxHeight / imageH;

        final midX = (left.x + right.x) / 2 * scaleX;
        final midY = (left.y + right.y) / 2 * scaleY;
        final shoulderWidthPx = (left.x - right.x).abs() * scaleX;

        final overlayWidth = shoulderWidthPx.clamp(20.0, constraints.maxWidth) * 2.2;
        final overlayHeight = overlayWidth * 1.3;

        return Positioned(
          left: (midX - overlayWidth / 2).clamp(-overlayWidth, constraints.maxWidth),
          top: (midY - overlayHeight * 0.15).clamp(-overlayHeight, constraints.maxHeight),
          width: overlayWidth,
          height: overlayHeight,
          child: IgnorePointer(
            child: Opacity(
              opacity: 0.75,
              child: CachedNetworkImage(imageUrl: imageUrl, fit: BoxFit.contain),
            ),
          ),
        );
      },
    );
  }
}

class _MessageOverlay extends StatelessWidget {
  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _MessageOverlay({required this.icon, required this.message, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black87,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: AetherTheme.sandLight, size: 32),
              const SizedBox(height: 12),
              Text(
                message,
                textAlign: TextAlign.center,
                style: GoogleFonts.outfit(color: AetherTheme.sandLight, fontSize: 12),
              ),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: onAction,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AetherTheme.sandLight,
                    side: const BorderSide(color: AetherTheme.sandLight),
                  ),
                  child: Text(actionLabel!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
