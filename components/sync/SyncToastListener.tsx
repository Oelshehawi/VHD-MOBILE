import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SyncEventBus } from '@/services/sync/SyncEventBus';

interface ActiveToast {
  key: number;
  table: string;
  message: string;
}

const TOAST_DURATION_MS = 5000;

function describeTable(table: string): string {
  switch (table) {
    case 'schedules':
      return 'schedule';
    case 'timeoffrequests':
      return 'time-off request';
    case 'availabilities':
      return 'availability';
    case 'invoices':
      return 'invoice';
    case 'reports':
      return 'report';
    case 'photos':
      return 'photo';
    default:
      return table;
  }
}

export function SyncToastListener() {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = SyncEventBus.subscribe((event) => {
      if (event.type !== 'business_reject') {
        return;
      }

      setToast({
        key: Date.now(),
        table: event.table,
        message: event.message
      });

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!toast) {
    return null;
  }

  return (
    <Animated.View
      key={toast.key}
      entering={FadeInDown.duration(250)}
      exiting={FadeOutUp.duration(200)}
      className='absolute left-4 right-4 z-50'
      style={{ top: Math.max(insets.top + 8, 48) }}
    >
      <View className='bg-red-600 dark:bg-red-700 rounded-lg p-4 shadow-lg'>
        <Text className='text-white font-semibold'>
          Your {describeTable(toast.table)} change was rejected
        </Text>
        <Text className='text-white/90 text-xs mt-1'>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}
