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
    Alert.alert('Success', message);
  }
};

interface PhotoCaptureProps {
  technicianId: string;
  isLoading?: boolean;
  photos: PhotoType[];
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
    if (
      result.canceled ||
      !result.assets?.length ||
      isUploading ||
      !invoiceId
    ) {
      return;
    }

    try {
      setIsUploading(true);
      console.log('Starting photo upload process', {
        assetCount: result.assets.length,
        invoiceId,
        type,
      });

      await powerSync.writeTransaction(async (tx) => {
        console.log('Getting current photos from database');
        const dbResult = await tx.getAll<{ photos: string }>(
          `SELECT photos FROM invoices WHERE id = ?`,
          [invoiceId]
        );

        const currentPhotos = dbResult?.[0]?.photos
          ? JSON.parse(dbResult[0].photos)
          : { before: [], after: [], pendingOps: [] };

        console.log('Current photos state:', {
          before: currentPhotos.before?.length || 0,
          after: currentPhotos.after?.length || 0,
          pendingOps: currentPhotos.pendingOps?.length || 0,
        });

        // Process the compressed photos
        const newPhotos = result.assets.map((asset) => {
          if (!asset.base64) {
            throw new Error('No base64 data available for image');
          }

          const photoId = `${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`;

          return {
            id: photoId,
            url: `data:image/jpeg;base64,${asset.base64}`,
            timestamp: new Date().toISOString(),
            technicianId,
            type,
            status: 'pending' as const,
          };
        });

        // Create the updated photos object with careful handling of arrays
        const updatedPhotos = {
          before:
            type === 'before'
              ? [
                  ...(Array.isArray(currentPhotos.before)
                    ? currentPhotos.before
                    : []),
                  ...newPhotos,
                ]
              : Array.isArray(currentPhotos.before)
              ? currentPhotos.before
              : [],
          after:
            type === 'after'
              ? [
                  ...(Array.isArray(currentPhotos.after)
                    ? currentPhotos.after
                    : []),
                  ...newPhotos,
                ]
              : Array.isArray(currentPhotos.after)
              ? currentPhotos.after
              : [],
          pendingOps: [
            ...(Array.isArray(currentPhotos.pendingOps)
              ? currentPhotos.pendingOps
              : []),
            ...newPhotos.map((photo) => ({
              type: 'add',
              photoId: photo.id,
              photoType: type,
              technicianId,
              timestamp: new Date().toISOString(),
            })),
          ],
        };

        console.log('Updating photos in database', {
          newPhotoCount: newPhotos.length,
          updatedBefore: updatedPhotos.before.length,
          updatedAfter: updatedPhotos.after.length,
          updatedPendingOps: updatedPhotos.pendingOps.length,
        });

        // Update the database with explicit error handling
        try {
          await tx.execute(`UPDATE invoices SET photos = ? WHERE id = ?`, [
            JSON.stringify(updatedPhotos),
            invoiceId,
          ]);
          console.log('Successfully updated database');
        } catch (dbError) {
          console.error('Failed to update database:', dbError);
          throw dbError;
        }
      });

      showToast(
        `Successfully added ${result.assets.length} photo${
          result.assets.length > 1 ? 's' : ''
        }`
      );
    } catch (error) {
      console.error('❌ Error handling photo:', error, {
        invoiceId,
        type,
        technicianId,
      });
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

        const currentPhotos = JSON.parse(result[0].photos);
        const photoToDeleteObj = currentPhotos[type]?.find(
          (photo: PhotoType) =>
            photo.id === photoToDelete.id || photo._id === photoToDelete.id
        );

        if (!photoToDeleteObj) {
          console.error('Photo not found:', photoToDelete.id);
          return;
        }

        // Create the new photos object
        const newPhotos = {
          before:
            type === 'before'
              ? currentPhotos.before.filter(
                  (p: PhotoType) =>
                    p.id !== photoToDelete.id && p._id !== photoToDelete.id
                )
              : currentPhotos.before,
          after:
            type === 'after'
              ? currentPhotos.after.filter(
                  (p: PhotoType) =>
                    p.id !== photoToDelete.id && p._id !== photoToDelete.id
                )
              : currentPhotos.after,
          pendingOps: [
            ...(currentPhotos.pendingOps || []),
            {
              type: 'delete',
              photoId: photoToDelete.id,
              photoType: type,
              url: photoToDelete.url,
              technicianId: photoToDeleteObj.technicianId,
              timestamp: new Date().toISOString(),
            },
          ],
        };

        // Direct string update
        await tx.execute(`UPDATE invoices SET photos = ? WHERE id = ?`, [
          JSON.stringify(newPhotos),
          invoiceId,
        ]);
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
        statusBarTranslucent={true}
      >
        <View className='flex-1 bg-black/50 justify-center items-center p-4'>
          <View className='bg-white dark:bg-gray-800 rounded-xl p-5 w-[80%] max-w-[300px] shadow-xl'>
            <Text className='text-lg font-semibold text-gray-900 dark:text-white mb-3 text-center'>
              Delete Photo?
            </Text>
            <Text className='text-gray-600 dark:text-gray-300 mb-5 text-center text-sm'>
              This action cannot be undone.
            </Text>
            <View className='flex-row justify-center gap-3'>
              <TouchableOpacity
                onPress={() => setPhotoToDelete(null)}
                className='flex-1 px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700'
              >
                <Text className='text-gray-900 dark:text-white font-medium text-center text-sm'>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteConfirm}
                className='flex-1 px-4 py-2.5 rounded-lg bg-red-500'
              >
                <Text className='text-white font-medium text-center text-sm'>
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
