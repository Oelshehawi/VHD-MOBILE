import { useState } from 'react';
import { View, Modal, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoCapture } from '../PhotoComponents/PhotoCapture';
import { JobPhotoHistory } from './JobPhotoHistory';
import { useQuery, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReportStatus } from '@/types/report';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// Tab type for the modal navigation
type TabType = 'before' | 'after' | 'history';

interface PhotoDocumentationModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  jobTitle: string;
  startDateTime: string;
  technicianId: string;
}

export function PhotoDocumentationModal({
  visible,
  onClose,
  scheduleId,
  jobTitle,
  startDateTime,
  technicianId
}: PhotoDocumentationModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('before');
  const insets = useSafeAreaInsets();

  const { data: photoCounts = [] } = useQuery<{
    beforeCount: number | null;
    afterCount: number | null;
  }>(
    scheduleId
      ? `SELECT
                 SUM(CASE WHEN type = 'before' THEN 1 ELSE 0 END) as beforeCount,
                 SUM(CASE WHEN type = 'after' THEN 1 ELSE 0 END) as afterCount
               FROM photos
               WHERE scheduleId = ?`
      : `SELECT 0 as beforeCount, 0 as afterCount`,
    [scheduleId],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const { data: reportStatusRows = [] } = useQuery<{
    reportStatus: ReportStatus | null;
  }>(
    scheduleId
      ? `SELECT reportStatus FROM reports WHERE scheduleId = ? ORDER BY dateCompleted DESC LIMIT 1`
      : `SELECT NULL as reportStatus`,
    [scheduleId],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const beforeCount = Number(photoCounts[0]?.beforeCount ?? 0);
  const afterCount = Number(photoCounts[0]?.afterCount ?? 0);
  const reportStatus = reportStatusRows[0]?.reportStatus ?? null;

  // Handle close with logging
  const handleClose = () => {
    onClose();
  };

  // Handle tab change with logging
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  const canAddAfterPhotos = reportStatus === 'in_progress' || reportStatus === 'completed';

  const handleGoToReport = () => {
    handleClose();
    router.push({
      pathname: '/report',
      params: {
        scheduleId,
        jobTitle,
        startDateTime,
        technicianId
      }
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle='fullScreen'
      animationType='slide'
    >
      <View className='flex-1 bg-gray-50' style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View className='flex-row items-center justify-between bg-emerald-900 p-4 shadow-sm'>
          <Text className='flex-1 text-xl font-bold text-white'>{jobTitle}</Text>
          <Pressable
            onPress={handleClose}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            className='h-11 w-11 items-center justify-center rounded-2xl bg-white/20 active:bg-white/30'
          >
            <Ionicons name='close' size={24} color='white' />
          </Pressable>
        </View>

        {/* Tabs */}
        <View className='flex-row border-b border-gray-200 bg-white'>
          {['before', 'after', 'history'].map((tab) => (
            <Pressable
              key={tab}
              onPress={() => handleTabChange(tab as TabType)}
              className={cn(
                'flex-1 px-4 py-4',
                activeTab === tab && 'border-b-2 border-emerald-900'
              )}
            >
              <Text
                className={cn(
                  'text-center font-semibold',
                  activeTab === tab ? 'text-emerald-900' : 'text-gray-500'
                )}
              >
                {tab === 'before'
                  ? `Before Photos${beforeCount ? ` (${beforeCount})` : ''}`
                  : tab === 'after'
                    ? `After Photos${afterCount ? ` (${afterCount})` : ''}`
                    : 'Job History'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Content */}
        {activeTab === 'before' || activeTab === 'after' ? (
          <ScrollView
            className='flex-1 px-4 py-4'
            contentContainerStyle={{
              paddingBottom: insets.bottom + 16
            }}
          >
            {activeTab === 'after' && !canAddAfterPhotos && afterCount === 0 ? (
              <View className='items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-5'>
                <Text className='text-lg font-bold text-gray-900'>
                  Submit report to add After photos
                </Text>
                <Text className='text-center text-sm text-gray-500'>
                  Submit the report for admin review to unlock After photos.
                </Text>
                <Pressable
                  onPress={handleGoToReport}
                  className='w-full rounded-xl bg-emerald-700 px-4 py-3 active:bg-emerald-800'
                >
                  <Text className='text-center font-semibold text-white'>Go to Report</Text>
                </Pressable>
              </View>
            ) : (
              <PhotoCapture
                technicianId={technicianId}
                type={activeTab}
                jobTitle={jobTitle}
                startDate={startDateTime}
                scheduleId={scheduleId}
                allowAdd={
                  activeTab === 'before' ||
                  canAddAfterPhotos ||
                  (activeTab === 'after' && afterCount > 0)
                }
              />
            )}
          </ScrollView>
        ) : (
          <View className='flex-1 px-4 pt-4' style={{ paddingBottom: insets.bottom + 16 }}>
            <JobPhotoHistory scheduleId={scheduleId} jobTitle={jobTitle} />
          </View>
        )}
      </View>
    </Modal>
  );
}
