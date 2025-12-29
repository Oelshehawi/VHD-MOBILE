import { View } from 'react-native';
import { Text } from '@/components/ui/text';

interface OfflineBannerProps {
  visible: boolean;
}

export function OfflineBanner({ visible }: OfflineBannerProps) {
  if (!visible) return null;

  return (
    <View className="bg-yellow-600/20 p-3 rounded-lg mb-4">
      <Text className="text-yellow-800 dark:text-yellow-200 text-center">
        Offline Mode - Limited functionality available
      </Text>
    </View>
  );
}

