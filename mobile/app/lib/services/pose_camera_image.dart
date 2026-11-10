import 'package:camera/camera.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';

/// Packs YUV420 planes into NV21, excluding row padding and respecting
/// pixel strides. Android devices do not all use the same plane layout.
Uint8List packYuv420ToNv21(CameraImage image) {
  if (image.planes.length != 3 || image.width.isOdd || image.height.isOdd) {
    throw const FormatException(
        'Se esperaba una imagen YUV420 de tres planos.');
  }
  final result = Uint8List(image.width * image.height * 3 ~/ 2);
  var offset = 0;
  final y = image.planes[0];
  for (var row = 0; row < image.height; row++) {
    for (var col = 0; col < image.width; col++) {
      result[offset++] =
          y.bytes[row * y.bytesPerRow + col * (y.bytesPerPixel ?? 1)];
    }
  }
  final u = image.planes[1];
  final v = image.planes[2];
  for (var row = 0; row < image.height ~/ 2; row++) {
    for (var col = 0; col < image.width ~/ 2; col++) {
      result[offset++] =
          v.bytes[row * v.bytesPerRow + col * (v.bytesPerPixel ?? 1)];
      result[offset++] =
          u.bytes[row * u.bytesPerRow + col * (u.bytesPerPixel ?? 1)];
    }
  }
  return result;
}

InputImage cameraFrameForPose(
    CameraImage image, CameraDescription camera, DeviceOrientation orientation,
    {required bool android}) {
  const angles = {
    DeviceOrientation.portraitUp: 0,
    DeviceOrientation.landscapeLeft: 90,
    DeviceOrientation.portraitDown: 180,
    DeviceOrientation.landscapeRight: 270,
  };
  var degrees = camera.sensorOrientation;
  if (android) {
    final device = angles[orientation]!;
    degrees = camera.lensDirection == CameraLensDirection.front
        ? (degrees + device) % 360
        : (degrees - device + 360) % 360;
  }
  final rotation = InputImageRotationValue.fromRawValue(degrees);
  if (rotation == null)
    throw const FormatException('Rotacion de camara no compatible.');

  late Uint8List bytes;
  late InputImageFormat format;
  var bytesPerRow = image.planes.first.bytesPerRow;
  if (android &&
      image.planes.length == 3 &&
      image.format.group == ImageFormatGroup.yuv420) {
    bytes = packYuv420ToNv21(image);
    format = InputImageFormat.nv21;
    bytesPerRow = image.width;
  } else if (android &&
      image.planes.length == 1 &&
      image.format.group == ImageFormatGroup.nv21) {
    bytes = image.planes.first.bytes;
    format = InputImageFormat.nv21;
  } else if (!android &&
      image.planes.length == 1 &&
      image.format.group == ImageFormatGroup.bgra8888) {
    bytes = image.planes.first.bytes;
    format = InputImageFormat.bgra8888;
  } else {
    throw const FormatException(
        'Formato de camara no compatible con el detector.');
  }
  return InputImage.fromBytes(
      bytes: bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: bytesPerRow,
      ));
}
