import { Linking, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocationPermissionState } from '@/components/location/useLocationPermissionState';

function describeState(kind: string): string {
  switch (kind) {
    case 'services-disabled':
      return 'Location services are off. Turn them on to enable tracking.';
    case 'foreground-denied':
      return 'Location permission is required for tracking. Tap to allow.';
    case 'background-denied':
      return 'Background location is required for tracking. Tap to update.';
    default:
      return 'Location tracking unavailable.';
  }
}

export function LocationPermissionBanner() {
  const state = useLocationPermissionState();
  if (!state || state.kind === 'granted' || state.kind === 'unavailable') {
    return null;
  }

  return (
    <Pressable
      onPress={() => {
        Linking.openSettings().catch(() => undefined);
      }}
      className='mb-4 rounded-xl border border-amber-200 bg-amber-100 p-3 dark:border-amber-800 dark:bg-amber-950/70'
    >
      <View className='flex-row items-center gap-2'>
        <Text className='flex-1 text-sm font-medium text-yellow-900 dark:text-yellow-200'>
          {describeState(state.kind)}
        </Text>
      </View>
    </Pressable>
  );
}
