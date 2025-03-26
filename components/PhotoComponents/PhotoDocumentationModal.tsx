import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { PhotoCapture } from '../PhotoComponents/PhotoCapture';
import { JobPhotoHistory } from './JobPhotoHistory';
import { parsePhotosData, PhotoType } from '@/utils/photos';
import { usePowerSync, useQuery } from '@powersync/react-native';
import { ATTACHMENT_TABLE, AttachmentState } from '@powersync/attachments';

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
  const powersync = usePowerSync();

  // Query photos directly from the schedules table
  const { data, isLoading: isQueryLoading } = useQuery(
    `SELECT photos FROM schedules WHERE id = ?`,
    [scheduleId]
  );

  // Query pending uploads from the attachment table
  const { data: pendingAttachments, isLoading: isPendingLoading } = useQuery(
    `SELECT id FROM ${ATTACHMENT_TABLE} WHERE scheduleId = ? AND state = ?`,
    [scheduleId, AttachmentState.QUEUED_UPLOAD]
  );

  // Parse photos data with useMemo to avoid unnecessary processing
  const parsedPhotosData = useMemo(() => {
    if (!data || data.length === 0) return { photos: [] };

    try {
      return parsePhotosData(data[0]);
    } catch (error) {
      return { photos: [] };
    }
  }, [data]);

  // Process photos and mark those with pending attachment uploads
  const processedPhotos = useMemo(() => {
    if (!parsedPhotosData.photos) return [];

    const pendingIds = pendingAttachments?.map((item) => item.id) || [];

    // Update photos with pending status based on attachment state
    return parsedPhotosData.photos.map((photo) => {
      // If the photo's attachmentId is in the pending list, mark it as pending
      if (photo.attachmentId && pendingIds.includes(photo.attachmentId)) {
        return { ...photo, status: 'pending' as const };
      }

      // If not in the pending list and has an attachmentId, mark as uploaded
      if (photo.attachmentId && !pendingIds.includes(photo.attachmentId)) {
        return { ...photo, status: 'uploaded' as const };
      }

      return photo;
    });
  }, [parsedPhotosData.photos, pendingAttachments]);

  // Filter processed photos by type
  const beforePhotos = useMemo(() => {
    return processedPhotos.filter((photo) => photo.type === 'before');
  }, [processedPhotos]);

  const afterPhotos = useMemo(() => {
    return processedPhotos.filter((photo) => photo.type === 'after');
  }, [processedPhotos]);

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

          {/* Content - Wrapped in ScrollView for scrollability with many photos */}
          <ScrollView className='flex-1 px-4 py-4'>
            {activeTab === 'before' && (
              <PhotoCapture
                technicianId={technicianId}
                photos={beforePhotos}
                type='before'
                jobTitle={jobTitle}
                scheduleId={scheduleId}
                isLoading={isQueryLoading || isPendingLoading}
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
                isLoading={isQueryLoading || isPendingLoading}
                startDate={startDate}
              />
            )}

            {activeTab === 'history' && (
              <JobPhotoHistory scheduleId={scheduleId} jobTitle={jobTitle} />
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
