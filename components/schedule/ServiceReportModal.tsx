import { Modal, Pressable, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import { ReportCloseoutContent } from '@/app/report';

interface ServiceReportModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  jobTitle?: string | null;
  scheduledStartAtUtc?: string | null;
  timeZone?: string | null;
  technicianId?: string | null;
}

export function ServiceReportModal({
  visible,
  onClose,
  scheduleId,
  jobTitle,
  scheduledStartAtUtc,
  timeZone,
  technicianId
}: ServiceReportModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#F2EFEA' : '#14110F';

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle='fullScreen'
      animationType='slide'
    >
      <View className='flex-1 bg-[#F7F5F1] dark:bg-gray-950' style={{ paddingTop: insets.top }}>
        <View className='border-b border-black/10 bg-[#F7F5F1] px-4 py-3 dark:border-white/10 dark:bg-gray-950'>
          <View className='flex-row items-center gap-3'>
            <View className='flex-1'>
              <Text className='text-2xl font-bold text-[#14110F] dark:text-white'>
                Report Closeout
              </Text>
              <Text className='mt-1 text-xs font-medium text-gray-500' numberOfLines={1}>
                {jobTitle || 'Service report'}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
            >
              <Ionicons name='close' size={22} color={iconColor} />
            </Pressable>
          </View>
        </View>

        <ReportCloseoutContent
          params={{
            scheduleId,
            jobTitle: jobTitle ?? '',
            scheduledStartAtUtc: scheduledStartAtUtc ?? '',
            timeZone: timeZone ?? '',
            technicianId: technicianId ?? ''
          }}
          onClose={onClose}
        />
      </View>
    </Modal>
  );
}
