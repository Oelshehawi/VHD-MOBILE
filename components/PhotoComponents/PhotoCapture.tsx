import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoGrid } from './PhotoGrid';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import ImageView from 'react-native-image-viewing';
import { AttachmentRecord } from '@powersync/attachments';
import { PhotoType, showToast } from '@/utils/photos';
import { usePowerSync } from '@powersync/react-native';
import { useSystem } from '@/services/database/System';
import { DeletePhotoModal } from './DeletePhotoModal';
import { LoadingModal } from './LoadingModal';
import * as FileSystem from 'expo-file-system';

// Enhanced PhotoType to include attachment-related fields
interface EnhancedPhotoType extends PhotoType {
  attachmentId?: string;
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
  onPhotosAdded?: (newPhotos: PhotoType[]) => void;
}

// Define type for query results
interface AttachmentOperation {
  attachmentId?: string;
}

// Define type for photo data from database
interface PhotosData {
  photos: string;
}

export function PhotoCapture({
  technicianId,
  photos = [],
  type,
  scheduleId,
  jobTitle,
  startDate,
  isLoading: externalLoading = false,
  onPhotosAdded,
}: PhotoCaptureProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<{
    id: string;
    url: string;
    attachmentId?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const powerSync = usePowerSync();
  const system = useSystem();

  // State for image gallery
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState<
    { uri: string; title?: string }[]
  >([]);

  // Mark component as ready after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

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

      // Begin transaction to update the schedules table
      await powerSync.writeTransaction(async (tx) => {
        // First, get the current photos JSON from the schedules table
        const currentPhotosData = await tx.getAll<PhotosData>(
          `SELECT photos FROM schedules WHERE id = ?`,
          [scheduleId]
        );

        // Parse the current photos
        let currentPhotos: PhotoType[] = [];
        if (currentPhotosData.length > 0 && currentPhotosData[0].photos) {
          try {
            currentPhotos = JSON.parse(
              currentPhotosData[0].photos
            ) as PhotoType[];
          } catch (e) {
            console.error('Error parsing existing photos:', e);
            currentPhotos = [];
          }
        }

        // Process all photos first and add them to the arrays
        for (const asset of result.assets) {
          try {
            // Get file info to check if it exists
            const fileInfo = await FileSystem.getInfoAsync(asset.uri);
            if (!fileInfo.exists) {
              console.error(`File does not exist: ${asset.uri}`);
              continue;
            }

            // Create a unique ID with timestamp to ensure uniqueness
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 9);
            const newPhotoId = `local_${timestamp}_${randomStr}`;

            // Create a new photo object with explicit pending status
            const newPhoto: PhotoType = {
              _id: newPhotoId,
              id: newPhotoId,
              url: asset.uri,
              type: type,
              timestamp: new Date().toISOString(),
              status: 'pending',
              technicianId: technicianId,
            };

            console.log(
              `Created new photo with ID ${newPhotoId} and status pending`
            );

            // Add to newPhotos array for UI feedback
            newPhotos.push(newPhoto as EnhancedPhotoType);

            // Add to current photos array for database update
            currentPhotos.push(newPhoto);
          } catch (assetError) {
            console.error('Error processing photo asset:', assetError);
          }
        }

        // Update the schedules table with all new photos at once
        await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
          JSON.stringify(currentPhotos),
          scheduleId,
        ]);
      });

      // Close the modal immediately after updating the schedules table
      setShowModal(false);

      // Notify parent component of new photos BEFORE starting upload
      if (onPhotosAdded && newPhotos.length > 0) {
        console.log(`Notifying parent of ${newPhotos.length} new photos`);
        onPhotosAdded(newPhotos);
      }

      // After a short delay, reset the uploading state
      // to hide the loading indicator, while still showing the pending state on photos
      setTimeout(() => {
        setIsUploading(false);
      }, 1000);

      // After notifying parent, queue the attachments
      // This happens outside the transaction to prevent locking issues
      for (const asset of result.assets) {
        try {
          await queue.savePhotoFromUri(
            asset.uri,
            scheduleId,
            jobTitle,
            type,
            startDate,
            technicianId
          );
        } catch (uploadError) {
          console.error('Error queuing photo for upload:', uploadError);
          // Continue processing other photos even if one fails
        }
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
      setIsUploading(false);
      setShowModal(false);
    }
  };

  /**
   * Confirm and handle photo deletion
   */
  const handleDeleteConfirm = async () => {
    if (
      !photoToDelete ||
      !scheduleId ||
      !powerSync ||
      !system?.attachmentQueue ||
      isDeleting
    )
      return;

    try {
      // Set deleting state to true to disable the button
      setIsDeleting(true);

      // Keep track of the photo details for optimistic update
      const photoUrl = photoToDelete.url;
      const photoId = photoToDelete.id;

      // Begin a transaction to ensure atomicity
      await powerSync.writeTransaction(async (tx) => {
        // First, get the current photos JSON from the schedules table
        const currentPhotosData = await tx.getAll<PhotosData>(
          `SELECT photos FROM schedules WHERE id = ?`,
          [scheduleId]
        );

        // Parse the current photos and filter out the deleted photo
        let currentPhotos: PhotoType[] = [];
        if (currentPhotosData.length > 0 && currentPhotosData[0].photos) {
          try {
            currentPhotos = JSON.parse(
              currentPhotosData[0].photos
            ) as PhotoType[];
            // Remove the photo being deleted
            currentPhotos = currentPhotos.filter(
              (photo: PhotoType) => photo._id !== photoId
            );
          } catch (e) {
            console.error('Error parsing existing photos:', e);
          }
        }

        // Update the schedules table with the filtered photos
        await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
          JSON.stringify(currentPhotos),
          scheduleId,
        ]);

        // Insert into delete_photo_operations table to record the deletion
        // This will be synced to the server which will handle both Cloudinary and DB deletion
        await tx.execute(
          `INSERT INTO delete_photo_operations (id, scheduleId, remote_uri) VALUES (?, ?, ?)`,
          [
            `del_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            scheduleId,
            photoUrl,
          ]
        );

        // Next, try to find the attachment record by looking up the attachment ID
        // from the add_photo_operations table using the cloudinary URL
        const attachmentOperations = await tx.getAll<AttachmentOperation>(
          `SELECT attachmentId FROM add_photo_operations WHERE cloudinaryUrl = ? AND scheduleId = ?`,
          [photoUrl, scheduleId]
        );

        if (
          attachmentOperations.length > 0 &&
          attachmentOperations[0]?.attachmentId
        ) {
          const attachmentId = attachmentOperations[0].attachmentId;

          // Find the attachment record
          const attachments = await tx.getAll<AttachmentRecord>(
            `SELECT * FROM attachments WHERE id = ?`,
            [attachmentId]
          );

          if (attachments.length > 0 && system.attachmentQueue) {
            // We have the attachment record, so we can delete it from the local queue
            try {
              // We've already confirmed attachmentQueue exists and typed the attachment properly
              await system.attachmentQueue.delete(attachments[0]);
              console.log(`Deleted attachment record for ${photoUrl}`);
            } catch (attachmentError) {
              console.error(
                'Error deleting attachment record:',
                attachmentError
              );
              // Continue with the deletion process even if attachment deletion fails
            }
          } else {
            console.log(`No attachment record found for ID ${attachmentId}`);
          }
        } else {
          console.log(`No attachment ID found for URL ${photoUrl}`);
        }
      });

      // Show success message for user feedback
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
  const handleDeleteRequest = (photoId: string, url: string) => {
    // Show delete confirmation dialog
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

  const isLoading = (isReady && externalLoading) || isUploading;

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

      {/* Loading indicator - only show when component is ready */}
      {isReady && <LoadingModal visible={isLoading} type={type} />}
    </View>
  );
}
