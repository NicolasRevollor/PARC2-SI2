import 'package:camera/camera.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';
import 'package:aether_fashion/services/pose_camera_image.dart';

CameraImage frame({int chromaStride = 1}) {
  // Padding at the end of each row; chroma may be planar or interleaved.
  // ignore: deprecated_member_use
  return CameraImage.fromPlatformData({
    'format': 35,
    'width': 4,
    'height': 2,
    'planes': [
      {
        'bytes': Uint8List.fromList([1, 2, 3, 4, 99, 99, 5, 6, 7, 8]),
        'bytesPerRow': 6,
        'bytesPerPixel': 1
      },
      {
        'bytes':
            Uint8List.fromList(chromaStride == 1 ? [10, 11] : [10, 99, 11]),
        'bytesPerRow': 4,
        'bytesPerPixel': chromaStride
      },
      {
        'bytes':
            Uint8List.fromList(chromaStride == 1 ? [20, 21] : [20, 99, 21]),
        'bytesPerRow': 4,
        'bytesPerPixel': chromaStride
      },
    ],
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final stride in [1, 2]) {
    test('convierte YUV420 con padding y pixel stride $stride en NV21', () {
      expect(packYuv420ToNv21(frame(chromaStride: stride)),
          [1, 2, 3, 4, 5, 6, 7, 8, 20, 10, 21, 11]);
    });
  }
  for (final lens in [CameraLensDirection.front, CameraLensDirection.back]) {
    test('compensa rotacion horizontal de camara $lens', () {
      final input = cameraFrameForPose(
          frame(),
          CameraDescription(
            name: 'test',
            lensDirection: lens,
            sensorOrientation: 90,
          ),
          DeviceOrientation.landscapeLeft,
          android: true);
      expect(input.metadata!.format, InputImageFormat.nv21);
      expect(
          input.metadata!.rotation,
          lens == CameraLensDirection.front
              ? InputImageRotation.rotation180deg
              : InputImageRotation.rotation0deg);
      expect(input.bytes!.length, 12);
    });
  }
  test('conserva la rotacion del sensor con el telefono vertical', () {
    final input = cameraFrameForPose(
        frame(),
        const CameraDescription(
          name: 'front',
          lensDirection: CameraLensDirection.front,
          sensorOrientation: 270,
        ),
        DeviceOrientation.portraitUp,
        android: true);
    expect(input.metadata!.rotation, InputImageRotation.rotation270deg);
  });
}
