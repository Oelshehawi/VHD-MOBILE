import { useState, useMemo } from 'react';
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

  // Filter photos by type using useMemo for better performance
  const beforePhotos = useMemo(() => {
    return parsedPhotosData.photos.filter((photo) => photo.type === 'before');
  }, [parsedPhotosData]);

  const afterPhotos = useMemo(() => {
    return parsedPhotosData.photos.filter((photo) => photo.type === 'after');
  }, [parsedPhotosData]);

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
