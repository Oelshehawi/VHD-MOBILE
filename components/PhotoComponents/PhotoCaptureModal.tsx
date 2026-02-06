import React from 'react';
import { View, Text, TouchableOpacity, Modal, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { requestMediaPermission } from '@/utils/photos';
import Ionicons from '@expo/vector-icons/Ionicons';

interface PhotoCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onPhotoSelected: (result: ImagePicker.ImagePickerResult) => void;
  onOpenCamera: () => void;
}

export function PhotoCaptureModal({
  visible,
  onClose,
  onPhotoSelected,
  onOpenCamera
}: PhotoCaptureModalProps) {
  const insets = useSafeAreaInsets();

  /**
   * Handle image selection from camera or gallery
   */
  const handleImageSelection = async (source: 'camera' | 'gallery') => {
    try {
      // If camera, open custom camera modal instead
      if (source === 'camera') {
        onClose();
        onOpenCamera();
        return;
      }

      // Gallery logic unchanged
      const hasPermission = await requestMediaPermission(source);
      if (!hasPermission) return;

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images',
        quality: 1,
        allowsEditing: false,
        exif: false,
        allowsMultipleSelection: true
      };

      const result = await ImagePicker.launchImageLibraryAsync(options);

      console.log(
        'PhotoCaptureModal - Selection result:',
        result.canceled ? 'Canceled' : `Selected ${result.assets?.length || 0} photos`
      );

      if (!result.canceled && result.assets) {
        // Log the first asset URI (safe to show in logs)
        if (result.assets.length > 0) {
          const firstAsset = result.assets[0];
          console.log('First asset details:', {
            uri: firstAsset.uri.split('/').pop(), // Just log filename part of URI for privacy
            width: firstAsset.width,
            height: firstAsset.height,
            fileSize: firstAsset.fileSize || 'unknown'
          });
        }

        // Pass the result to the parent component for processing
        onPhotoSelected(result);
      }
      onClose();
    } catch (error) {
      console.error('Photo selection error:', error);
      Alert.alert('Error', 'Failed to process selected photos. Please try again.');
    }
  };

  return (
    <Modal animationType='slide' transparent={true} visible={visible} onRequestClose={onClose}>
      <View className='flex-1 justify-end bg-black/50'>
        <View
          style={{
            backgroundColor: 'white',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 36)
          }}
        >
          <View className='w-10 h-1 bg-gray-300 rounded-full self-center mb-4' />

          <Text className='text-xl font-bold text-center mb-6 text-gray-900'>Add Photos</Text>

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
                <Text className='text-base font-semibold text-gray-900'>Take Photos</Text>
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
                <Text className='text-base font-semibold text-gray-900'>Choose from Gallery</Text>
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
            <Text className='text-base font-semibold text-gray-700'>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
