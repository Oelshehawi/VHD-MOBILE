import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoGrid } from './PhotoGrid';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import ImageView from 'react-native-image-viewing';
import {
  AttachmentRecord,
  AttachmentState,
  ATTACHMENT_TABLE,
} from '@powersync/attachments';
import { PhotoType, showToast } from '@/utils/photos';
import { usePowerSync } from '@powersync/react-native';
import { useSystem } from '@/services/database/System';
import { DeletePhotoModal } from './DeletePhotoModal';
import { LoadingModal } from './LoadingModal';
import * as FileSystem from 'expo-file-system';

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

// Define type for query results
interface AttachmentOperation {
  attachmentId?: string;
}

// Define type for photo data from database
interface PhotosData {
  photos: string;
}

// Define type for queued attachment data
interface QueuedAttachment {
  id: string;
  filename: string;
  state: number;
  scheduleId?: string;
  [key: string]: any; // Allow for other properties
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
  const [isReady, setIsReady] = useState(false);
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

      // Close the modal immediately to show the blocking UI
      setShowModal(false);

      // Prepare batch data for all photos
      const photoData = result.assets.map((asset) => ({
        sourceUri: asset.uri,
        scheduleId: scheduleId!,
        jobTitle: jobTitle,
        type: type,
        startDate: startDate,
        technicianId: technicianId,
      }));

      // Batch save all photos at once
      const savedAttachments = await queue.batchSavePhotosFromUri(photoData);

      if (savedAttachments.length > 0) {
        // Update the schedule with all attachment information at once
        await powerSync.writeTransaction(async (tx) => {
          // Get existing photos
          const currentPhotosData = await tx.getAll<PhotosData>(
            `SELECT photos FROM schedules WHERE id = ?`,
            [scheduleId]
          );

          // Parse existing photos or create empty array
          let allPhotos: PhotoType[] = [];
          if (currentPhotosData.length > 0 && currentPhotosData[0].photos) {
            try {
              allPhotos = JSON.parse(currentPhotosData[0].photos);
            } catch (e) {
              // Silent error handling
            }
          }

          // Create new photo objects for all attachments
          const newPhotos: PhotoType[] = savedAttachments.map((attachment) => ({
            _id: attachment.id,
            id: attachment.id,
            url: attachment.filename, // Store the filename to match with attachment table
            type: type,
            timestamp: new Date().toISOString(),
            attachmentId: attachment.id,
            technicianId: technicianId,
          }));

          // Add new photos to existing ones
          const updatedPhotos = [...allPhotos, ...newPhotos];

          // Update schedules table once with all photos
          await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
            JSON.stringify(updatedPhotos),
            scheduleId,
          ]);
        });
      }

      showToast(
        `Added ${savedAttachments.length} ${type} photo${
          savedAttachments.length > 1 ? 's' : ''
        } - uploading in background`
      );
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to save photos. Please try again.'
      );
    } finally {
      setIsUploading(false);
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
            // Silent error handling
          }
        }

        // Update the schedules table with the filtered photos
        await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
          JSON.stringify(currentPhotos),
          scheduleId,
        ]);

        // Insert into delete_photo_operations table to record the deletion
        await tx.execute(
          `INSERT INTO delete_photo_operations (id, scheduleId, remote_uri) VALUES (?, ?, ?)`,
          [
            `del_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            scheduleId,
            photoUrl,
          ]
        );

        // Find and delete the attachment if it exists
        const attachments = await tx.getAll<AttachmentRecord>(
          `SELECT * FROM attachments WHERE id = ?`,
          [photoId]
        );

        if (attachments.length > 0 && system.attachmentQueue) {
          try {
            await system.attachmentQueue.delete(attachments[0]);
          } catch (attachmentError) {
            // Silent error handling, continue with deletion process
          }
        }
      });

      // Show success message for user feedback
      showToast('Photo deleted successfully');

      // Immediately clear the dialog
      setPhotoToDelete(null);
    } catch (error) {
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
