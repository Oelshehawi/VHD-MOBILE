import React, { useState, useEffect } from 'react';
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
import ImageView from 'react-native-image-viewing';

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
  scheduleId?: string;
}

export function PhotoCapture({
  technicianId,
  isLoading = false,
  photos = [],
  type,
  jobTitle,
  scheduleId,
}: PhotoCaptureProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<{
    id: string;
    url: string;
  } | null>(null);
  const powerSync = usePowerSync();

  // State for image gallery
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState<
    { uri: string; title?: string }[]
  >([]);

  // Prepare gallery images whenever photos change
  useEffect(() => {
    const images = photos.map((photo) => ({
      uri: photo.url,
      title: `${type === 'before' ? 'Before' : 'After'} Photo`,
    }));
    setGalleryImages(images);
  }, [photos, type]);

  const handlePhotoSelected = async (result: ImagePicker.ImagePickerResult) => {
    if (
      result.canceled ||
      !result.assets?.length ||
      isUploading ||
      !scheduleId
    ) {
      return;
    }

    try {
      setIsUploading(true);
      console.log('Starting photo upload process', {
        assetCount: result.assets.length,
        scheduleId,
        type,
      });

      // Process new photos with the new metadata approach
      for (const asset of result.assets) {
        if (!asset.base64) {
          throw new Error('No base64 data available for image');
        }

        const photoId = `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        const newPhoto = {
          id: photoId,
          url: `data:image/jpeg;base64,${asset.base64}`,
          timestamp: new Date().toISOString(),
          technicianId,
          type,
          status: 'pending' as const,
        };

        // Use the new PowerSync metadata approach for tracking operations
        await powerSync.writeTransaction(async (tx) => {
          // First get current photos to properly append
          const dbResult = await tx.getAll<{ photos: string }>(
            `SELECT photos FROM schedules WHERE id = ?`,
            [scheduleId]
          );

          const currentPhotos = dbResult?.[0]?.photos
            ? JSON.parse(dbResult[0].photos)
            : { before: [], after: [] };

          // Properly append to the correct photo array
          const updatedPhotos = {
            before:
              type === 'before'
                ? [
                    ...(Array.isArray(currentPhotos.before)
                      ? currentPhotos.before
                      : []),
                    newPhoto,
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
                    newPhoto,
                  ]
                : Array.isArray(currentPhotos.after)
                ? currentPhotos.after
                : [],
          };

          // Use the new json_insert approach with metadata
          await tx.execute(
            `UPDATE schedules SET 
              photos = ?, 
              _metadata = json_object('insert_photo', json(?))
            WHERE id = ?`,
            [
              JSON.stringify(updatedPhotos),
              JSON.stringify(newPhoto),
              scheduleId,
            ]
          );
        });
      }

      showToast(
        `Successfully added ${result.assets.length} photo${
          result.assets.length > 1 ? 's' : ''
        }`
      );
    } catch (error) {
      console.error('❌ Error handling photo:', error, {
        scheduleId,
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
    if (!photoToDelete || !scheduleId || !powerSync) return;

    try {
      await powerSync.writeTransaction(async (tx) => {
        const result = await tx.getAll<{ photos: string }>(
          `SELECT photos FROM schedules WHERE id = ?`,
          [scheduleId]
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

        // Create the new photos object without the deleted photo
        const updatedPhotos = {
          ...currentPhotos,
          [type]: currentPhotos[type].filter(
            (p: PhotoType) =>
              p.id !== photoToDelete.id && p._id !== photoToDelete.id
          ),
        };

        // Use the new metadata approach for delete tracking
        await tx.execute(
          `UPDATE schedules SET 
            photos = ?, 
            _metadata = json_object('delete_photo', json(?))
          WHERE id = ?`,
          [
            JSON.stringify(updatedPhotos),
            JSON.stringify({
              id: photoToDelete.id,
              type,
              url: photoToDelete.url,
              technicianId: photoToDeleteObj.technicianId,
              timestamp: new Date().toISOString(),
            }),
            scheduleId,
          ]
        );
      });

      showToast('Photo deleted successfully');
      setPhotoToDelete(null);
    } catch (error) {
      console.error('Error deleting photo:', error);
      Alert.alert('Error', 'Failed to delete photo. Please try again.');
    }
  };

  const handleDeleteRequest = (photoId: string, url: string) => {
    setPhotoToDelete({ id: photoId, url });
  };

  // Function to open the gallery
  const openGallery = (photoIndex: number = 0) => {
    if (photos.length === 0) return;

    setGalleryIndex(photoIndex);
    setGalleryVisible(true);
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
          {!scheduleId && ' (Save schedule first to enable photos)'}
        </Text>
      </View>

      <PhotoGrid
        photos={photos}
        pendingPhotos={photos.filter((p) => p.status === 'pending')}
        onDeletePhoto={handleDeleteRequest}
        onPhotoPress={openGallery}
      />

      <TouchableOpacity
        onPress={() => setShowModal(true)}
        disabled={isLoading || isUploading || !scheduleId}
        className={`p-4 rounded-lg flex-row justify-center items-center ${
          isLoading || isUploading || !scheduleId
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

      {/* Image Gallery Viewer */}
      <ImageView
        images={galleryImages}
        imageIndex={galleryIndex}
        visible={galleryVisible}
        onRequestClose={() => setGalleryVisible(false)}
        FooterComponent={({ imageIndex }) => (
          <View className='bg-black/70 p-2 w-full'>
            <Text className='text-white text-center font-medium'>
              {jobTitle}
            </Text>
            <Text className='text-gray-300 text-center text-sm'>
              {`${type === 'before' ? 'Before' : 'After'} Photo ${
                imageIndex + 1
              } of ${photos.length}`}
            </Text>
          </View>
        )}
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
