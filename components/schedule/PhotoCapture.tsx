import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
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

interface PendingPhoto {
  uri: string;
  base64: string;
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
  const [photos, setPhotos] = useState<PhotoType[]>(existingPhotos);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const { getToken } = useAuth();

  const requestCameraPermission = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera access is needed to take photos.',
          [{ text: 'OK' }]
        );
        return false;
      }
      return true;
    }
    return true;
  }, []);

  const handleTakePhoto = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsEditing: true,
        base64: true,
      });

      if (
        !result.canceled &&
        result.assets[0]?.uri &&
        result.assets[0]?.base64
      ) {
        setPendingPhotos([
          ...pendingPhotos,
          {
            uri: result.assets[0].uri,
            base64: result.assets[0].base64,
          },
        ]);
      }
    } catch (error) {
      console.error('Photo capture error:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    }
  };

  const handleUploadPhotos = async () => {
    if (pendingPhotos.length === 0) return;

    try {
      setUploadLoading(true);
      const token = await getToken();
      const api = createInvoicesApi(token);
      if (!api) throw new Error('Failed to create API client');

      // Upload all pending photos
      const base64Images = pendingPhotos.map(
        (photo) => `data:image/jpeg;base64,${photo.base64}`
      );
      const uploadResult = await api.uploadPhotos(
        base64Images,
        type,
        technicianId,
        jobTitle,
        invoiceId
      );

      // Handle the response data correctly
      const uploadedPhotos = uploadResult.data || [];
      const updatedPhotos = [...photos, ...uploadedPhotos];
      setPhotos(updatedPhotos);
      setPendingPhotos([]); // Clear pending photos after successful upload
      onPhotosCapture(updatedPhotos);
    } catch (error) {
      console.error('Photo upload error:', error);
      Alert.alert('Error', 'Failed to upload photos. Please try again.');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleRemovePendingPhoto = (index: number) => {
    setPendingPhotos(pendingPhotos.filter((_, i) => i !== index));
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

        {/* Pending Photos Section */}
        {pendingPhotos.length > 0 && (
          <View className='flex flex-col gap-4'>
            <Text className='text-base font-medium text-amber-600 dark:text-amber-400'>
              {pendingPhotos.length} Photo
              {pendingPhotos.length !== 1 ? 's' : ''} Ready to Upload
            </Text>
            <View className='flex-row flex-wrap gap-3'>
              {pendingPhotos.map((photo, index) => (
                <View key={index} className='relative'>
                  <Image
                    source={{ uri: photo.uri }}
                    className='w-28 h-28 rounded-lg'
                  />
                  <TouchableOpacity
                    onPress={() => handleRemovePendingPhoto(index)}
                    className='absolute -top-2 -right-2 bg-red-500 rounded-full w-6 h-6 items-center justify-center'
                  >
                    <Text className='text-white text-sm'>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Uploaded Photos Section */}
        {photos.length > 0 && (
          <View className='flex flex-col gap-4'>
            <Text className='text-base font-medium text-green-600 dark:text-green-400'>
              {photos.length} Photo{photos.length !== 1 ? 's' : ''} Uploaded
            </Text>
            <View className='flex-row flex-wrap gap-3'>
              {photos.map((photo, index) => (
                <View key={index} className='relative'>
                  <Image
                    source={{ uri: photo.url }}
                    className='w-28 h-28 rounded-lg'
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View className='flex flex-col gap-3'>
          <TouchableOpacity
            onPress={handleTakePhoto}
            disabled={isLoading || uploadLoading}
            className={`p-4 rounded-lg flex-row justify-center items-center ${
              isLoading || uploadLoading ? 'bg-gray-300' : 'bg-darkGreen'
            }`}
          >
            <Text className='text-white font-medium text-lg'>
              📸 Take Photo
            </Text>
          </TouchableOpacity>

          {pendingPhotos.length > 0 && (
            <TouchableOpacity
              onPress={handleUploadPhotos}
              disabled={isLoading || uploadLoading}
              className={`p-4 rounded-lg flex-row justify-center items-center ${
                isLoading || uploadLoading ? 'bg-gray-300' : 'bg-amber-500'
              }`}
            >
              {uploadLoading ? (
                <ActivityIndicator color='white' />
              ) : (
                <Text className='text-white font-medium text-lg'>
                  ⬆️ Upload {pendingPhotos.length} Photo
                  {pendingPhotos.length !== 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
