import 'dart:io' show Platform;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';

import '../config/api_config.dart';
import '../models/product_model.dart';
import '../services/api_client.dart';
import '../services/customer_service.dart';
import '../services/size_chart.dart';
import '../services/pose_camera_image.dart';
import '../theme/aether_theme.dart';

/// CU11 — Vestidor Virtual (RA), version acotada: camara real en vivo +
/// deteccion de pose (hombros) para anclar la imagen del producto sobre el
/// cuerpo detectado. Usa el recorte transparente cargado desde la web;
/// las prendas antiguas conservan el recorte del catalogo. Es una
/// superposicion 2D, sin simulacion de caida de tela ni ajuste 3D.
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
  String? _detectionError;
  int _failedFrames = 0;
  final CustomerService _customerService = CustomerService(ApiClient());
  int? _pecho;
  int? _cintura;

  @override
  void initState() {
    super.initState();
    _poseDetector = PoseDetector(options: PoseDetectorOptions(mode: PoseDetectionMode.stream));
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
        // Convertimos YUV420 nosotros para respetar los strides de cada
        // dispositivo y evitar depender de la conversion NV21 de CameraX.
        imageFormatGroup: Platform.isAndroid ? ImageFormatGroup.yuv420 : ImageFormatGroup.bgra8888,
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

  Future<void> _processCameraImage(CameraImage image) async {
    final controller = _controller;
    final detector = _poseDetector;
    if (!mounted || _isDetecting || detector == null || controller == null) return;
    _isDetecting = true;
    try {
      final input = cameraFrameForPose(image, controller.description,
          controller.value.deviceOrientation, android: Platform.isAndroid);
      final poses = await detector.processImage(input);
      if (!mounted) return;
      setState(() {
        _lastPose = poses.isNotEmpty ? poses.first : null;
        _detectionError = null;
        _failedFrames = 0;
      });
    } catch (error) {
      _failedFrames++;
      if (_failedFrames == 1) debugPrint('Probador: no se pudo procesar la camara: $error');
      if (mounted && _failedFrames == 5) {
        setState(() {
          _lastPose = null;
          _detectionError = 'No se puede procesar la camara. Cierra el probador y vuelve a abrirlo.';
        });
      }
    } finally {
      _isDetecting = false;
    }
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
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(2)),
              child: Text(
                resultado.mensaje,
                style: GoogleFonts.outfit(color: AetherTheme.sandLight, fontSize: 10.5, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        if (pose != null)
          // Recorte con fondo transparente: con la foto del catalogo (que
          // tiene fondo de estudio) se tapaba la camara con un rectangulo.
          _GarmentOverlay(
            previewSize: controller.value.previewSize,
            pose: pose,
            imageUrl: widget.product.tryOnImageUrl ?? ApiConfig.urlRecorte(widget.product.imageUrl),
            pantalon: widget.product.category.toLowerCase().contains('jean'),
          )
        else
          Positioned(
            bottom: 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(2)),
                child: Text(_detectionError ?? 'Buscando tu silueta... Muestra tu rostro y torso con buena luz.',
                  textAlign: TextAlign.center, style: GoogleFonts.outfit(color: AetherTheme.sandLight, fontSize: 11)),
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
  final bool pantalon;

  const _GarmentOverlay({required this.previewSize, required this.pose, required this.imageUrl, required this.pantalon});

  @override
  Widget build(BuildContext context) {
    final size = previewSize;
    final left = pose.landmarks[pantalon ? PoseLandmarkType.leftHip : PoseLandmarkType.leftShoulder];
    final right = pose.landmarks[pantalon ? PoseLandmarkType.rightHip : PoseLandmarkType.rightShoulder];
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

        final overlayWidth = shoulderWidthPx.clamp(20.0, constraints.maxWidth) * (pantalon ? 1.7 : 2.2);
        final overlayHeight = overlayWidth * (pantalon ? 2.0 : 1.3);

        return Positioned(
          left: (midX - overlayWidth / 2).clamp(-overlayWidth, constraints.maxWidth),
          top: (midY - overlayHeight * (pantalon ? 0.05 : 0.15)).clamp(-overlayHeight, constraints.maxHeight),
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
