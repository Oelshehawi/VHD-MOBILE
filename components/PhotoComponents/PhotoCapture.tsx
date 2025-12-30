import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { PhotoGrid } from './PhotoGrid';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { AttachmentRecord } from '@powersync/attachments';
import { PhotoType, showToast } from '@/utils/photos';
import { usePowerSync } from '@powersync/react-native';
import { useSystem } from '@/services/database/System';
import { DeletePhotoModal } from './DeletePhotoModal';
import { LoadingModal } from './LoadingModal';
import { FastImageViewer } from '@/components/common/FastImageViewer';
import { File, Paths } from 'expo-file-system';
import { checkAndStartBackgroundUpload } from '@/services/background/BackgroundUploadService';
import {
  logPhoto,
  logPhotoError,
  logDatabase,
  logDatabaseError,
} from '@/utils/DebugLogger';

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

// Define type for photo data from database
interface PhotosData {
  photos: string;
}

// Define max file size (20MB in bytes) - increased for better UX
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

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
  const [showCameraModal, setShowCameraModal] = useState(false);
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
    { uri: string; title?: string; type?: string }[]
  >([]);

  // Helper to resolve photo URLs - for pending photos we need to get the local file path
  const resolvePhotoUrl = useCallback(
    (photo: PhotoType): string => {
      // For non-pending photos, just return the URL
      if (photo.status !== 'pending' || !system?.attachmentQueue) {
        return photo.url || '';
      }

      try {
        // If we have a local_uri, use it directly - this should be the most reliable approach
        if (photo.local_uri) {
          return system.attachmentQueue.getLocalUri(photo.local_uri);
        }

        // Otherwise try with the URL if it's available
        if (!photo.url) return '';

        // If URL is just a filename, construct a path to the attachments directory
        const filename = photo.url.split('/').pop() || photo.url;
        return new File(Paths.document, 'attachments', filename).uri;
      } catch (error) {
        return photo.url || '';
      }
    },
    [system?.attachmentQueue]
  );

  // Helper to prepare gallery images (called lazily when gallery opens)
  const prepareGalleryImages = useCallback(() => {
    return photos.map((photo) => ({
      uri: resolvePhotoUrl(photo),
      title: `${type === 'before' ? 'Before' : 'After'} Photo`,
      type: type,
    }));
  }, [photos, type, resolvePhotoUrl]);

  // Helper function to update gallery when a photo is pressed in PhotoGrid
  const handlePhotoPress = (index: number) => {
    // First close any other open modals
    setShowModal(false);
    setPhotoToDelete(null);

    // Prepare gallery images with latest resolved URLs
    const images = prepareGalleryImages();
    setGalleryImages(images);

    // Then open the gallery at the selected index
    openGallery(index);
  };

  // Get subtitle for the gallery header
  const getGallerySubtitle = useCallback(
    (index: number) => {
      return `${type === 'before' ? 'Before' : 'After'} Photo ${index + 1} of ${
        photos.length
      }`;
    },
    [type, photos.length]
  );

  /**
   * Check if file size is within allowed limits using new File API
   */
  const checkFileSize = async (uri: string): Promise<boolean> => {
    try {
      const file = new File(uri);
      const size = file.size ?? 0;
      return file.exists && size <= MAX_FILE_SIZE;
    } catch (error) {
      console.error('Error checking file size:', error);
      return false;
    }
  };

  /**
   * Handle photo selection from the PhotoCaptureModal
   */
  const handlePhotoSelected = async (result: ImagePicker.ImagePickerResult) => {
    logPhoto('Photo selection started', {
      type,
      scheduleId,
      technicianId,
      canceled: result.canceled,
      assetsLength: result.assets?.length,
      isUploading,
      hasQueue: !!system?.attachmentQueue,
    });

    if (
      result.canceled ||
      !result.assets?.length ||
      isUploading ||
      !scheduleId ||
      !system?.attachmentQueue
    ) {
      logPhotoError('Photo selection early return', {
        canceled: result.canceled,
        noAssets: !result.assets?.length,
        isUploading,
        noScheduleId: !scheduleId,
        noQueue: !system?.attachmentQueue,
      });
      return;
    }

    try {
      setIsUploading(true);
      logPhoto('Starting photo upload process', {
        assetsCount: result.assets.length,
      });

      // Get the queue from system
      const queue = system.attachmentQueue;

      // Close the modal immediately to show the blocking UI
      setShowModal(false);

      // Check each photo's file size and filter out photos that are too large
      logPhoto('Starting file size validation', {
        assetsToCheck: result.assets.length,
      });
      const validationResults = await Promise.all(
        result.assets.map(async (asset, index) => {
          try {
            const isValidSize = await checkFileSize(asset.uri);
            logPhoto(`Asset ${index} validation`, {
              uri: asset.uri,
              isValidSize,
              width: asset.width,
              height: asset.height,
            });
            return { asset, isValidSize };
          } catch (error) {
            logPhotoError(`Asset ${index} validation failed`, {
              uri: asset.uri,
              error,
            });
            return { asset, isValidSize: false };
          }
        })
      );

      const validAssets = validationResults
        .filter((r) => r.isValidSize)
        .map((r) => r.asset);
      const invalidAssets = validationResults
        .filter((r) => !r.isValidSize)
        .map((r) => r.asset);

      logPhoto('File validation complete', {
        valid: validAssets.length,
        invalid: invalidAssets.length,
      });

      // Show error for oversized files
      if (invalidAssets.length > 0) {
        Alert.alert(
          'Files Too Large',
          `${invalidAssets.length} photo${
            invalidAssets.length > 1 ? 's' : ''
          } exceeds the 10MB size limit and will be skipped.`,
          [{ text: 'OK' }]
        );
      }

      // If no valid photos remain, stop here
      if (validAssets.length === 0) {
        logPhotoError('No valid assets to process', {
          totalAssets: result.assets.length,
        });
        showToast(
          'No photos were added - all files exceeded the 20MB size limit'
        );
        return;
      }

      // Prepare batch data for valid photos only
      logPhoto('Preparing photo data for batch save', {
        validAssets: validAssets.length,
      });
      const photoData = validAssets.map((asset) => ({
        sourceUri: asset.uri,
        scheduleId: scheduleId!,
        jobTitle: jobTitle,
        type: type,
        startDate: startDate,
        technicianId: technicianId,
      }));

      logPhoto('Photo data prepared', { photoDataCount: photoData.length });

      // Batch save all valid photos at once
      logPhoto('Starting batch save to queue');
      const savedAttachments = await queue.batchSavePhotosFromUri(photoData);
      logPhoto('Batch save completed', {
        savedCount: savedAttachments.length,
        savedIds: savedAttachments.map((a) => a.id),
      });

      if (savedAttachments.length > 0) {
        // Update the schedule with all attachment information at once
        logDatabase('Starting PowerSync transaction');
        try {
          await powerSync.writeTransaction(async (tx) => {
            logDatabase('Transaction started, getting existing photos');
            // Get existing photos
            const currentPhotosData = await tx.getAll<PhotosData>(
              `SELECT photos FROM schedules WHERE id = ?`,
              [scheduleId]
            );

            logDatabase('Current photos retrieved', {
              hasData: currentPhotosData.length > 0,
              photosExist:
                currentPhotosData.length > 0 && !!currentPhotosData[0].photos,
            });

            // Parse existing photos or create empty array
            let allPhotos: PhotoType[] = [];
            if (currentPhotosData.length > 0 && currentPhotosData[0].photos) {
              try {
                allPhotos = JSON.parse(currentPhotosData[0].photos);
                logDatabase('Parsed existing photos', {
                  existingCount: allPhotos.length,
                });
              } catch (e) {
                logDatabaseError('Failed to parse existing photos', e);
              }
            }

            // Create new photo objects for all attachments
            logDatabase('Creating new photo objects', {
              attachmentCount: savedAttachments.length,
            });
            const newPhotos: PhotoType[] = savedAttachments.map(
              (attachment) => ({
                _id: attachment.id,
                id: attachment.id,
                url: attachment.filename, // Store the filename to match with attachment table
                local_uri: attachment.local_uri, // Include local_uri for easy local file access
                type: type,
                timestamp: new Date().toISOString(),
                attachmentId: attachment.id,
                technicianId: technicianId,
                status: 'pending', // Mark as pending initially
              })
            );

            logDatabase('New photos created', {
              newPhotosCount: newPhotos.length,
              newPhotoIds: newPhotos.map((p) => p._id),
            });

            // Add new photos to existing ones
            const updatedPhotos = [...allPhotos, ...newPhotos];
            logDatabase('Photos merged', {
              existingCount: allPhotos.length,
              newCount: newPhotos.length,
              totalCount: updatedPhotos.length,
            });

            // Update schedules table once with all photos
            logDatabase('Updating schedules table');
            await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
              JSON.stringify(updatedPhotos),
              scheduleId,
            ]);
            logDatabase('Schedules table updated successfully');
          });
          logDatabase('PowerSync transaction completed successfully');
        } catch (transactionError) {
          logDatabaseError('PowerSync transaction failed', transactionError);
          throw transactionError;
        }

        // Start background upload process for photos
        logPhoto('Starting background upload service');
        try {
          await checkAndStartBackgroundUpload();
          logPhoto('Background upload service started successfully');
        } catch (uploadError) {
          logPhotoError(
            'Failed to start background upload service',
            uploadError
          );
        }
      }

      const successMessage = `Added ${savedAttachments.length} ${type} photo${
        savedAttachments.length > 1 ? 's' : ''
      } - uploading in background`;
      logPhoto('Photo save process completed successfully', {
        savedCount: savedAttachments.length,
        message: successMessage,
      });

      showToast(successMessage);
    } catch (error) {
      logPhotoError('Photo save process failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to save photos. Please try again.'
      );
    } finally {
      setIsUploading(false);
      logPhoto('Photo save process finished (finally block)');
    }
  };

  /**
   * Handle camera photos confirmed - format and pass to existing upload flow
   */
  const handleCameraPhotosConfirmed = async (photoUris: string[]) => {
    setShowCameraModal(false);
    if (photoUris.length === 0) return;

    try {
      // Transform camera URIs into ImagePicker.ImagePickerResult format
      const assets = await Promise.all(
        photoUris.map(async (uri) => {
          const file = new File(uri);

          // Get dimensions using expo-image-manipulator
          // manipulateAsync returns the image with dimensions
          const manipulated = await manipulateAsync(uri, [], {
            compress: 1,
            format: SaveFormat.JPEG,
          });

          return {
            uri,
            width: manipulated.width,
            height: manipulated.height,
            fileSize: file.size ?? 0,
            assetId: null,
            fileName: uri.split('/').pop() || 'photo.jpg',
            type: 'image' as const,
            exif: null,
            base64: null,
            duration: null,
            mimeType: 'image/jpeg',
          } as ImagePicker.ImagePickerAsset;
        })
      );

      const cameraResult: ImagePicker.ImagePickerResult = {
        canceled: false,
        assets,
      };

      // REUSE existing batch upload logic - NO DUPLICATION
      await handlePhotoSelected(cameraResult);
    } catch (error) {
      console.error('Error processing camera photos:', error);
      Alert.alert('Error', 'Failed to process photos. Please try again.');
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
  const handleDeleteRequest = (
    photoId: string,
    url: string,
    attachmentId?: string
  ) => {
    // First close any other modals that might be open
    setShowModal(false);
    setGalleryVisible(false);

    // Show delete confirmation dialog
    setPhotoToDelete({ id: photoId, url, attachmentId });
  };

  const openGallery = (photoIndex: number = 0) => {
    if (photos.length === 0) return;

    setGalleryIndex(photoIndex);
    setGalleryVisible(true);
  };

  // Calculate isLoading state
  const isLoading = (externalLoading || isUploading);

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
          onPress={() => {
            // Close any other open modals before showing this one
            setPhotoToDelete(null);
            setGalleryVisible(false);
            setShowModal(true);
          }}
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
        onPhotoPress={handlePhotoPress}
        currentScheduleId={scheduleId}
      />

      {/* Only render modals when they are actively visible */}
      {/* This prevents invisible overlays from blocking touch events */}
      {showModal && (
        <PhotoCaptureModal
          visible={showModal}
          onClose={() => {
            setShowModal(false);
          }}
          onPhotoSelected={handlePhotoSelected}
          onOpenCamera={() => setShowCameraModal(true)}
        />
      )}

      {showCameraModal && (
        <CameraCaptureModal
          visible={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onPhotosConfirmed={handleCameraPhotosConfirmed}
          type={type}
        />
      )}

      {photoToDelete !== null && (
        <DeletePhotoModal
          visible={!!photoToDelete}
          onClose={() => setPhotoToDelete(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
        />
      )}

      {galleryVisible && (
        <FastImageViewer
          images={galleryImages}
          imageIndex={galleryIndex}
          visible={galleryVisible}
          onRequestClose={() => setGalleryVisible(false)}
          swipeToCloseEnabled={true}
          doubleTapToZoomEnabled={true}
          title={jobTitle}
          getSubtitle={getGallerySubtitle}
        />
      )}

      {/* Only show loading modal when actually loading */}
      {isLoading && <LoadingModal visible={isLoading} type={type} />}
    </View>
  );
}
