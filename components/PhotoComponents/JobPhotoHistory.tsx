import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { format } from 'date-fns';
import { useQuery } from '@powersync/react-native';
import { PhotoType } from '@/utils/photos';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FastImageWrapper } from '@/components/common/FastImageWrapper';
import { FastImageViewer } from '@/components/common/FastImageViewer';
import { preloadImages } from '@/utils/imageCache';
import { buildCloudinaryUrlMobile } from '@/utils/cloudinaryUrl.native';

// Cloudinary configuration
const CLOUD_NAME = 'dhu4yrn5k';
const THUMBNAIL_WIDTH = 240; // Width for grid thumbnails

// Photo type with signature name extension
interface EnhancedPhotoType extends PhotoType {
  signerName?: string;
}

// Gallery image structure
interface GalleryImage {
  uri: string;
  title?: string;
  type?: 'before' | 'after' | 'signature';
}

// Job section with photos by type
interface JobSection {
  id: string;
  title: string;
  date: string;
  beforePhotos: EnhancedPhotoType[];
  afterPhotos: EnhancedPhotoType[];
  signaturePhotos: EnhancedPhotoType[];
}

interface JobPhotoHistoryProps {
  scheduleId: string;
  jobTitle: string;
}

export function JobPhotoHistory({
  scheduleId,
  jobTitle,
}: JobPhotoHistoryProps) {
  const { width } = useWindowDimensions();
  const [isLoading, setIsLoading] = useState(false);

  // Gallery state
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryJobDate, setGalleryJobDate] = useState('');

  // Calculate thumbnail size (3 per row with spacing)
  const thumbnailSize = useMemo(() => Math.floor((width - 64) / 3), [width]);

  // Fetch previous jobs with the same title
  const { data: previousJobsData = [], isLoading: isQueryLoading } =
    useQuery<any>(
      jobTitle && scheduleId
        ? `SELECT id, jobTitle, startDateTime, photos FROM schedules 
         WHERE jobTitle = ? AND id != ? AND photos IS NOT NULL
         ORDER BY startDateTime DESC LIMIT 10`
        : `SELECT id FROM schedules WHERE 0`,
      [jobTitle?.trim(), scheduleId]
    );

  // Process jobs data into sections
  const jobSections = useMemo(() => {
    if (!previousJobsData.length) return [];

    const sections: JobSection[] = [];
    const photoUrls: string[] = [];

    for (const job of previousJobsData) {
      try {
        if (!job.photos || typeof job.photos !== 'string') continue;

        // Parse photos JSON
        let photosArray: EnhancedPhotoType[] = [];
        try {
          const photosObj = JSON.parse(job.photos);

          if (Array.isArray(photosObj)) {
            photosArray = photosObj;
          } else if (Array.isArray(photosObj.photos)) {
            photosArray = photosObj.photos;
          } else if (photosObj.before || photosObj.after) {
            const beforePhotos = Array.isArray(photosObj.before)
              ? photosObj.before
              : [];
            const afterPhotos = Array.isArray(photosObj.after)
              ? photosObj.after
              : [];
            photosArray = [...beforePhotos, ...afterPhotos];
          }
        } catch (err) {
          console.error('Error parsing photos JSON:', err);
          continue;
        }

        if (!photosArray.length) continue;

        // Group photos by type
        const beforePhotos = photosArray.filter((p) => p.type === 'before');
        const afterPhotos = photosArray.filter((p) => p.type === 'after');
        const signaturePhotos = photosArray.filter(
          (p) => p.type === 'signature'
        );

        if (
          beforePhotos.length ||
          afterPhotos.length ||
          signaturePhotos.length
        ) {
          // Add transformed photo URLs for preloading (w_720 for viewer)
          const transformedUrls = [
            ...beforePhotos.map((p) =>
              buildCloudinaryUrlMobile({
                urlOrPublicId: p.url,
                cloudName: CLOUD_NAME,
                width: 720,
              })
            ),
            ...afterPhotos.map((p) =>
              buildCloudinaryUrlMobile({
                urlOrPublicId: p.url,
                cloudName: CLOUD_NAME,
                width: 720,
              })
            ),
            ...signaturePhotos.map((p) =>
              buildCloudinaryUrlMobile({
                urlOrPublicId: p.url,
                cloudName: CLOUD_NAME,
                width: 720,
              })
            ),
          ];
          photoUrls.push(...transformedUrls);

          // Create job section
          sections.push({
            id: job.id,
            title: job.jobTitle || 'Untitled Job',
            date: job.startDateTime
              ? format(new Date(job.startDateTime), 'MMM d, yyyy')
              : 'Unknown Date',
            beforePhotos,
            afterPhotos,
            signaturePhotos,
          });
        }
      } catch (error) {
        console.error('Error processing job:', error);
      }
    }

    // Preload first 20 images
    if (photoUrls.length > 0) {
      preloadImages(photoUrls.slice(0, 20));
    }

    return sections;
  }, [previousJobsData]);

  // Open gallery with photos
  const openGallery = useCallback(
    (
      jobSection: JobSection,
      photoType: 'before' | 'after' | 'signature',
      photoIndex: number = 0
    ) => {
      // Get relevant photos based on type
      const photos =
        photoType === 'before'
          ? jobSection.beforePhotos
          : photoType === 'after'
          ? jobSection.afterPhotos
          : jobSection.signaturePhotos;

      if (!photos.length) return;

      // Create gallery images from all photos in this job
      const allImages: GalleryImage[] = [
        ...jobSection.beforePhotos.map((p) => ({
          uri: p.url,
          title: 'Before Photo',
          type: 'before' as const,
        })),
        ...jobSection.afterPhotos.map((p) => ({
          uri: p.url,
          title: 'After Photo',
          type: 'after' as const,
        })),
        ...jobSection.signaturePhotos.map((p) => ({
          uri: p.url,
          title: `Signature: ${p.signerName || 'Unknown'}`,
          type: 'signature' as const,
        })),
      ];

      if (allImages.length === 0) return;

      // Find starting index for the selected photo type
      let startIndex = 0;
      if (photoType === 'after') {
        startIndex = jobSection.beforePhotos.length;
      } else if (photoType === 'signature') {
        startIndex =
          jobSection.beforePhotos.length + jobSection.afterPhotos.length;
      }

      // Set gallery state
      setGalleryImages(allImages);
      setGalleryIndex(Math.min(startIndex + photoIndex, allImages.length - 1));
      setGalleryJobDate(jobSection.date);
      setGalleryVisible(true);
    },
    []
  );

  // Get subtitle for gallery
  const getGallerySubtitle = useCallback(
    (index: number, image: GalleryImage) => {
      return `${galleryJobDate} - ${
        image?.type === 'before'
          ? 'Before Photo'
          : image?.type === 'after'
          ? 'After Photo'
          : 'Signature'
      }`;
    },
    [galleryJobDate]
  );

  // Render photo thumbnail
  const renderPhotoItem = useCallback(
    (
      photo: EnhancedPhotoType,
      jobSection: JobSection,
      photoType: 'before' | 'after' | 'signature',
      photoIndex: number
    ) => {
      const styles = {
        before: { bg: 'bg-blue-500/80', label: 'Before' },
        after: { bg: 'bg-green-500/80', label: 'After' },
        signature: { bg: 'bg-purple-500/80', label: 'Signature' },
      };

      const style = styles[photoType];

      // Transform thumbnail URL to optimize bandwidth
      const thumbnailUrl = buildCloudinaryUrlMobile({
        urlOrPublicId: photo.url,
        cloudName: CLOUD_NAME,
        width: THUMBNAIL_WIDTH,
      });

      return (
        <Pressable
          key={photo.id || `${jobSection.id}-${photoType}-${photoIndex}`}
          onPress={() => openGallery(jobSection, photoType, photoIndex)}
          style={{
            width: thumbnailSize,
            height: thumbnailSize,
            marginRight: 8,
            marginBottom: 8,
          }}
          className='rounded-lg overflow-hidden'
        >
          <FastImageWrapper
            uri={thumbnailUrl}
            style={{ width: '100%', height: '100%', borderRadius: 8 }}
            showLoader={true}
          />
          <View
            className={`absolute bottom-0 left-0 right-0 py-1 items-center ${style.bg}`}
          >
            <Text className='text-white text-xs font-medium'>
              {style.label}
            </Text>
          </View>
        </Pressable>
      );
    },
    [thumbnailSize, openGallery]
  );

  // Render photo section (Before, After, or Signature)
  const renderPhotoSection = useCallback(
    (
      photos: EnhancedPhotoType[],
      jobSection: JobSection,
      photoType: 'before' | 'after' | 'signature'
    ) => {
      if (!photos.length) return null;

      const sectionConfig = {
        before: {
          icon: 'camera-outline',
          color: '#3b82f6',
          title: 'Before Photos',
        },
        after: {
          icon: 'checkmark-circle-outline',
          color: '#10b981',
          title: 'After Photos',
        },
        signature: {
          icon: 'pencil-outline',
          color: '#8b5cf6',
          title: 'Signatures',
        },
      };

      const config = sectionConfig[photoType];

      return (
        <View className='mb-4'>
          <Text className='text-sm font-medium mb-2 text-gray-600'>
            <Ionicons
              name={config.icon as any}
              size={16}
              color={config.color}
            />{' '}
            {config.title}
          </Text>
          <View className='flex-row flex-wrap'>
            {photos.map((photo, index) =>
              renderPhotoItem(photo, jobSection, photoType, index)
            )}
          </View>
        </View>
      );
    },
    [renderPhotoItem]
  );

  // Render job card
  const renderJobCard = useCallback(
    (jobSection: JobSection) => {
      return (
        <View className='bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100'>
          <View className='flex-row items-center mb-3'>
            <View className='w-2.5 h-2.5 rounded-full bg-blue-500 mr-2.5' />
            <Text className='text-base font-semibold text-gray-800'>
              {jobSection.date}
            </Text>
          </View>

          {renderPhotoSection(jobSection.beforePhotos, jobSection, 'before')}
          {renderPhotoSection(jobSection.afterPhotos, jobSection, 'after')}
          {renderPhotoSection(
            jobSection.signaturePhotos,
            jobSection,
            'signature'
          )}
        </View>
      );
    },
    [renderPhotoSection]
  );

  // Show loading indicator
  if (isQueryLoading || isLoading) {
    return (
      <View className='flex-1 justify-center items-center'>
        <ActivityIndicator size='large' color='#0891b2' />
        <Text className='mt-3 text-gray-500 text-base'>
          Loading previous jobs...
        </Text>
      </View>
    );
  }

  // Show empty state
  if (jobSections.length === 0) {
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
        data={jobSections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderJobCard(item)}
        initialNumToRender={2}
        maxToRenderPerBatch={1}
        windowSize={3}
        removeClippedSubviews={true}
        ListFooterComponent={<View className='h-12' />}
      />

      {/* Image Gallery Viewer */}
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
