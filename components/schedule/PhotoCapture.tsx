import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Modal,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoGrid } from './PhotoGrid';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import ImageView from 'react-native-image-viewing';
import {
  PhotoType,
  PendingOp,
  PhotosData,
  showToast,
  extractBase64FromPickerResult,
  createPendingOp,
  parsePhotosData,
  findPhotoInCollection,
  createOptimisticPhoto,
} from '@/utils/photos';
import { usePowerSync } from '@powersync/react-native';

// Helper to add a delay for testing loading states
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Use PhotoType directly from utils/photos.ts
interface PhotoCaptureProps {
  technicianId: string;
  photos: PhotoType[];
  type: 'before' | 'after';
  jobTitle: string;
  scheduleId?: string;
  isLoading?: boolean;
}

export function PhotoCapture({
  technicianId,
  photos = [],
  type,
  jobTitle,
  scheduleId,
  isLoading: externalLoading = false,
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

  /**
   * Handle photo selection from the PhotoCaptureModal
   */
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

      // Process new photos with the pendingOps approach
      for (const asset of result.assets) {
        if (!asset.base64) {
          throw new Error('No base64 data available for image');
        }

        // Create photo object using utility function
        const newPhoto = createOptimisticPhoto(
          asset.base64,
          technicianId,
          type
        );

        // Add a short delay to see the loading state (remove in production if not needed)
        await delay(1500);

        // Create an optimistic update for immediate UI feedback
        await powerSync.writeTransaction(async (tx) => {
          // First get current photos to properly append
          const dbResult = await tx.getAll<{ photos: string }>(
            `SELECT photos FROM schedules WHERE id = ?`,
            [scheduleId]
          );

          // Parse photos data using utility function
          const currentPhotos = parsePhotosData(dbResult?.[0]?.photos);

          // Create pending operation for upload
          const pendingOp = createPendingOp('add', newPhoto, scheduleId);

          // Prepare updated photos object
          const updatedPhotos = {
            ...currentPhotos,
            [type]: [...currentPhotos[type], newPhoto],
            pendingOps: [...currentPhotos.pendingOps, pendingOp],
          };

          // Update database with optimistic changes
          await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
            JSON.stringify(updatedPhotos),
            scheduleId,
          ]);
        });
      }

      showToast(
        `Successfully added ${result.assets.length} photo${
          result.assets.length > 1 ? 's' : ''
        }`
      );
    } catch (error) {
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

  /**
   * Confirm and handle photo deletion
   */
  const handleDeleteConfirm = async () => {
    if (!photoToDelete || !scheduleId || !powerSync) return;

    try {
      // Keep track of the photo details for optimistic update
      const photoUrl = photoToDelete.url;
      const photoId = photoToDelete.id;

      // Add a short delay to see the loading state (remove in production if not needed)
      await delay(1500);

      // Optimistic update to immediately remove the photo from UI
      await powerSync.writeTransaction(async (tx) => {
        const result = await tx.getAll<{ photos: string }>(
          `SELECT photos FROM schedules WHERE id = ?`,
          [scheduleId]
        );

        // Parse photos data using utility function
        const currentPhotos = parsePhotosData(result?.[0]?.photos);

        // Find the photo to delete using utility function or direct URL match
        let photoToDeleteObj = findPhotoInCollection(currentPhotos[type], {
          id: photoId,
          url: photoUrl,
        });

        // If not found by ID/URL combination, try to find just by URL
        if (!photoToDeleteObj) {
          photoToDeleteObj =
            currentPhotos[type].find((p) => p.url === photoUrl) || null;
        }

        if (!photoToDeleteObj) {
          throw new Error('Photo not found');
        }

        // Create a complete photo object with all required fields for the PendingOp
        const completePhotoObj = {
          ...photoToDeleteObj,
          id: photoToDeleteObj.id || photoId || `gen_${Date.now()}`,
          type: photoToDeleteObj.type || type,
          technicianId: photoToDeleteObj.technicianId || technicianId,
          timestamp: photoToDeleteObj.timestamp || new Date().toISOString(),
        };

        // Create pending operation for deletion with explicit type
        const pendingOp = createPendingOp(
          'delete',
          completePhotoObj,
          scheduleId,
          type // Explicitly pass the photo type
        );

        // Create the new photos object without the deleted photo
        const updatedPhotos = {
          ...currentPhotos,
          [type]: currentPhotos[type].filter((p) => p.url !== photoUrl),
          pendingOps: [...currentPhotos.pendingOps, pendingOp],
        };

        // Update database with optimistic changes
        await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
          JSON.stringify(updatedPhotos),
          scheduleId,
        ]);
      });

      // Immediately clear the dialog
      setPhotoToDelete(null);

      // Show success message
      showToast('Photo deletion queued and will sync when online');
    } catch (error) {
      Alert.alert('Error', 'Failed to delete photo. Please try again.');
    }
  };

  /**
   * Request photo deletion
   */
  const handleDeleteRequest = (photoId: string, url: string) => {
    setPhotoToDelete({ id: photoId, url });
  };

  /**
   * Open the image gallery
   */
  const openGallery = (photoIndex: number = 0) => {
    if (photos.length === 0) return;

    setGalleryIndex(photoIndex);
    setGalleryVisible(true);
  };

  // Get the color theme based on photo type
  const getColorTheme = () => {
    return type === 'before'
      ? {
          light: '#dbeafe',
          medium: '#3b82f6',
          dark: '#1d4ed8',
          text: 'Before',
        }
      : {
          light: '#dcfce7',
          medium: '#10b981',
          dark: '#047857',
          text: 'After',
        };
  };

  const colorTheme = getColorTheme();
  const isLoading = externalLoading || isUploading;

  return (
    <View className='flex-1 mb-6'>
      {/* Header with Add Button */}
      <View className='flex-row justify-between items-center mb-3'>
        <View className='flex-row items-center'>
          <View
            className={`px-2 py-1 rounded-xl ${
              type === 'before' ? 'bg-blue-100' : 'bg-green-100'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                type === 'before' ? 'text-blue-800' : 'text-green-800'
              }`}
            >
              {type === 'before' ? 'Before' : 'After'}
            </Text>
          </View>

          <Text className='ml-1 text-base font-semibold'>
            {photos.length > 0 && `(${photos.length})`}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowModal(true)}
          className={`px-4 py-2 rounded-lg ${
            type === 'before' ? 'bg-blue-500' : 'bg-green-500'
          }`}
          disabled={isLoading}
        >
          <Text className='text-white font-semibold text-sm'>
            {isLoading ? 'Processing...' : 'Add Photos'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Photo grid */}
      <PhotoGrid
        photos={photos}
        onDeletePhoto={handleDeleteRequest}
        onPhotoPress={openGallery}
      />

      {/* Photo capture modal */}
      <PhotoCaptureModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onPhotoSelected={handlePhotoSelected}
      />

      {/* Delete confirmation */}
      <Modal
        transparent={true}
        visible={!!photoToDelete}
        onRequestClose={() => setPhotoToDelete(null)}
        animationType='fade'
      >
        <SafeAreaView className='flex-1 justify-center items-center bg-black/50'>
          <View className='bg-white rounded-2xl w-[85%] p-6 shadow-md'>
            <Text className='text-lg font-bold mb-3 text-center'>
              Delete Photo
            </Text>
            <Text className='text-sm text-gray-600 mb-5 text-center leading-5'>
              Are you sure you want to delete this photo? This cannot be undone.
            </Text>
            <View className='flex-row justify-end gap-3'>
              <TouchableOpacity
                onPress={() => setPhotoToDelete(null)}
                className='py-2 px-3'
              >
                <Text className='text-blue-500 font-semibold'>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteConfirm}
                className='bg-red-500 py-2 px-4 rounded-lg'
              >
                <Text className='text-white font-semibold'>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Image viewer gallery */}
      <ImageView
        images={galleryImages}
        imageIndex={galleryIndex}
        visible={galleryVisible}
        onRequestClose={() => setGalleryVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />

      {/* Loading indicator */}
      {isLoading && (
        <Modal transparent={true} visible={true} animationType='fade'>
          <View className='flex-1 justify-center items-center bg-black/30'>
            <View className='bg-white rounded-2xl p-6 w-4/5 items-center shadow-lg'>
              <ActivityIndicator
                size='large'
                color={type === 'before' ? '#3b82f6' : '#10b981'}
              />
              <Text className='text-base font-semibold mt-3 mb-1'>
                Processing...
              </Text>
              <Text className='text-sm text-gray-500 text-center'>
                Please wait while we process your photos.
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
