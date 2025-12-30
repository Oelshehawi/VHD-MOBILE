import { useState, useRef } from 'react';
import { View, Alert, TouchableOpacity, Text as RNText } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CameraCaptureScreenProps {
  onPhotoCaptured: (uri: string) => void;
  capturedCount: number;
  onDone: () => void;
  onClose: () => void;
  type: 'before' | 'after';
}

const MAX_PHOTOS = 20;
const WARNING_THRESHOLD = 15;

export function CameraCaptureScreen({
  onPhotoCaptured,
  capturedCount,
  onDone,
  onClose,
  type,
}: CameraCaptureScreenProps) {
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();

  const handleTakePicture = async () => {
    if (!cameraRef.current || !isCameraReady) return;

    // Check max photo limit
    if (capturedCount >= MAX_PHOTOS) {
      Alert.alert(
        'Maximum Photos Reached',
        `You can only capture up to ${MAX_PHOTOS} photos at a time. Please review and upload these photos before taking more.`,
        [{ text: 'OK' }]
      );
      return;
    }

    // Show warning at threshold
    if (capturedCount === WARNING_THRESHOLD) {
      Alert.alert(
        'Photo Limit Warning',
        `You have ${WARNING_THRESHOLD} photos. Consider reviewing before taking more.`,
        [{ text: 'Continue', onPress: () => capturePhoto() }]
      );
    } else {
      await capturePhoto();
    }
  };

  const capturePhoto = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        exif: false,
      });

      if (photo?.uri) {
        onPhotoCaptured(photo.uri);
      }
    } catch (error) {
      Alert.alert(
        'Capture Failed',
        'Unable to take photo. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleCameraReady = () => {
    setIsCameraReady(true);
  };

  const toggleFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlash((current) => {
      if (current === 'off') return 'on';
      if (current === 'on') return 'auto';
      return 'off';
    });
  };

  // Permission denied or not granted
  if (!permission) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-900 p-6">
        <RNText className="text-white text-2xl font-semibold text-center">
          Loading Camera...
        </RNText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-900 p-6">
        <Ionicons name="camera-outline" size={64} color="#9CA3AF" />
        <RNText className="text-white text-2xl font-semibold text-center mb-4 mt-6">
          Camera Permission Required
        </RNText>
        <RNText className="text-gray-400 text-sm text-center mb-8 px-4">
          Enable camera access to capture photos of work completed.
        </RNText>
        <Button onPress={requestPermission} variant="default" className="mb-3">
          <RNText className="text-white font-semibold">Enable Camera</RNText>
        </Button>
        <Button
          onPress={onClose}
          variant="outline"
          className="border-gray-600"
        >
          <RNText className="text-gray-300 font-semibold">Cancel</RNText>
        </Button>
      </View>
    );
  }

  // Camera ready
  return (
    <View style={{ flex: 1 }}>
      <CameraView
        ref={cameraRef}
        facing={facing}
        flash={flash}
        onCameraReady={handleCameraReady}
        style={{ flex: 1 }}
      >
        {/* Top Bar */}
        <View
          style={{
            paddingTop: insets.top + 12,
            backgroundColor: 'rgba(0, 0, 0, 0.3)'
          }}
          className="absolute top-0 left-0 right-0 px-4 flex-row justify-between items-center pb-3"
        >
          <View className="w-16" />
          <Button
            onPress={onDone}
            variant="default"
            style={{ backgroundColor: '#3B82F6' }}
            className="px-6"
          >
            <RNText className="text-white font-semibold">Done</RNText>
          </Button>
        </View>

        {/* Bottom Controls */}
        <View
          style={{
            paddingBottom: insets.bottom + 24,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            paddingTop: 16
          }}
          className="absolute bottom-0 left-0 right-0 px-6"
        >
          <View className="flex-row justify-between items-center mb-6">
            {/* Flash Toggle */}
            <TouchableOpacity
              onPress={toggleFlash}
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
              className="w-12 h-12 rounded-full items-center justify-center"
            >
              <Ionicons
                name={
                  flash === 'on'
                    ? 'flash'
                    : flash === 'auto'
                    ? 'flash-outline'
                    : 'flash-off'
                }
                size={24}
                color="#FFF"
              />
            </TouchableOpacity>

            {/* Camera Flip */}
            <TouchableOpacity
              onPress={toggleFacing}
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
              className="w-12 h-12 rounded-full items-center justify-center"
            >
              <Ionicons name="camera-reverse" size={24} color="#FFF" />
            </TouchableOpacity>

            {/* Photo Count Badge */}
            {capturedCount > 0 && (
              <View
                className={`px-3 py-1 rounded-full ${
                  type === 'before' ? 'bg-blue-500' : 'bg-green-500'
                }`}
              >
                <Text className="text-white font-bold">{capturedCount}</Text>
              </View>
            )}
            {capturedCount === 0 && <View className="w-16" />}
          </View>

          {/* Capture Button */}
          <TouchableOpacity
            onPress={handleTakePicture}
            disabled={!isCameraReady}
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#FFFFFF',
              borderWidth: 4,
              borderColor: '#D1D5DB',
              alignSelf: 'center'
            }}
            activeOpacity={0.8}
          />
        </View>
      </CameraView>
    </View>
  );
}
