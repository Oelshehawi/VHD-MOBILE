import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, getDaysInMonth, startOfMonth, getDay } from 'date-fns';

interface DatePickerInputProps {
  value?: string;
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
}

/**
 * DatePickerInput Component
 * Single-date picker that stores values as yyyy-MM-dd.
 */
export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  value,
  onChange,
  label = 'Select Date',
  placeholder = 'Select date',
  error
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(value || '');
  const [calendarMonth, setCalendarMonth] = useState(value ? parseISO(value) : new Date());
  const colorScheme = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#F2EFEA' : '#4B5563';

  const generateCalendarDays = (date: Date) => {
    const firstDay = startOfMonth(date);
    const daysInMonth = getDaysInMonth(date);
    const startingDayOfWeek = getDay(firstDay); // 0 = Sunday

    const days: (number | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    while (days.length < 42) {
      days.push(null);
    }

    return days;
  };

  const handleDateSelect = (day: number) => {
    const nextDate = format(
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day),
      'yyyy-MM-dd'
    );
    setSelectedDate(nextDate);
  };

  const handleConfirm = () => {
    if (!selectedDate) return;
    onChange(selectedDate);
    setShowDatePicker(false);
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    setCalendarMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + (direction === 'prev' ? -1 : 1));
      return next;
    });
  };

  const calendarDays = generateCalendarDays(calendarMonth);
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const displayValue = value ? format(parseISO(value), 'MMM d, yyyy') : placeholder;

  return (
    <View className='mb-4'>
      <Text className='text-gray-700 dark:text-gray-300 font-semibold mb-2'>{label}</Text>

      <TouchableOpacity
        onPress={() => {
          setSelectedDate(value || '');
          setCalendarMonth(value ? parseISO(value) : new Date());
          setShowDatePicker(true);
        }}
        className={`flex-row items-center justify-between rounded-xl border bg-[#F0EDE6] p-4 dark:bg-[#1F1C16] ${
          error ? 'border-red-500' : 'border-black/10 dark:border-white/10'
        }`}
      >
        <Text className={`${value ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
          {displayValue}
        </Text>
        <Ionicons name='calendar-outline' size={20} color={error ? '#ef4444' : iconColor} />
      </TouchableOpacity>

      {error && <Text className='text-red-500 text-sm mt-2'>{error}</Text>}

      <Modal
        visible={showDatePicker}
        transparent
        animationType='slide'
        onRequestClose={() => setShowDatePicker(false)}
      >
        <SafeAreaView className='flex-1 bg-black/50 justify-end'>
          <View className='rounded-t-2xl bg-white p-6 dark:bg-[#16140F]'>
            <View className='flex-row justify-between items-center mb-4'>
              <Text className='text-lg font-bold text-gray-900 dark:text-white'>Select Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Ionicons name='close' size={24} color={iconColor} />
              </TouchableOpacity>
            </View>

            <View className='flex-row items-center justify-between mb-4 px-2'>
              <TouchableOpacity onPress={() => handleMonthChange('prev')}>
                <Ionicons name='chevron-back' size={24} color='#D97706' />
              </TouchableOpacity>
              <Text className='text-lg font-bold text-gray-900 dark:text-white'>
                {format(calendarMonth, 'MMMM yyyy')}
              </Text>
              <TouchableOpacity onPress={() => handleMonthChange('next')}>
                <Ionicons name='chevron-forward' size={24} color='#D97706' />
              </TouchableOpacity>
            </View>

            <View className='flex-row gap-1 mb-2'>
              {dayLabels.map((day) => (
                <Text
                  key={day}
                  className='flex-1 text-center text-xs font-semibold text-gray-600 dark:text-gray-400'
                >
                  {day}
                </Text>
              ))}
            </View>

            <View style={{ minHeight: 260 }}>
              {Array.from({ length: 6 }).map((_, weekIndex) => (
                <View key={weekIndex} className='flex-row gap-1 mb-1'>
                  {calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7).map((day, dayIndex) => {
                    if (day === null) {
                      return (
                        <View
                          key={`${weekIndex}-${dayIndex}`}
                          className='flex-1 aspect-square bg-transparent'
                        />
                      );
                    }

                    const dateStr = format(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day),
                      'yyyy-MM-dd'
                    );
                    const isSelected = selectedDate === dateStr;

                    return (
                      <TouchableOpacity
                        key={`${weekIndex}-${dayIndex}`}
                        onPress={() => handleDateSelect(day)}
                        className={`flex-1 aspect-square items-center justify-center rounded ${
                          isSelected
                            ? 'bg-[#14110F] dark:bg-amber-400'
                            : 'bg-[#F0EDE6] dark:bg-[#1F1C16]'
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium ${
                            isSelected
                              ? 'font-bold text-white dark:text-[#14110F]'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            <View className='flex-row gap-3 mt-4'>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                className='flex-1 rounded-xl bg-[#F0EDE6] p-4 dark:bg-[#2A261D]'
              >
                <Text className='text-center font-semibold text-gray-900 dark:text-white'>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={!selectedDate}
                className={`flex-1 rounded-xl p-4 ${
                  selectedDate ? 'bg-[#14110F] dark:bg-amber-400' : 'bg-gray-400'
                }`}
              >
                <Text className='text-center font-semibold text-white dark:text-[#14110F]'>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};
