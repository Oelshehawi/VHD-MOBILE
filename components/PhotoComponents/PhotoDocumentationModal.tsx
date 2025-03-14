import { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { PhotoCapture } from '../PhotoComponents/PhotoCapture';
import { JobPhotoHistory } from './JobPhotoHistory';
import { parsePhotosData, PhotoType } from '@/utils/photos';
import { useQuery } from '@powersync/react-native';

interface PhotoDocumentationModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  jobTitle: string;
  technicianId: string;
  location: string;
  startDate: string;
}

// Tab type for the modal navigation
type TabType = 'before' | 'after' | 'history';

export function PhotoDocumentationModal({
  visible,
  onClose,
  scheduleId,
  jobTitle,
  technicianId,
  startDate,
}: PhotoDocumentationModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('before');

  // Track pending uploads with completely separate state arrays
  const [pendingBeforePhotos, setPendingBeforePhotos] = useState<PhotoType[]>(
    []
  );
  const [pendingAfterPhotos, setPendingAfterPhotos] = useState<PhotoType[]>([]);

  // Use refs to track the current state without causing re-renders
  const pendingBeforePhotosRef = useRef<PhotoType[]>([]);
  const pendingAfterPhotosRef = useRef<PhotoType[]>([]);
  const dbBeforePhotosRef = useRef<PhotoType[]>([]);
  const dbAfterPhotosRef = useRef<PhotoType[]>([]);

  // Update refs when state changes
  useEffect(() => {
    pendingBeforePhotosRef.current = pendingBeforePhotos;
  }, [pendingBeforePhotos]);

  useEffect(() => {
    pendingAfterPhotosRef.current = pendingAfterPhotos;
  }, [pendingAfterPhotos]);

  // Query photos directly from the schedules table
  const { data, isLoading: isQueryLoading } = useQuery(
    `SELECT photos FROM schedules WHERE id = ?`,
    [scheduleId]
  );

  // Parse photos data with useMemo to avoid unnecessary processing
  const parsedPhotosData = useMemo(() => {
    if (!data || data.length === 0) return { photos: [] };

    try {
      return parsePhotosData(data[0]);
    } catch (error) {
      console.error('Error parsing photos data:', error);
      return { photos: [] };
    }
  }, [data]);

  // Filter database photos by type
  const dbBeforePhotos = useMemo(() => {
    const photos = parsedPhotosData.photos.filter(
      (photo) => photo.type === 'before'
    );
    dbBeforePhotosRef.current = photos;
    return photos;
  }, [parsedPhotosData]);

  const dbAfterPhotos = useMemo(() => {
    const photos = parsedPhotosData.photos.filter(
      (photo) => photo.type === 'after'
    );
    dbAfterPhotosRef.current = photos;
    return photos;
  }, [parsedPhotosData]);

  // Effect to clean up pending photos when they've been successfully uploaded to cloudinary
  // Uses a callback approach to avoid dependency on state
  useEffect(() => {
    const cleanup = () => {
      const before = dbBeforePhotosRef.current;
      const after = dbAfterPhotosRef.current;
      const pendingBefore = pendingBeforePhotosRef.current;
      const pendingAfter = pendingAfterPhotosRef.current;

      if (before.length > 0 && pendingBefore.length > 0) {
        // Check which local IDs now have cloudinary URLs in the database
        const uploadedPhotoIds = new Set();

        // Get all photos that have cloudinary URLs
        before.forEach((photo) => {
          if (photo.url?.includes('cloudinary')) {
            uploadedPhotoIds.add(photo.id);
          }
        });

        // Remove pending photos that now have cloudinary URLs
        const filteredBefore = pendingBefore.filter((pendingPhoto) => {
          return !uploadedPhotoIds.has(pendingPhoto.id);
        });

        if (filteredBefore.length !== pendingBefore.length) {
          setPendingBeforePhotos(filteredBefore);
        }
      }

      if (after.length > 0 && pendingAfter.length > 0) {
        const uploadedPhotoIds = new Set();

        after.forEach((photo) => {
          if (photo.url?.includes('cloudinary')) {
            uploadedPhotoIds.add(photo.id);
          }
        });

        const filteredAfter = pendingAfter.filter((pendingPhoto) => {
          return !uploadedPhotoIds.has(pendingPhoto.id);
        });

        if (filteredAfter.length !== pendingAfter.length) {
          setPendingAfterPhotos(filteredAfter);
        }
      }
    };

    // Run cleanup when data changes
    cleanup();

    // Also set up interval for periodic cleanup
    if (visible) {
      const intervalId = setInterval(cleanup, 5000); // Check every 5 seconds
      return () => clearInterval(intervalId);
    }
  }, [data, visible]); // Only depend on data changes and visibility

  // Combine database photos with pending photos
  const beforePhotos = useMemo(() => {
    // First, get the list of photo IDs from the database
    const dbPhotoIds = new Set(dbBeforePhotos.map((photo) => photo.id));

    // Get list of cloudinary URLs to avoid duplicates
    const cloudinaryUrls = new Set();
    dbBeforePhotos.forEach((photo) => {
      if (photo.url?.includes('cloudinary')) {
        cloudinaryUrls.add(photo.url);
      }
    });

    // Filter out any pending photos that now exist in the database or have cloudinary URLs
    const filteredPending = pendingBeforePhotos.filter(
      (photo) =>
        !dbPhotoIds.has(photo.id) &&
        !photo.url?.includes('cloudinary') && // ensure it's a local URL
        !cloudinaryUrls.has(photo.url) // avoid duplicates
    );

    // Concatenate the filtered pending photos with the database photos
    return [...dbBeforePhotos, ...filteredPending];
  }, [dbBeforePhotos, pendingBeforePhotos]);

  const afterPhotos = useMemo(() => {
    const dbPhotoIds = new Set(dbAfterPhotos.map((photo) => photo.id));

    // Get list of cloudinary URLs to avoid duplicates
    const cloudinaryUrls = new Set();
    dbAfterPhotos.forEach((photo) => {
      if (photo.url?.includes('cloudinary')) {
        cloudinaryUrls.add(photo.url);
      }
    });

    const filteredPending = pendingAfterPhotos.filter(
      (photo) =>
        !dbPhotoIds.has(photo.id) &&
        !photo.url?.includes('cloudinary') &&
        !cloudinaryUrls.has(photo.url)
    );

    return [...dbAfterPhotos, ...filteredPending];
  }, [dbAfterPhotos, pendingAfterPhotos]);

  // Handle newly added photos by storing them in our separate state arrays
  const handleNewPhotosAdded = (newPhotos: PhotoType[]) => {
    if (!newPhotos.length) return;

    const photoType = newPhotos[0].type;

    if (photoType === 'before') {
      setPendingBeforePhotos((prev) => [...prev, ...newPhotos]);
    } else if (photoType === 'after') {
      setPendingAfterPhotos((prev) => [...prev, ...newPhotos]);
    }
  };

  // Clear pending photos when modal is closed
  useEffect(() => {
    if (!visible) {
      setPendingBeforePhotos([]);
      setPendingAfterPhotos([]);
    }
  }, [visible]);

  // Remove old stale cleanup interval - no longer needed as we've simplified
  // our approach to use a single cleanup function

  if (!visible) return null;

  return (
    <Modal
      animationType='slide'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView className='flex-1 bg-gray-50'>
        <View className='flex-1'>
          {/* Header */}
          <View className='bg-darkGreen p-4 shadow-md flex-row justify-between items-center'>
            <Text className='text-white text-xl font-bold'>{jobTitle}</Text>
            <TouchableOpacity
              onPress={onClose}
              className='w-8 h-8 bg-white/20 rounded-full items-center justify-center'
            >
              <Text className='text-white font-bold text-lg'>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View className='flex-row border-b border-gray-200 bg-white'>
            {['before', 'after', 'history'].map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab as TabType)}
                className={`flex-1 py-4 px-4 ${
                  activeTab === tab ? 'border-b-2 border-darkGreen' : ''
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    activeTab === tab ? 'text-darkGreen' : 'text-gray-500'
                  }`}
                >
                  {tab === 'before'
                    ? `Before Photos${
                        beforePhotos.length ? ` (${beforePhotos.length})` : ''
                      }`
                    : tab === 'after'
                    ? `After Photos${
                        afterPhotos.length ? ` (${afterPhotos.length})` : ''
                      }`
                    : 'Job History'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <View className='flex-1 px-4 py-4'>
            {activeTab === 'before' && (
              <PhotoCapture
                technicianId={technicianId}
                photos={beforePhotos}
                type='before'
                jobTitle={jobTitle}
                scheduleId={scheduleId}
                isLoading={isQueryLoading}
                startDate={startDate}
                onPhotosAdded={handleNewPhotosAdded}
              />
            )}

            {activeTab === 'after' && (
              <PhotoCapture
                technicianId={technicianId}
                photos={afterPhotos}
                type='after'
                jobTitle={jobTitle}
                scheduleId={scheduleId}
                isLoading={isQueryLoading}
                startDate={startDate}
                onPhotosAdded={handleNewPhotosAdded}
              />
            )}

            {activeTab === 'history' && (
              <JobPhotoHistory scheduleId={scheduleId} jobTitle={jobTitle} />
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
