import { View } from 'react-native';
import { Text } from '@/components/ui/text';

interface InfoRowProps {
  label: string;
  value: string;
  className?: string;
}

export function InfoRow({ label, value, className }: InfoRowProps) {
  return (
    <View className={className}>
      <Text variant='small' className='text-gray-600 dark:text-gray-400'>
        {label}
      </Text>
      <Text className='text-gray-800 dark:text-gray-200'>{value}</Text>
    </View>
  );
}
