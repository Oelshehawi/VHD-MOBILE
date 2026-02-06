import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { format, addMonths, subMonths } from 'date-fns';

interface MonthHeaderProps {
  currentDate: Date;
  onMonthChange: (date: Date) => void;
}

export function MonthHeader({ currentDate, onMonthChange }: MonthHeaderProps) {
  return (
    <View className='flex-row justify-between items-center px-2 py-3'>
      <TouchableOpacity
        onPress={() => onMonthChange(subMonths(currentDate, 1))}
        className='h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-full items-center justify-center'
      >
        <Text className='text-gray-800 dark:text-gray-200 text-xl leading-none'>←</Text>
      </TouchableOpacity>
      <Text className='text-xl font-bold text-gray-800 dark:text-gray-200'>
        {format(currentDate, 'MMMM yyyy')}
      </Text>
      <TouchableOpacity
        onPress={() => onMonthChange(addMonths(currentDate, 1))}
        className='h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-full items-center justify-center'
      >
        <Text className='text-gray-800 dark:text-gray-200 text-xl leading-none'>→</Text>
      </TouchableOpacity>
    </View>
  );
}
