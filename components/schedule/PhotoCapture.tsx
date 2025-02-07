import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ToastAndroid,
  Platform,
  Modal,
  SafeAreaView,
} from 'react-native';
import { PhotoType } from '@/types';
import * as ImagePicker from 'expo-image-picker';
import { PhotoGrid } from './PhotoGrid';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import { usePowerSync } from '@powersync/react-native';

// Toast utility function
const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // For iOS, you might want to use a custom toast component
    // For now, we'll use Alert
    Alert.alert('Success', message);
  }
};

interface PhotoCaptureProps {
  technicianId: string;
  isLoading?: boolean;
  photos: PhotoType[]; // Already parsed photos for this type
  type: 'before' | 'after';
  jobTitle: string;
  invoiceId?: string;
}

export function PhotoCapture({
  technicianId,
  isLoading = false,
  photos = [],
  type,
  invoiceId,
}: PhotoCaptureProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<{
    id: string;
    url: string;
  } | null>(null);
  const powerSync = usePowerSync();

  const handlePhotoSelected = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0] || isUploading || !invoiceId)
      return;

    try {
      setIsUploading(true);
      const asset = result.assets[0];
      const base64 = await asset.base64;

      if (!base64) {
        throw new Error('Failed to get base64 data from image');
      }

      // Create temporary photo object with required fields
      const photoId = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      const tempPhoto: PhotoType = {
        id: photoId,
        url: `data:image/jpeg;base64,${base64}`,
        timestamp: new Date().toISOString(),
        technicianId,
        type,
        status: 'pending',
      };

      // Use PowerSync writeTransaction to update photos
      await powerSync.writeTransaction(async (tx) => {
        const dbResult = await tx.getAll<{ photos: string }>(
          `SELECT photos FROM invoices WHERE id = ?`,
          [invoiceId]
        );

        let currentPhotos;
        try {
          currentPhotos = dbResult?.[0]?.photos
            ? JSON.parse(dbResult[0].photos)
            : { before: [], after: [], pendingOps: [] };
        } catch (e) {
          console.error('Invalid photos JSON:', dbResult?.[0]?.photos);
          currentPhotos = { before: [], after: [], pendingOps: [] };
        }

        // Ensure arrays exist
        currentPhotos.before = Array.isArray(currentPhotos.before)
          ? currentPhotos.before
          : [];
        currentPhotos.after = Array.isArray(currentPhotos.after)
          ? currentPhotos.after
          : [];
        currentPhotos.pendingOps = Array.isArray(currentPhotos.pendingOps)
          ? currentPhotos.pendingOps
          : [];

        // Add new photo to the correct array
        currentPhotos[type] = [...currentPhotos[type], tempPhoto];

        // Store the operation type for toast timing
        currentPhotos.pendingOps.push({
          type: 'add',
          photoId: tempPhoto.id,
          technicianId,
          timestamp: new Date().toISOString(),
        });

        console.log('Saving photos:', {
          type,
          photoCount: currentPhotos[type].length,
          pendingOps: currentPhotos.pendingOps,
        });

        await tx.execute(
          `UPDATE invoices 
           SET photos = ?
           WHERE id = ?`,
          [JSON.stringify(currentPhotos), invoiceId]
        );
      });

      // Toast will be shown by BackendConnector after sync
    } catch (error) {
      console.error('Error handling photo:', error);
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to save photo. Please try again.'
      );
    } finally {
      setIsUploading(false);
      setShowModal(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!photoToDelete || !invoiceId || !powerSync) return;

    try {
      await powerSync.writeTransaction(async (tx) => {
        const result = await tx.getAll<{ photos: string }>(
          `SELECT photos FROM invoices WHERE id = ?`,
          [invoiceId]
        );

        if (!result?.[0]?.photos) {
          console.error('No valid photos data found');
          return;
        }

        let currentPhotos;
        try {
          currentPhotos = JSON.parse(result[0].photos);
        } catch (e) {
          console.error('Invalid photos JSON:', result[0].photos);
          currentPhotos = { before: [], after: [] };
        }

        console.log('Before deletion:', {
          type,
          photoId: photoToDelete.id,
          currentPhotos,
        });

        // Remove the photo from the appropriate array
        if (currentPhotos[type]) {
          const photoToDeleteObj = currentPhotos[type].find(
            (photo: PhotoType) =>
              photo.id === photoToDelete.id || photo._id === photoToDelete.id
          );

          if (!photoToDeleteObj) {
            console.error('Photo not found:', photoToDelete.id);
            return;
          }

          currentPhotos[type] = currentPhotos[type].filter(
            (photo: PhotoType) =>
              photo.id !== photoToDelete.id && photo._id !== photoToDelete.id
          );

          // Store the operation type for toast timing
          const pendingOps = currentPhotos.pendingOps || [];
          pendingOps.push({
            type: 'delete',
            photoId: photoToDelete.id,
            url: photoToDelete.url,
            technicianId: photoToDeleteObj.technicianId,
            timestamp: new Date().toISOString(),
          });
          currentPhotos.pendingOps = pendingOps;

          console.log('After deletion:', {
            type,
            photoId: photoToDelete.id,
            remainingPhotos: currentPhotos[type],
            pendingOps,
          });

          // Update the invoice with the new photos array
          await tx.execute(
            `UPDATE invoices 
             SET photos = ?
             WHERE id = ?`,
            [JSON.stringify(currentPhotos), invoiceId]
          );
        }
      });
    } catch (error) {
      console.error('Error deleting photo:', error);
      Alert.alert('Error', 'Failed to delete photo. Please try again.');
    } finally {
      setPhotoToDelete(null);
    }
  };

  const handleDeleteRequest = (photoId: string, url: string) => {
    setPhotoToDelete({ id: photoId, url });
  };

  return (
    <View className='flex flex-col gap-6 pb-6'>
      <View className='flex flex-col gap-2'>
        <Text className='text-xl font-semibold text-gray-900 dark:text-white'>
          {type === 'before' ? 'Before Photos' : 'After Photos'}
        </Text>
        <Text className='text-sm text-gray-500 dark:text-gray-400'>
          Take photos to document the{' '}
          {type === 'before' ? 'initial' : 'completed'} state
          {!invoiceId && ' (Save invoice first to enable photos)'}
        </Text>
      </View>

      <PhotoGrid
        photos={photos}
        pendingPhotos={photos.filter((p) => p.status === 'pending')}
        onDeletePhoto={handleDeleteRequest}
      />

      <TouchableOpacity
        onPress={() => setShowModal(true)}
        disabled={isLoading || isUploading || !invoiceId}
        className={`p-4 rounded-lg flex-row justify-center items-center ${
          isLoading || isUploading || !invoiceId
            ? 'bg-gray-300'
            : 'bg-darkGreen'
        }`}
      >
        <Text className='text-white font-medium text-lg'>
          {isUploading ? 'Uploading...' : 'Add Photo'}
        </Text>
      </TouchableOpacity>

      <PhotoCaptureModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onPhotoSelected={handlePhotoSelected}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        visible={!!photoToDelete}
        transparent
        animationType='fade'
        onRequestClose={() => setPhotoToDelete(null)}
      >
        <View className='flex-1 bg-black/75 justify-center items-center p-4'>
          <View className='bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl'>
            <View className='flex-row justify-between items-center mb-4'>
              <Text className='text-xl font-semibold text-gray-900 dark:text-white'>
                Delete Photo?
              </Text>
              <TouchableOpacity
                onPress={() => setPhotoToDelete(null)}
                className='rounded-full p-2 bg-gray-100 dark:bg-gray-700'
              >
                <Text className='text-gray-500 dark:text-gray-400 text-lg'>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
            <Text className='text-gray-600 dark:text-gray-300 mb-6'>
              Are you sure you want to delete this photo? This action cannot be
              undone.
            </Text>
            <View className='flex-row justify-end gap-3'>
              <TouchableOpacity
                onPress={() => setPhotoToDelete(null)}
                className='flex-1 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700'
              >
                <Text className='text-gray-900 dark:text-white font-medium text-center'>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteConfirm}
                className='flex-1 px-4 py-3 rounded-xl bg-red-500'
              >
                <Text className='text-white font-medium text-center'>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
