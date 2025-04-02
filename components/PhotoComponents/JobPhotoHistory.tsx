import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { format } from 'date-fns';
import { useQuery } from '@powersync/react-native';
import { PhotoType } from '@/utils/photos';
import { Ionicons } from '@expo/vector-icons';
import { FastImageWrapper } from '@/components/common/FastImageWrapper';
import { FastImageViewer } from '@/components/common/FastImageViewer';
import { FastImageViewerHeader } from '@/components/common/FastImageViewerHeader';
import { preloadImages } from '@/utils/imageCache';

// Interface for enhanced photo type with backward compatibility
interface EnhancedPhotoType extends PhotoType {
  signerName?: string;
}

// Interface for the gallery image object
interface GalleryImage {
  uri: string;
  title?: string;
  type?: 'before' | 'after' | 'signature';
}

// Props for the JobPhotoHistory component
interface JobPhotoHistoryProps {
  scheduleId: string;
  jobTitle: string;
}

/**
 * Component to display photos from previous jobs with the same title
 */
export function JobPhotoHistory({
  scheduleId,
  jobTitle,
}: JobPhotoHistoryProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [previousJobs, setPreviousJobs] = useState<
    {
      id: string;
      jobTitle: string;
      date: string;
      photos: {
        before: EnhancedPhotoType[];
        after: EnhancedPhotoType[];
        signature: EnhancedPhotoType[];
      };
    }[]
  >([]);

  // State for image gallery
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryJobDate, setGalleryJobDate] = useState('');

  // Fetch previous jobs with the same title
  const { data: previousJobsData = [] } = useQuery<any>(
    jobTitle && scheduleId
      ? `SELECT id, jobTitle, startDateTime, photos FROM schedules 
         WHERE jobTitle = ? AND id != ? AND photos IS NOT NULL
         ORDER BY startDateTime DESC LIMIT 20`
      : `SELECT id FROM schedules WHERE 0`,
    [jobTitle?.trim(), scheduleId]
  );

  // Process previous jobs data
  useEffect(() => {
    if (!previousJobsData.length) return;

    const processJobs = async () => {
      try {
        setIsLoading(true);

        // Process job data
        const processedJobs = previousJobsData
          .map((job) => {
            try {
              if (!job.photos || typeof job.photos !== 'string') return null;

              // Parse photos JSON
              const photosObj = JSON.parse(job.photos);

              // Format the date
              const dateString = job.startDateTime
                ? format(new Date(job.startDateTime), 'MMM d, yyyy')
                : 'Unknown Date';

              // Process photos array - always use the new schema
              const photosArray = Array.isArray(photosObj.photos)
                ? photosObj.photos
                : Array.isArray(photosObj)
                ? photosObj
                : [];

              return {
                id: job.id as string,
                jobTitle: (job.jobTitle as string) || 'Untitled Job',
                date: dateString,
                photos: {
                  before: photosArray.filter(
                    (p: EnhancedPhotoType) => p.type === 'before'
                  ) as EnhancedPhotoType[],
                  after: photosArray.filter(
                    (p: EnhancedPhotoType) => p.type === 'after'
                  ) as EnhancedPhotoType[],
                  signature: photosArray.filter(
                    (p: EnhancedPhotoType) => p.type === 'signature'
                  ) as EnhancedPhotoType[],
                },
              };
            } catch (error) {
              console.error('Error processing job:', error);
              return null;
            }
          })
          .filter(Boolean)
          .filter(
            (job) =>
              (job?.photos?.before?.length ?? 0) > 0 ||
              (job?.photos?.after?.length ?? 0) > 0 ||
              (job?.photos?.signature?.length ?? 0) > 0
          );

        // Use type assertion to fix the type error
        setPreviousJobs(
          processedJobs as {
            id: string;
            jobTitle: string;
            date: string;
            photos: {
              before: EnhancedPhotoType[];
              after: EnhancedPhotoType[];
              signature: EnhancedPhotoType[];
            };
          }[]
        );

        // Preload thumbnails for better performance
        const allPhotoUrls = processedJobs.flatMap((job) => {
          if (!job) return [];
          const beforeUrls = job.photos.before.map((p) => p.url);
          const afterUrls = job.photos.after.map((p) => p.url);
          const signatureUrls = job.photos.signature.map((p) => p.url);
          return [...beforeUrls, ...afterUrls, ...signatureUrls].filter(
            Boolean
          );
        });

        if (allPhotoUrls.length > 0) {
          preloadImages(allPhotoUrls);
        }
      } catch (error) {
        console.error('Error processing previous jobs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    processJobs();
  }, [previousJobsData]);

  // Open gallery to view photos
  const openGallery = (
    jobIndex: number,
    photoType: 'before' | 'after' | 'signature',
    photoIndex: number = 0
  ) => {
    const job = previousJobs[jobIndex];
    if (!job) return;

    // Prepare gallery images
    const beforeImages = job.photos.before.map((photo) => ({
      uri: photo.url,
      title: 'Before Photo',
      type: 'before' as const,
    }));

    const afterImages = job.photos.after.map((photo) => ({
      uri: photo.url,
      title: 'After Photo',
      type: 'after' as const,
    }));

    const signatureImages = job.photos.signature.map((photo) => ({
      uri: photo.url,
      title: `Signature: ${photo.signerName || 'Unknown'}`,
      type: 'signature' as const,
    }));

    const allImages = [...beforeImages, ...afterImages, ...signatureImages];

    if (allImages.length === 0) return;

    // Calculate the correct index based on the type
    let startIndex = 0;
    if (photoType === 'after') {
      startIndex = beforeImages.length;
    } else if (photoType === 'signature') {
      startIndex = beforeImages.length + afterImages.length;
    }

    const finalIndex = startIndex + photoIndex;

    setGalleryImages(allImages);
    setGalleryIndex(finalIndex);
    setGalleryJobDate(job.date);
    setGalleryVisible(true);
  };

  // Render photo thumbnail item
  const renderPhotoItem = ({
    item,
    jobIndex,
    photoType,
    photoIndex,
  }: {
    item: EnhancedPhotoType;
    jobIndex: number;
    photoType: 'before' | 'after' | 'signature';
    photoIndex: number;
  }) => (
    <Pressable
      onPress={() => openGallery(jobIndex, photoType, photoIndex)}
      className='w-[100px] h-[100px] mr-2 rounded-lg overflow-hidden'
    >
      <View className='w-full h-full relative'>
        <FastImageWrapper
          uri={item.url}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 8,
          }}
          showLoader={true}
        />

        <View
          className={`absolute bottom-0 left-0 right-0 py-1 items-center ${
            photoType === 'before'
              ? 'bg-blue-500/80'
              : photoType === 'after'
              ? 'bg-green-500/80'
              : 'bg-purple-500/80'
          }`}
        >
          <Text className='text-white text-xs font-medium'>
            {photoType === 'before'
              ? 'Before'
              : photoType === 'after'
              ? 'After'
              : 'Signature'}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  // Get subtitle for the gallery header
  const getGallerySubtitle = useCallback(
    (index: number, currentImage: GalleryImage) => {
      return `${galleryJobDate} - ${
        currentImage?.type === 'before'
          ? 'Before Photo'
          : currentImage?.type === 'after'
          ? 'After Photo'
          : 'Signature'
      }`;
    },
    [galleryJobDate]
  );

  // Loading state
  if (isLoading) {
    return (
      <View className='flex-1 justify-center items-center'>
        <ActivityIndicator size='large' color='#0891b2' />
        <Text className='mt-3 text-gray-500 text-base'>
          Loading previous jobs...
        </Text>
      </View>
    );
  }

  // Empty state
  if (previousJobs.length === 0) {
    return (
      <View className='flex-1 justify-center items-center px-6'>
        <Ionicons name='time-outline' size={48} color='#9ca3af' />
        <Text className='text-lg font-semibold mt-4 mb-2 text-gray-600'>
          No job history found
        </Text>
        <Text className='text-center text-gray-500 max-w-[240px]'>
          No previous jobs with title "{jobTitle}" were found
        </Text>
      </View>
    );
  }

  return (
    <View className='flex-1 p-2'>
      <Text className='text-xs text-gray-500 mb-3 italic px-1'>
        Showing photos from previous instances of "{jobTitle}"
      </Text>

      <FlatList
        data={previousJobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index: jobIndex }) => (
          <View className='bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100'>
            <View className='flex-row items-center mb-3'>
              <View className='w-2.5 h-2.5 rounded-full bg-blue-500 mr-2.5' />
              <Text className='text-base font-semibold text-gray-800'>
                {item.date}
              </Text>
            </View>

            {/* Before Photos Section */}
            {item.photos.before.length > 0 && (
              <View className='mb-4'>
                <Text className='text-sm font-medium mb-2 text-gray-600 flex-row items-center'>
                  <Ionicons name='camera-outline' size={16} color='#3b82f6' />{' '}
                  Before Photos
                </Text>
                <FlatList
                  horizontal
                  data={item.photos.before}
                  keyExtractor={(photo, idx) =>
                    `${item.id}-before-${photo.id || idx}`
                  }
                  renderItem={({ item: photo, index: photoIndex }) =>
                    renderPhotoItem({
                      item: photo,
                      jobIndex,
                      photoType: 'before',
                      photoIndex,
                    })
                  }
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 4 }}
                />
              </View>
            )}

            {/* After Photos Section */}
            {item.photos.after.length > 0 && (
              <View className='mb-4'>
                <Text className='text-sm font-medium mb-2 text-gray-600 flex-row items-center'>
                  <Ionicons
                    name='checkmark-circle-outline'
                    size={16}
                    color='#10b981'
                  />{' '}
                  After Photos
                </Text>
                <FlatList
                  horizontal
                  data={item.photos.after}
                  keyExtractor={(photo, idx) =>
                    `${item.id}-after-${photo.id || idx}`
                  }
                  renderItem={({ item: photo, index: photoIndex }) =>
                    renderPhotoItem({
                      item: photo,
                      jobIndex,
                      photoType: 'after',
                      photoIndex,
                    })
                  }
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 4 }}
                />
              </View>
            )}

            {/* Signature Section */}
            {item.photos.signature.length > 0 && (
              <View className='mb-4'>
                <Text className='text-sm font-medium mb-2 text-gray-600 flex-row items-center'>
                  <Ionicons name='pencil-outline' size={16} color='#8b5cf6' />{' '}
                  Signatures
                </Text>
                <FlatList
                  horizontal
                  data={item.photos.signature}
                  keyExtractor={(photo, idx) =>
                    `${item.id}-signature-${photo.id || idx}`
                  }
                  renderItem={({ item: photo, index: photoIndex }) =>
                    renderPhotoItem({
                      item: photo,
                      jobIndex,
                      photoType: 'signature',
                      photoIndex,
                    })
                  }
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 4 }}
                />
              </View>
            )}
          </View>
        )}
      />

      {/* Image Gallery Viewer with the new simplified API */}
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
    </View>
  );
}
