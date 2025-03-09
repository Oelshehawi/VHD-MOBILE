import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { PhotoCapture } from './PhotoCapture';
import { useQuery } from '@powersync/react-native';
import { PhotoType } from '@/types';
import { formatDateReadable } from '@/utils/date';
import ImageView from 'react-native-image-viewing';
import { Ionicons } from '@expo/vector-icons';

interface PhotoDocumentationModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  jobTitle: string;
  technicianId: string;
  location: string;
}

type TabType = 'before' | 'after' | 'previous';

// Interface for the gallery image object
interface GalleryImage {
  uri: string;
  title?: string;
  type?: 'before' | 'after';
}

// Interface for grouped photos by job
interface JobPhotoGroup {
  scheduleId: string;
  date: string;
  jobTitle: string;
  photos: PhotoType[];
  galleryImages: GalleryImage[];
}

export function PhotoDocumentationModal({
  visible,
  onClose,
  scheduleId,
  jobTitle,
  technicianId,
  location,
}: PhotoDocumentationModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('before');
  const [isLoadingPreviousPhotos, setIsLoadingPreviousPhotos] = useState(false);
  const [previousPhotos, setPreviousPhotos] = useState<JobPhotoGroup[]>([]);

  // State for image gallery
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryJobTitle, setGalleryJobTitle] = useState('');

  // Fetch current schedule data for photos
  const { data: scheduleData = [] } = useQuery<any>(
    scheduleId
      ? `SELECT * FROM schedules WHERE id = ?`
      : `SELECT * FROM schedules WHERE 0`,
    [scheduleId]
  );

  // Fetch previous schedules that have photos at the same location
  const { data: previousSchedules = [] } = useQuery<any>(
    location && location.trim() !== ''
      ? `
        SELECT id, jobTitle, startDateTime, photos, technicianNotes 
        FROM schedules 
        WHERE location = ? 
          AND id != ? 
          AND photos IS NOT NULL 
        ORDER BY startDateTime DESC 
        LIMIT 20
      `
      : `SELECT * FROM schedules WHERE 0`,
    location && location.trim() !== '' ? [location, scheduleId] : []
  );

  // Effect to parse previous photos when previousSchedules changes
  useEffect(() => {
    if (previousSchedules.length > 0) {
      setIsLoadingPreviousPhotos(true);

      try {
        const processedPreviousPhotos = previousSchedules
          .map((prevSchedule: any) => {
            try {
              if (!prevSchedule?.photos) return null;

              // Parse the photos JSON string
              const photosData =
                typeof prevSchedule.photos === 'string'
                  ? JSON.parse(prevSchedule.photos)
                  : prevSchedule.photos;

              // Extract photos from both before and after
              const allPhotos = [
                ...(Array.isArray(photosData.before)
                  ? photosData.before.map((p: any) => ({
                      ...p,
                      type: 'before' as const,
                    }))
                  : []),
                ...(Array.isArray(photosData.after)
                  ? photosData.after.map((p: any) => ({
                      ...p,
                      type: 'after' as const,
                    }))
                  : []),
              ];

              // If no photos, skip this schedule
              if (allPhotos.length === 0) return null;

              // Prepare gallery images for this job
              const galleryImages = allPhotos.map((photo: any) => ({
                uri: photo.url,
                title: `${
                  photo.type === 'before' ? 'Before' : 'After'
                } - ${formatDateReadable(
                  new Date(prevSchedule.startDateTime)
                )}`,
                type: photo.type,
              }));

              return {
                scheduleId: prevSchedule.id,
                date: prevSchedule.startDateTime,
                jobTitle: prevSchedule.jobTitle,
                photos: allPhotos.map((photo: any) => ({
                  ...photo,
                  id: photo._id || photo.id,
                  _id: photo._id || photo.id,
                  status: photo.status || 'uploaded',
                })),
                galleryImages,
              };
            } catch (error) {
              console.error('Error parsing previous schedule photos:', error);
              return null;
            }
          })
          .filter(Boolean) as JobPhotoGroup[]; // Cast to the correct type after filtering out nulls

        setPreviousPhotos(processedPreviousPhotos);
      } catch (error) {
        console.error('Error processing previous photos:', error);
      } finally {
        setIsLoadingPreviousPhotos(false);
      }
    }
  }, [previousSchedules]);

  const schedule = scheduleData[0] || null;

  if (!visible) return null;

  // Parse photos from current schedule JSON string
  const photos = (() => {
    try {
      if (!schedule?.photos) {
        return { before: [], after: [] };
      }

      const parsedPhotos =
        typeof schedule.photos === 'string'
          ? JSON.parse(schedule.photos)
          : schedule.photos;

      // Convert _id to id if needed and add type field
      return {
        before: Array.isArray(parsedPhotos.before)
          ? parsedPhotos.before.map((photo: any) => ({
              ...photo,
              id: photo._id || photo.id,
              _id: photo._id || photo.id, // Keep _id for backward compatibility
              type: 'before' as const,
              status: photo.status || 'uploaded',
            }))
          : [],
        after: Array.isArray(parsedPhotos.after)
          ? parsedPhotos.after.map((photo: any) => ({
              ...photo,
              id: photo._id || photo.id,
              _id: photo._id || photo.id, // Keep _id for backward compatibility
              type: 'after' as const,
              status: photo.status || 'uploaded',
            }))
          : [],
      };
    } catch (error) {
      console.error('Error parsing photos:', error, schedule?.photos);
      return { before: [], after: [] };
    }
  })();

  const hasBeforePhotos = photos.before?.length > 0;
  const hasAfterPhotos = photos.after?.length > 0;
  const hasPreviousPhotos = previousPhotos.length > 0;

  // Function to open the gallery for a specific job
  const openGallery = (
    jobPhotos: JobPhotoGroup,
    initialPhotoIndex: number = 0
  ) => {
    setGalleryImages(jobPhotos.galleryImages);
    setGalleryIndex(initialPhotoIndex);
    setGalleryJobTitle(jobPhotos.jobTitle);
    setGalleryVisible(true);
  };

  // Render the technician notes if they exist
  const renderTechnicianNotes = () => {
    if (!schedule?.technicianNotes) return null;

    return (
      <View className='mt-6 bg-gray-800/70 p-4 rounded-lg'>
        <Text className='text-white font-medium mb-2'>Technician Notes:</Text>
        <Text className='text-gray-300'>{schedule.technicianNotes}</Text>
      </View>
    );
  };

  // Render previous photos section with enhanced gallery view
  const renderPreviousPhotos = () => {
    if (isLoadingPreviousPhotos) {
      return (
        <View className='flex-1 items-center justify-center py-10'>
          <ActivityIndicator size='large' color='#10B981' />
          <Text className='text-gray-300 mt-4'>Loading previous photos...</Text>
        </View>
      );
    }

    if (previousPhotos.length === 0) {
      return (
        <View className='flex-1 items-center justify-center py-10'>
          <Text className='text-gray-400 text-lg'>
            No previous photos found
          </Text>
          <Text className='text-gray-500 text-sm mt-2'>
            This might be the first job at this location
          </Text>
        </View>
      );
    }

    return (
      <View className='flex-1'>
        {previousPhotos.map((jobPhotos, jobIndex) => (
          <View key={jobPhotos.scheduleId} className='mb-8'>
            <View className='bg-gray-800 p-3 rounded-t-lg flex-row justify-between items-center'>
              <View>
                <Text className='text-white font-medium'>
                  {jobPhotos.jobTitle}
                </Text>
                <Text className='text-gray-400 text-sm'>
                  {formatDateReadable(new Date(jobPhotos.date))}
                </Text>
              </View>

              {/* View All Button */}
              <TouchableOpacity
                onPress={() => openGallery(jobPhotos)}
                className='bg-gray-700 rounded-full px-2 py-1 flex-row items-center'
              >
                <Ionicons name='expand-outline' size={16} color='#ffffff' />
                <Text className='text-white text-xs ml-1'>View All</Text>
              </TouchableOpacity>
            </View>

            <View className='bg-gray-800/40 p-4 rounded-b-lg'>
              <View className='flex-row flex-wrap gap-3'>
                {jobPhotos.photos.slice(0, 4).map((photo, photoIndex) => (
                  <TouchableOpacity
                    key={photo.id}
                    onPress={() => openGallery(jobPhotos, photoIndex)}
                    className='relative'
                  >
                    <View className='w-28 h-28 rounded-lg overflow-hidden'>
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          left: 0,
                          backgroundColor:
                            photo.type === 'before'
                              ? 'rgba(59, 130, 246, 0.7)'
                              : 'rgba(16, 185, 129, 0.7)',
                          paddingVertical: 2,
                          zIndex: 1,
                        }}
                      >
                        <Text className='text-white text-xs text-center font-medium'>
                          {photo.type === 'before' ? 'Before' : 'After'}
                        </Text>
                      </View>
                      <Image
                        source={{ uri: photo.url }}
                        className='w-28 h-28'
                        resizeMode='cover'
                      />
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Show "more photos" indicator if there are more than 4 */}
                {jobPhotos.photos.length > 4 && (
                  <TouchableOpacity
                    onPress={() => openGallery(jobPhotos, 4)}
                    className='w-28 h-28 rounded-lg bg-gray-700 items-center justify-center'
                  >
                    <Text className='text-white font-medium'>
                      +{jobPhotos.photos.length - 4}
                    </Text>
                    <Text className='text-gray-300 text-xs'>more</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ))}

        {/* Image Viewing Gallery */}
        <ImageView
          images={galleryImages}
          imageIndex={galleryIndex}
          visible={galleryVisible}
          onRequestClose={() => setGalleryVisible(false)}
          FooterComponent={({ imageIndex }) => (
            <View className='bg-black/70 p-2 w-full'>
              <Text className='text-white text-center font-medium'>
                {galleryJobTitle}
              </Text>
              <Text className='text-gray-300 text-center text-sm'>
                {galleryImages[imageIndex]?.title || ''}
              </Text>
            </View>
          )}
        />
      </View>
    );
  };

  return (
    <Modal
      animationType='slide'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView className='flex-1 bg-black/90'>
        <View className='flex-1 bg-gray-900'>
          {/* Header */}
          <View className='flex-row justify-between items-center px-6 py-4 bg-gray-800'>
            <Text className='text-xl font-bold text-white'>
              Job Documentation
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className='p-2 bg-gray-700 rounded-full'
            >
              <Text className='text-gray-300 text-lg'>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Job Title */}
          <View className='px-6 py-3 bg-gray-800 border-b border-gray-700'>
            <Text className='text-lg text-white'>{jobTitle}</Text>
            {location && (
              <Text className='text-sm text-gray-400'>{location}</Text>
            )}
          </View>

          {/* Tab Navigation */}
          <View className='flex-row border-b border-gray-700'>
            <TouchableOpacity
              onPress={() => setActiveTab('before')}
              className={`flex-1 py-3 px-4 ${
                activeTab === 'before' ? 'border-b-2 border-blue-500' : ''
              }`}
            >
              <Text
                className={`text-center font-medium ${
                  activeTab === 'before' ? 'text-white' : 'text-gray-400'
                }`}
              >
                Before Photos {hasBeforePhotos && '✓'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('after')}
              className={`flex-1 py-3 px-4 ${
                activeTab === 'after' ? 'border-b-2 border-green-500' : ''
              }`}
            >
              <Text
                className={`text-center font-medium ${
                  activeTab === 'after' ? 'text-white' : 'text-gray-400'
                }`}
              >
                After Photos {hasAfterPhotos && '✓'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('previous')}
              className={`flex-1 py-3 px-4 ${
                activeTab === 'previous' ? 'border-b-2 border-purple-500' : ''
              }`}
            >
              <Text
                className={`text-center font-medium ${
                  activeTab === 'previous' ? 'text-white' : 'text-gray-400'
                }`}
              >
                Previous {hasPreviousPhotos && '✓'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content Area */}
          <ScrollView className='flex-1 p-6'>
            {activeTab === 'previous' ? (
              renderPreviousPhotos()
            ) : (
              <View className='flex-col gap-6'>
                {/* Photo Capture Component */}
                <PhotoCapture
                  type={activeTab as 'before' | 'after'}
                  photos={photos[activeTab as 'before' | 'after']}
                  technicianId={technicianId}
                  jobTitle={jobTitle}
                  scheduleId={scheduleId}
                />

                {/* Technician Notes */}
                {renderTechnicianNotes()}

                {/* Documentation Status */}
                <View className='mt-4 bg-gray-800 p-4 rounded-lg'>
                  <Text className='text-white font-medium mb-2'>
                    Documentation Status:
                  </Text>
                  <View className='flex-row flex-wrap gap-3'>
                    <View
                      className={`py-1.5 px-3 rounded-lg ${
                        hasBeforePhotos ? 'bg-blue-900/30' : 'bg-gray-700/50'
                      }`}
                    >
                      <Text
                        className={`${
                          hasBeforePhotos ? 'text-blue-200' : 'text-gray-400'
                        }`}
                      >
                        {hasBeforePhotos
                          ? `✓ Before (${photos.before.length})`
                          : '○ Before Photos Missing'}
                      </Text>
                    </View>

                    <View
                      className={`py-1.5 px-3 rounded-lg ${
                        hasAfterPhotos ? 'bg-green-900/30' : 'bg-gray-700/50'
                      }`}
                    >
                      <Text
                        className={`${
                          hasAfterPhotos ? 'text-green-200' : 'text-gray-400'
                        }`}
                      >
                        {hasAfterPhotos
                          ? `✓ After (${photos.after.length})`
                          : '○ After Photos Missing'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Instructions */}
                <View className='bg-gray-800/50 p-4 rounded-lg mt-2'>
                  <Text className='text-gray-300 text-sm'>
                    {activeTab === 'before'
                      ? 'Take photos of the job site before starting work to document the initial state.'
                      : 'Take photos after completing work to document the final results.'}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
