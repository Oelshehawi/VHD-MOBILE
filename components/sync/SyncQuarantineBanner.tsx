import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@powersync/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { useSystem } from '@/services/database/System';
import { debugLogger } from '@/utils/DebugLogger';

// Writes the server rejected are kept in the local-only sync_quarantine table
// instead of being dropped. This banner surfaces them and re-sends on demand.
export function SyncQuarantineBanner() {
  const { isSignedIn, isInitialized } = usePowerSyncStatus();
  if (!isSignedIn || !isInitialized) return null;
  return <QuarantineCount />;
}

function QuarantineCount() {
  const system = useSystem();
  const insets = useSafeAreaInsets();
  const { data } = useQuery<{ count: number }>('SELECT COUNT(*) AS count FROM sync_quarantine');
  const count = Number(data?.[0]?.count ?? 0);
  const [hiddenAtCount, setHiddenAtCount] = useState<number | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  if (count === 0 || hiddenAtCount === count) return null;

  const retry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await system.backendConnector.retryQuarantinedWrites(system.powersync);
    } catch (error) {
      debugLogger.warn('SYNC', 'Retrying quarantined writes failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <View
      className='absolute left-3 right-3 z-50 flex-row items-center rounded-xl bg-amber-600 px-4 py-3 shadow-lg dark:bg-amber-700'
      style={{ bottom: insets.bottom + 72 }}
    >
      <View className='flex-1 pr-3'>
        <Text className='text-sm font-bold text-white'>
          {count === 1 ? '1 change not synced' : `${count} changes not synced`}
        </Text>
        <Text className='text-xs leading-4 text-amber-50'>
          The server rejected them. They are saved on this phone.
        </Text>
      </View>
      <Pressable
        onPress={() => void retry()}
        disabled={isRetrying}
        className='rounded-md bg-white/20 px-3 py-2'
      >
        <Text className='text-xs font-semibold text-white'>{isRetrying ? 'Retrying…' : 'Retry'}</Text>
      </Pressable>
      <Pressable onPress={() => setHiddenAtCount(count)} className='ml-1 px-2 py-2'>
        <Text className='text-xs text-white'>Hide</Text>
      </Pressable>
    </View>
  );
}
