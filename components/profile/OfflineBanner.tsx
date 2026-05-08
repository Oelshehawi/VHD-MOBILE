import { View } from 'react-native';
import { Text } from '@/components/ui/text';

interface OfflineBannerProps {
  visible: boolean;
}

export function OfflineBanner({ visible }: OfflineBannerProps) {
  if (!visible) return null;

  return (
    <View className='bg-amber-100 dark:bg-amber-950/70 p-3 rounded-xl mb-4 border border-amber-200 dark:border-amber-800'>
      <Text className='text-yellow-800 dark:text-yellow-200 text-center'>
        Offline Mode - Limited functionality available
      </Text>
    </View>
  );
}
