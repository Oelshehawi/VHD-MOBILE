import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { PhotoType } from '../../types';
import { createInvoicesApi } from '../../services/api';
import { useAuth } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';

interface PhotoCaptureProps {
  onPhotosCapture: (photos: PhotoType[]) => void;
  technicianId: string;
  isLoading?: boolean;
  existingPhotos?: PhotoType[];
  type: 'before' | 'after';
  jobTitle: string;
  invoiceId?: string;
}

export function PhotoCapture({
  onPhotosCapture,
  technicianId,
  isLoading = false,
  existingPhotos = [],
  type,
  jobTitle,
  invoiceId,
}: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<PhotoType[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { getToken } = useAuth();

  // Sync photos with existingPhotos prop
  useEffect(() => {
    setPhotos(existingPhotos || []);
  }, [existingPhotos]);

  const requestPermissions = async (type: 'camera' | 'gallery') => {
    if (Platform.OS !== 'web') {
      let permissionResult;
      if (type === 'camera') {
        permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permissionResult =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (permissionResult.status !== 'granted') {
        Alert.alert(
          'Permission Required',
          `${
            type === 'camera' ? 'Camera' : 'Gallery'
          } access is needed to take photos.`,
          [{ text: 'OK' }]
        );
        return false;
      }
      return true;
    }
    return true;
  };

  const handleImageSelection = async (source: 'camera' | 'gallery') => {
    if (uploadLoading) return; // Prevent multiple simultaneous uploads

    try {
      // Close modal first to prevent UI issues
      setShowModal(false);

      const hasPermission = await requestPermissions(source);
      if (!hasPermission) return;

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images',
        quality: 0.8,
        base64: true,
        allowsEditing: true,
        aspect: [4, 3],
        exif: false,
      };

      setUploadLoading(true); // Set loading before camera launch

      const result = await (source === 'camera'
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));

      if (result.canceled || !result.assets?.[0]?.base64) {
        setUploadLoading(false);
        return;
      }

      const token = await getToken();
      const api = createInvoicesApi(token);

      if (!api) throw new Error('Failed to create API client');

      const uploadResult = await api.uploadPhotos(
        [`data:image/jpeg;base64,${result.assets[0].base64}`],
        type,
        technicianId,
        jobTitle,
        invoiceId
      );

      if (uploadResult.data) {
        // Ensure we're not adding duplicate photos
        const newPhotos = uploadResult.data.filter(
          (newPhoto) =>
            !photos.some((existingPhoto) => existingPhoto.url === newPhoto.url)
        );

        if (newPhotos.length > 0) {
          const updatedPhotos = [...photos, ...newPhotos];
          setPhotos(updatedPhotos);
          onPhotosCapture(updatedPhotos);
        }
      }
    } catch (error) {
      console.error('Photo handling error:', error);
      Alert.alert('Error', 'Failed to process photo. Please try again.');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeletePhoto = async (photoUrl: string) => {
    try {
      const token = await getToken();
      const api = createInvoicesApi(token);
      if (!api) throw new Error('Failed to create API client');

      await api.deletePhoto(photoUrl, type, invoiceId);
      const updatedPhotos = photos.filter((photo) => photo.url !== photoUrl);
      setPhotos(updatedPhotos);
      onPhotosCapture(updatedPhotos);
    } catch (error) {
      console.error('Delete photo error:', error);
      Alert.alert('Error', 'Failed to delete photo. Please try again.');
    }
  };

  return (
    <ScrollView>
      <View className='flex flex-col gap-6 pb-6'>
        <View className='flex flex-col gap-2'>
          <Text className='text-xl font-semibold text-gray-900 dark:text-white'>
            {type === 'before' ? 'Before Photos' : 'After Photos'}
          </Text>
          <Text className='text-sm text-gray-500 dark:text-gray-400'>
            Take photos to document the{' '}
            {type === 'before' ? 'initial' : 'completed'} state
          </Text>
        </View>

        {/* Photos Grid */}
        {photos.length > 0 && (
          <View className='flex-row flex-wrap gap-3'>
            {photos.map((photo) => (
              <View
                key={`${photo.url}-${photo.timestamp}`}
                className='relative'
              >
                <Image
                  source={{ uri: photo.url }}
                  className='w-28 h-28 rounded-lg'
                />
                <TouchableOpacity
                  onPress={() => handleDeletePhoto(photo.url)}
                  className='absolute -top-2 -right-2 bg-red-500 rounded-full w-6 h-6 items-center justify-center'
                >
                  <Text className='text-white text-sm'>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Add Photo Button */}
        <TouchableOpacity
          onPress={() => setShowModal(true)}
          disabled={isLoading || uploadLoading}
          className={`p-4 rounded-lg flex-row justify-center items-center ${
            isLoading || uploadLoading ? 'bg-gray-300' : 'bg-darkGreen'
          }`}
        >
          {uploadLoading ? (
            <ActivityIndicator color='white' />
          ) : (
            <Text className='text-white font-medium text-lg'>Add Photo</Text>
          )}
        </TouchableOpacity>

        {/* Photo Selection Modal */}
        <Modal
          animationType='slide'
          transparent={true}
          visible={showModal}
          onRequestClose={() => setShowModal(false)}
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
                    Take Photo
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
                  onPress={() => setShowModal(false)}
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
      </View>
    </ScrollView>
  );
}
