import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { PhotoCapture } from './PhotoCapture';
import { JobPhotoHistory } from './JobPhotoHistory';
import { PhotoType } from '@/utils/photos';
import { useSystem } from '@/services/database/System';
import { useQuery } from '@powersync/react-native';

interface PhotoDocumentationModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  jobTitle: string;
  technicianId: string;
  location: string;
}

// Tab type for the modal navigation
type TabType = 'before' | 'after' | 'history';

// Interface for the gallery image object
interface GalleryImage {
  uri: string;
  title?: string;
  type?: 'before' | 'after' | 'signature';
}

// Interface for photo with optional _id for backward compatibility
interface EnhancedPhotoType extends PhotoType {
  _id?: string;
}

// Interface for grouped photos by job
interface JobPhotoGroup {
  scheduleId: string;
  date: string;
  jobTitle: string;
  photos: EnhancedPhotoType[];
  galleryImages: GalleryImage[];
}

export function PhotoDocumentationModal({
  visible,
  onClose,
  scheduleId,
  jobTitle,
  technicianId,
}: PhotoDocumentationModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('before');
  const [beforePhotos, setBeforePhotos] = useState<PhotoType[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<PhotoType[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Query photos directly from the schedules table
  const { data } = useQuery(`SELECT photos FROM schedules WHERE id = ?`, [
    scheduleId,
  ]);

  // Load photos when the modal becomes visible or tab changes
  useEffect(() => {
    if (!visible || !scheduleId || !data || data.length === 0) return;

    let isMounted = true;
    const loadPhotos = async () => {
      try {
        setIsLoading(true);

        // The first row from the query result
        const photosData = data[0]?.photos;

        if (photosData) {
          try {
            const photosObj =
              typeof photosData === 'string'
                ? JSON.parse(photosData)
                : photosData;

            if (isMounted) {
              setBeforePhotos(
                Array.isArray(photosObj.before) ? photosObj.before : []
              );
              setAfterPhotos(
                Array.isArray(photosObj.after) ? photosObj.after : []
              );
            }
          } catch (parseError) {
            console.error('Error parsing photos data:', parseError);
          }
        }
      } catch (error) {
        console.error(`Error loading photos:`, error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadPhotos();

    // Set up refresh interval
    const refreshInterval = setInterval(loadPhotos, 5000);

    // Clean up
    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [scheduleId, visible, data]);

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
              />
            )}

            {activeTab === 'after' && (
              <PhotoCapture
                technicianId={technicianId}
                photos={afterPhotos}
                type='after'
                jobTitle={jobTitle}
                scheduleId={scheduleId}
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
