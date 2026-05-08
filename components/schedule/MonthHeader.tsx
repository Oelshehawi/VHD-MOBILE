import React from 'react';
import { Pressable, useColorScheme, View } from 'react-native';
import { format, addMonths, subMonths } from 'date-fns';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';

interface MonthHeaderProps {
  currentDate: Date;
  onMonthChange: (date: Date) => void;
}

export function MonthHeader({ currentDate, onMonthChange }: MonthHeaderProps) {
  const colorScheme = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#F2EFEA' : '#14110F';

  return (
    <View className='flex-row items-center gap-2 px-4 py-3'>
      <Pressable
        onPress={() => onMonthChange(subMonths(currentDate, 1))}
        className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
      >
        <Ionicons name='chevron-back' size={18} color={iconColor} />
      </Pressable>
      <View className='flex-1 items-center'>
        <Text className='text-lg font-bold text-[#14110F] dark:text-white'>
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        <Text className='mt-1 text-xs font-medium text-gray-500 dark:text-gray-400'>
          Month overview
        </Text>
      </View>
      <Pressable
        onPress={() => onMonthChange(addMonths(currentDate, 1))}
        className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
      >
        <Ionicons name='chevron-forward' size={18} color={iconColor} />
      </Pressable>
    </View>
  );
}
