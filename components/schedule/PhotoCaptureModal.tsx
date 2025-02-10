import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

interface PhotoCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onPhotoSelected: (result: ImagePicker.ImagePickerResult) => void;
}

export function PhotoCaptureModal({
  visible,
  onClose,
  onPhotoSelected,
}: PhotoCaptureModalProps) {
  const handleImageSelection = async (source: 'camera' | 'gallery') => {
    try {
      const hasPermission = await requestPermissions(source);
      if (!hasPermission) return;

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images',
        quality: 0.5,
        base64: true,
        allowsEditing: false,
        aspect: source === 'camera' ? [4, 3] : undefined,
        exif: false,
        allowsMultipleSelection: source === 'gallery',
      };

      const result = await (source === 'camera'
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));

      if (!result.canceled) {
        // Handle multiple assets for gallery or single asset for camera
        const processedResult = { ...result };

        if (Platform.OS === 'ios') {
          // Process each asset
          processedResult.assets = await Promise.all(
            result.assets.map(async (asset) => {
              if (!asset.base64) {
                try {
                  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
                    encoding: FileSystem.EncodingType.Base64,
                  });
                  return { ...asset, base64 };
                } catch (error) {
                  console.error(
                    'Error converting to base64:',
                    error,
                    asset.uri
                  );
                  return asset;
                }
              }
              return asset;
            })
          );
        }

        onPhotoSelected(processedResult);
      }
      onClose();
    } catch (error) {
      console.error('Photo selection error:', error);
      Alert.alert(
        'Error',
        'Failed to process selected photos. Please try again.'
      );
    }
  };

  const requestPermissions = async (type: 'camera' | 'gallery') => {
    if (Platform.OS !== 'web') {
      const permissionResult =
        type === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        Alert.alert(
          'Permission Required',
          `${
            type === 'camera' ? 'Camera' : 'Gallery'
          } access is needed to take photos.`
        );
        return false;
      }
      return true;
    }
    return true;
  };

  return (
    <Modal
      animationType='slide'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className='flex-1 justify-end bg-black/50'>
        <View className='bg-gray-900 rounded-t-3xl p-6'>
          <View className='flex-col gap-4'>
            <Text className='text-white text-xl font-bold text-center mb-4'>
              Add Photo
            </Text>

            <TouchableOpacity
              onPress={() => handleImageSelection('camera')}
              className='bg-darkGreen p-4 rounded-xl flex-row items-center justify-center space-x-2'
            >
              <Text className='text-2xl'>📸</Text>
              <Text className='text-white text-lg font-semibold'>
                Take Photos
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleImageSelection('gallery')}
              className='bg-blue-500 p-4 rounded-xl flex-row items-center justify-center space-x-2'
            >
              <Text className='text-2xl'>🖼️</Text>
              <Text className='text-white text-lg font-semibold'>
                Choose from Gallery
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              className='bg-gray-700 p-4 rounded-xl mt-2'
            >
              <Text className='text-white text-lg font-semibold text-center'>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
