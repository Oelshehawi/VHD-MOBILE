import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoGrid } from './PhotoGrid';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import ImageView from 'react-native-image-viewing';
import {
  ATTACHMENT_TABLE,
  AttachmentRecord,
  AttachmentState,
} from '@powersync/attachments';
import {
  PhotoType,
  showToast,
  parsePhotosData,
  findPhotoInCollection,
  recordPhotoDeleteOperation,
} from '@/utils/photos';
import { usePowerSync } from '@powersync/react-native';
import { useSystem } from '@/services/database/System';
import { DeletePhotoModal } from './DeletePhotoModal';
import { LoadingModal } from './LoadingModal';
import * as FileSystem from 'expo-file-system';

// Enhanced PhotoType to include attachment-related fields
interface EnhancedPhotoType extends PhotoType {
  attachmentId?: string;
}

// Define extended attachment type locally
interface ExtendedAttachmentRecord extends AttachmentRecord {
  scheduleId?: string;
  jobTitle?: string;
  type?: 'before' | 'after';
  startDate?: string;
}

// Use PhotoType directly from utils/photos.ts
interface PhotoCaptureProps {
  technicianId: string;
  photos: PhotoType[];
  type: 'before' | 'after';
  jobTitle: string;
  scheduleId?: string;
  isLoading?: boolean;
  startDate?: string;
}

export function PhotoCapture({
  technicianId,
  photos = [],
  type,
  scheduleId,
  jobTitle,
  startDate,
  isLoading: externalLoading = false,
}: PhotoCaptureProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<{
    id: string;
    url: string;
    attachmentId?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const powerSync = usePowerSync();
  const system = useSystem();

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
      !scheduleId ||
      !system?.attachmentQueue
    ) {
      return;
    }

    try {
      setIsUploading(true);

      // Get the queue from system
      const queue = system.attachmentQueue;

      // Array to store the new photo objects
      const newPhotos: EnhancedPhotoType[] = [];

      // Process all photos directly from URI without base64 conversion
      for (const asset of result.assets) {
        try {
          // Get file info to check if it exists
          const fileInfo = await FileSystem.getInfoAsync(asset.uri);
          if (!fileInfo.exists) {
            console.error(`File does not exist: ${asset.uri}`);
            continue;
          }

          // Use the direct URI method instead of reading and converting to base64
          const attachmentRecord = (await queue.savePhotoFromUri(
            asset.uri,
            scheduleId,
            jobTitle,
            type,
            startDate,
            technicianId
          )) as ExtendedAttachmentRecord;

          // Create a new photo object with the attachment reference
          const newPhoto: EnhancedPhotoType = {
            id: `photo_${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 9)}`,
            url: `local://${attachmentRecord.id}`, // Local URL scheme that will be resolved later
            timestamp: new Date().toISOString(),
            technicianId: technicianId,
            type: type,
            status: 'pending',
            attachmentId: attachmentRecord.id,
          };

          newPhotos.push(newPhoto);
        } catch (assetError) {
          console.error('Error processing photo asset:', assetError);
        }
      }

      // If we have new photos, update the database
      if (newPhotos.length > 0) {
        await powerSync.writeTransaction(async (tx) => {
          // Get current photos data
          const result = await tx.getAll<{ photos: string }>(
            `SELECT photos FROM schedules WHERE id = ?`,
            [scheduleId]
          );

          // Parse current photos
          const currentPhotos = parsePhotosData(result?.[0]?.photos);

          // Add new photos to the existing photos array
          const updatedPhotos = {
            ...currentPhotos,
            photos: [...currentPhotos.photos, ...newPhotos],
          };

          // Update the photos in the database
          await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
            JSON.stringify(updatedPhotos),
            scheduleId,
          ]);
        });
      }

      // Show success message for UI feedback
      showToast(
        `Added ${newPhotos.length} photo${
          newPhotos.length > 1 ? 's' : ''
        } - uploading in background`
      );
    } catch (error) {
      console.error('Error handling selected photos:', error);
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
    if (!photoToDelete || !scheduleId || !powerSync || isDeleting) return;

    try {
      // Set deleting state to true to disable the button
      setIsDeleting(true);

      // Keep track of the photo details for optimistic update
      const photoUrl = photoToDelete.url;
      const photoId = photoToDelete.id;
      const attachmentId = photoToDelete.attachmentId;

      // Delete the photo in a transaction
      await powerSync.writeTransaction(async (tx) => {
        const result = await tx.getAll<{ photos: string }>(
          `SELECT photos FROM schedules WHERE id = ?`,
          [scheduleId]
        );

        // Parse photos data using utility function
        const currentPhotos = parsePhotosData(result?.[0]?.photos);

        // Find the photo to delete using utility function or direct URL match
        let photoToDeleteObj = findPhotoInCollection(currentPhotos.photos, {
          id: photoId,
          url: photoUrl,
        }) as EnhancedPhotoType | null;

        // If not found by ID/URL combination, try to find just by URL
        if (!photoToDeleteObj) {
          photoToDeleteObj =
            (currentPhotos.photos.find(
              (p) => p.url === photoUrl
            ) as EnhancedPhotoType) || null;
        }

        if (!photoToDeleteObj) {
          throw new Error('Photo not found');
        }

        // Create a complete photo object with all required fields
        const completePhotoObj: EnhancedPhotoType = {
          ...photoToDeleteObj,
          id: photoToDeleteObj.id || photoId || `gen_${Date.now()}`,
          type: photoToDeleteObj.type || type,
          technicianId: photoToDeleteObj.technicianId || technicianId,
          timestamp: photoToDeleteObj.timestamp || new Date().toISOString(),
          attachmentId: photoToDeleteObj.attachmentId || attachmentId,
        };

        // Create the new photos object without the deleted photo
        const updatedPhotos = {
          ...currentPhotos,
          photos: currentPhotos.photos.filter((p) => p.url !== photoUrl),
        };

        // 1. Insert into delete_photo_operations table (insertOnly table for tracking deletions)
        await recordPhotoDeleteOperation(
          tx,
          scheduleId,
          completePhotoObj.id,
          technicianId,
          completePhotoObj.type
        );

        // 2. Update database with optimistic changes to the photos array
        await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
          JSON.stringify(updatedPhotos),
          scheduleId,
        ]);

        // Delete the attachment if it exists and is a local attachment
        if (
          attachmentId &&
          photoUrl.startsWith('local://') &&
          system &&
          system.attachmentQueue
        ) {
          try {
            // Create a mock AttachmentRecord to delete
            const attachmentRecord: AttachmentRecord = {
              id: attachmentId,
              filename: `${type}_photo.jpg`,
              state: 'synced' as unknown as AttachmentState,
              timestamp: Date.now(),
              size: 0,
            };

            // The delete method might need the transaction
            await system.attachmentQueue.delete(attachmentRecord, tx);
            console.log(`Deleted attachment with ID: ${attachmentId}`);
          } catch (deleteError) {
            console.error('Error deleting attachment:', deleteError);
          }
        } else if (attachmentId) {
          // If no attachment system or non-local URL, just delete from attachments table
          await tx.execute(`DELETE FROM ${ATTACHMENT_TABLE} WHERE id = ?`, [
            attachmentId,
          ]);
        }
      });

      // Show success message
      showToast('Photo deleted successfully');

      // Immediately clear the dialog
      setPhotoToDelete(null);
    } catch (error) {
      console.error('Error deleting photo:', error);
      Alert.alert('Error', 'Failed to delete photo. Please try again.');
    } finally {
      // Reset deleting state
      setIsDeleting(false);
    }
  };

  /**
   * Request photo deletion
   */
  const handleDeleteRequest = (
    photoId: string,
    url: string,
    attachmentId?: string
  ) => {
    // Show delete confirmation dialog
    setPhotoToDelete({ id: photoId, url, attachmentId });
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
        currentScheduleId={scheduleId}
      />

      {/* Photo capture modal */}
      <PhotoCaptureModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onPhotoSelected={handlePhotoSelected}
      />

      {/* Delete confirmation */}
      <DeletePhotoModal
        visible={!!photoToDelete}
        onClose={() => setPhotoToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />

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
      <LoadingModal visible={isLoading} type={type} />
    </View>
  );
}
