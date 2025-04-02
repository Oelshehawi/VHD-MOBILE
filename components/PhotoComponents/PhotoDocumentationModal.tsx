import { useState, useMemo } from 'react';
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
import { parsePhotosData } from '@/utils/photos';
import { useQuery } from '@powersync/react-native';
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

  // Query photos directly from the schedules table
  const { data, isLoading: isQueryLoading } = useQuery(
    `SELECT photos FROM schedules WHERE id = ?`,
    [scheduleId]
  );

  // Query ALL attachments related to this schedule, regardless of state
  const { data: allAttachments, isLoading: isAttachmentsLoading } = useQuery(
    `SELECT id, state, filename, scheduleId, type, local_uri, timestamp FROM ${ATTACHMENT_TABLE} 
     WHERE scheduleId = ? ORDER BY timestamp DESC`,
    [scheduleId]
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

  // Process photos and merge with any pending uploads from the attachment table
  const processedPhotos = useMemo(() => {
    if (!parsedPhotosData.photos) return [];

    // Create a map of all photos from schedule data by ID for quick lookup
    const photosMap = new Map();
    parsedPhotosData.photos.forEach((photo) => {
      photosMap.set(photo._id, photo);
      // Also map by attachmentId if it exists - this helps prevent duplicates
      if (photo.attachmentId) {
        photosMap.set(photo.attachmentId, photo);
      }
    });

    // Create a map of attachment states by ID
    const attachmentStatesMap = new Map();
    if (allAttachments) {
      allAttachments.forEach((attachment) => {
        attachmentStatesMap.set(attachment.id, attachment.state);
      });
    }

    // First process all photos from schedule data
    const mergedPhotos = parsedPhotosData.photos.map((photo) => {
      // Check if this photo has an attachment ID and its state
      if (photo.attachmentId && attachmentStatesMap.has(photo.attachmentId)) {
        const state = attachmentStatesMap.get(photo.attachmentId);
        return {
          ...photo,
          status:
            state === AttachmentState.SYNCED
              ? ('uploaded' as const)
              : ('pending' as const),
        };
      }
      // Default to uploaded if in schedules but not found in attachments
      return { ...photo, status: 'uploaded' as const };
    });

    // Now add any new attachments that aren't in the photos array yet
    if (allAttachments) {
      allAttachments.forEach((attachment) => {
        // Only consider attachments that:
        // 1. Are related to this schedule
        // 2. Have a valid type (before/after)
        // 3. Are NOT already in the photos map (prevent duplicates)
        // 4. Are still in QUEUED_UPLOAD state (not yet synced)
        if (
          attachment.scheduleId === scheduleId &&
          (attachment.type === 'before' || attachment.type === 'after') &&
          !photosMap.has(attachment.id) &&
          attachment.state !== AttachmentState.SYNCED
        ) {
          // This is a new photo in upload process, add it to our array
          mergedPhotos.push({
            _id: attachment.id,
            id: attachment.id,
            url: attachment.filename, // The filename without path
            local_uri: attachment.local_uri, // Include the local_uri from attachment record if available
            type: attachment.type as 'before' | 'after',
            timestamp: attachment.timestamp || new Date().toISOString(),
            attachmentId: attachment.id,
            status: 'pending' as const, // Always pending if we're adding from attachments table
            technicianId: technicianId, // Use the current technician ID
          });
        }
      });
    }

    return mergedPhotos;
  }, [parsedPhotosData.photos, allAttachments, scheduleId, technicianId]);

  // Filter processed photos by type
  const beforePhotos = useMemo(() => {
    return processedPhotos.filter((photo) => photo.type === 'before');
  }, [processedPhotos]);

  const afterPhotos = useMemo(() => {
    return processedPhotos.filter((photo) => photo.type === 'after');
  }, [processedPhotos]);

  if (!visible) return null;

  // Render appropriate content based on active tab
  const renderContent = () => {
    if (activeTab === 'before' || activeTab === 'after') {
      return (
        <ScrollView className='flex-1 px-4 py-4'>
          <PhotoCapture
            technicianId={technicianId}
            photos={activeTab === 'before' ? beforePhotos : afterPhotos}
            type={activeTab}
            jobTitle={jobTitle}
            scheduleId={scheduleId}
            isLoading={isQueryLoading || isAttachmentsLoading}
            startDate={startDate}
          />
        </ScrollView>
      );
    } else {
      // For history tab, don't wrap in ScrollView since JobPhotoHistory already uses FlatList
      return (
        <View className='flex-1 px-4 py-4'>
          <JobPhotoHistory scheduleId={scheduleId} jobTitle={jobTitle} />
        </View>
      );
    }
  };

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

          {/* Content - Conditionally rendered based on active tab */}
          {renderContent()}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
