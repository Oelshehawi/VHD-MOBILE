import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';  
interface FastImageViewerHeaderProps {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  rightAction?: React.ReactNode;
}

export const FastImageViewerHeader = ({
  title,
  subtitle,
  onClose,
  rightAction,
}: FastImageViewerHeaderProps) => {
  return (
    < SafeAreaView className='bg-black/70'>
       <View className='flex-row justify-between items-center p-6'>
        <View className='flex-1 pr-4'>
          {title && (
            <Text className='text-white text-lg font-semibold'>{title}</Text>
          )}
          {subtitle && (
            <Text className='text-gray-200 text-sm mt-1'>{subtitle}</Text>
          )}
        </View>

        <View className='flex-row items-center'>
          {rightAction}

          <TouchableOpacity
            onPress={onClose}
            className='w-11 h-11 rounded-2xl bg-black/30 items-center justify-center min-w-[44px] min-h-[44px] ml-2'
            hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
          >
            <Ionicons name='close' size={24} color='white' />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};
