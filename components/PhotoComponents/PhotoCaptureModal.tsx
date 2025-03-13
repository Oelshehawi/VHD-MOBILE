import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { requestMediaPermission } from '@/utils/photos';
import { Ionicons } from '@expo/vector-icons';

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
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  // Animation when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 70,
        friction: 12,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  /**
   * Handle image selection from camera or gallery
   */
  const handleImageSelection = async (source: 'camera' | 'gallery') => {
    try {
      // Request permissions using our utility function
      const hasPermission = await requestMediaPermission(source);
      if (!hasPermission) return;

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images',
        quality: 1,
        allowsEditing: false,
        exif: false,
        allowsMultipleSelection: source === 'gallery',
      };

      const result = await (source === 'camera'
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));

      console.log(
        'PhotoCaptureModal - Selection result:',
        result.canceled
          ? 'Canceled'
          : `Selected ${result.assets?.length || 0} photos`
      );

      if (!result.canceled && result.assets) {
        // Log the first asset URI (safe to show in logs)
        if (result.assets.length > 0) {
          const firstAsset = result.assets[0];
          console.log('First asset details:', {
            uri: firstAsset.uri.split('/').pop(), // Just log filename part of URI for privacy
            width: firstAsset.width,
            height: firstAsset.height,
            fileSize: firstAsset.fileSize || 'unknown',
          });
        }

        // Pass the result to the parent component for processing
        onPhotoSelected(result);
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

  return (
    <Modal
      animationType='none'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className='flex-1 bg-black/50 justify-end'>
        <Animated.View
          style={{
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [Dimensions.get('window').height, 0],
                }),
              },
            ],
          }}
          className='bg-white rounded-t-3xl px-6 py-4 pt-4 pb-9 shadow-lg'
        >
          <View className='w-10 h-1 bg-gray-300 rounded-full self-center mb-4' />

          <Text className='text-xl font-bold text-center mb-6 text-gray-900'>
            Add Photos
          </Text>

          <View className='mb-6'>
            <TouchableOpacity
              onPress={() => handleImageSelection('camera')}
              className='bg-gray-50 rounded-xl p-4 mb-3 flex-row items-center border border-gray-200'
              activeOpacity={0.8}
            >
              <View className='w-12 h-12 rounded-full bg-blue-25 justify-center items-center mr-4'>
                <Ionicons name='camera-outline' size={24} color='#3B82F6' />
              </View>
              <View className='flex-1'>
                <Text className='text-base font-semibold text-gray-900'>
                  Take Photos
                </Text>
                <Text className='text-xs text-gray-500 mt-0.5'>
                  Use your camera to take new photos
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleImageSelection('gallery')}
              className='bg-gray-50 rounded-xl p-4 flex-row items-center border border-success-100'
              activeOpacity={0.8}
            >
              <View className='w-12 h-12 rounded-full bg-success-25 justify-center items-center mr-4'>
                <Ionicons name='images-outline' size={24} color='#10B981' />
              </View>
              <View className='flex-1'>
                <Text className='text-base font-semibold text-gray-900'>
                  Choose from Gallery
                </Text>
                <Text className='text-xs text-gray-500 mt-0.5'>
                  Select existing photos from your device
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={onClose}
            className='bg-gray-100 py-3.5 rounded-lg items-center'
          >
            <Text className='text-base font-semibold text-gray-700'>
              Cancel
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
