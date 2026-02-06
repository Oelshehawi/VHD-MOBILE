import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDateRange, isWithin14Days } from '../../utils/availabilityValidation';
import { format, parseISO, addDays, getDaysInMonth, startOfMonth, getDay } from 'date-fns';

interface DateRangeSelectorProps {
  startDate: string | null;
  endDate: string | null;
  onDateRangeChange: (startDate: string, endDate: string) => void;
  label?: string;
  error?: string;
  minDate?: Date; // Minimum date allowed (default: 14 days from today)
}

/**
 * DateRangeSelector Component
 * Allows users to select a date range with enforced 14-day advance notice
 * Uses visual calendar picker for better UX
 */
export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  startDate,
  endDate,
  onDateRangeChange,
  label = 'Select Dates',
  error
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDateSelected, setStartDateSelected] = useState(startDate || '');
  const [endDateSelected, setEndDateSelected] = useState(endDate || '');
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Generate calendar days for the current month
  const generateCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = startOfMonth(date);
    const daysInMonth = getDaysInMonth(date);
    const startingDayOfWeek = getDay(firstDay); // 0 = Sunday

    const days: (number | null)[] = [];

    // Add empty slots for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    // Pad to 6 rows (42 days) for consistent height
    while (days.length < 42) {
      days.push(null);
    }

    return days;
  };

  const isDateDisabled = (day: number | null, month: Date): boolean => {
    if (day === null) return true;
    const dateStr = format(new Date(month.getFullYear(), month.getMonth(), day), 'yyyy-MM-dd');
    return isWithin14Days(dateStr);
  };

  const isInRange = (day: number | null, month: Date): boolean => {
    if (day === null || !startDateSelected || !endDateSelected) return false;
    const dateStr = format(new Date(month.getFullYear(), month.getMonth(), day), 'yyyy-MM-dd');
    return dateStr > startDateSelected && dateStr < endDateSelected;
  };

  const handleDateSelect = (day: number) => {
    const selectedDate = format(
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day),
      'yyyy-MM-dd'
    );

    if (!startDateSelected) {
      // First selection - set start date
      setStartDateSelected(selectedDate);
    } else if (!endDateSelected) {
      // Second selection - set end date
      if (selectedDate < startDateSelected) {
        alert('End date must be after or equal to start date');
        return;
      }
      setEndDateSelected(selectedDate);
    } else {
      // Both already selected, reset and start over
      setStartDateSelected(selectedDate);
      setEndDateSelected('');
    }
  };

  const handleConfirm = () => {
    if (startDateSelected && endDateSelected) {
      onDateRangeChange(startDateSelected, endDateSelected);
      setShowDatePicker(false);
      setStartDateSelected('');
      setEndDateSelected('');
    }
  };

  const handleReset = () => {
    setStartDateSelected('');
    setEndDateSelected('');
    setCalendarMonth(new Date());
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    setCalendarMonth((prev) => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(newMonth.getMonth() - 1);
      } else {
        newMonth.setMonth(newMonth.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const calendarDays = generateCalendarDays(calendarMonth);
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const displayValue =
    startDate && endDate ? formatDateRange(startDate, endDate) : 'Select date range';

  // Helper component: Calendar View
  const CalendarView = () => (
    <View>
      {/* Month/Year Header with Navigation */}
      <View className='flex-row items-center justify-between mb-4 px-2'>
        <TouchableOpacity onPress={() => handleMonthChange('prev')}>
          <Ionicons name='chevron-back' size={24} color='#3b82f6' />
        </TouchableOpacity>
        <Text className='text-lg font-bold text-gray-900 dark:text-white'>
          {format(calendarMonth, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity onPress={() => handleMonthChange('next')}>
          <Ionicons name='chevron-forward' size={24} color='#3b82f6' />
        </TouchableOpacity>
      </View>

      {/* Day Labels */}
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

      {/* Calendar Grid - Fixed 6 rows for consistent height */}
      <View style={{ minHeight: 260 }}>
        {Array.from({ length: 6 }).map((_, weekIndex) => (
          <View key={weekIndex} className='flex-row gap-1 mb-1'>
            {calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7).map((day, dayIndex) => {
              const isDisabled = isDateDisabled(day, calendarMonth);
              const dateStr =
                day !== null
                  ? format(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day),
                      'yyyy-MM-dd'
                    )
                  : null;
              const isCurrentDay = dateStr === format(new Date(), 'yyyy-MM-dd');
              const isSelectedStart = dateStr === startDateSelected;
              const isSelectedEnd = dateStr === endDateSelected;
              const inRange = isInRange(day, calendarMonth);

              return (
                <TouchableOpacity
                  key={dayIndex}
                  disabled={isDisabled}
                  onPress={() => day !== null && handleDateSelect(day)}
                  className={`flex-1 aspect-square items-center justify-center rounded ${
                    isDisabled
                      ? 'bg-gray-100 dark:bg-gray-700 opacity-50'
                      : isSelectedStart || isSelectedEnd
                        ? 'bg-blue-500'
                        : inRange
                          ? 'bg-blue-200 dark:bg-blue-800'
                          : isCurrentDay
                            ? 'bg-blue-100 dark:bg-blue-900'
                            : 'bg-gray-50 dark:bg-gray-700'
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      isDisabled
                        ? 'text-gray-400 dark:text-gray-600'
                        : isSelectedStart || isSelectedEnd
                          ? 'text-white font-bold'
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

      {/* Selection Status */}
      <View className='mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg'>
        <Text className='text-xs text-gray-700 dark:text-gray-300 text-center'>
          {!startDateSelected && 'Select start date (14+ days from today)'}
          {startDateSelected && !endDateSelected && `Start: ${startDateSelected} → Select end date`}
          {startDateSelected && endDateSelected && `${startDateSelected} to ${endDateSelected}`}
        </Text>
      </View>
    </View>
  );

  return (
    <View className='mb-4'>
      {label && (
        <Text className='text-gray-700 dark:text-gray-300 font-semibold mb-2'>{label}</Text>
      )}

      <TouchableOpacity
        onPress={() => {
          setCalendarMonth(new Date());
          setShowDatePicker(true);
          setStartDateSelected(startDate || '');
          setEndDateSelected(endDate || '');
        }}
        className={`flex-row items-center justify-between bg-white dark:bg-gray-700 p-4 rounded-lg border ${
          error ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
        }`}
      >
        <Text
          className={`${startDate && endDate ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}
        >
          {displayValue}
        </Text>
        <Ionicons name='calendar-outline' size={20} color={error ? '#ef4444' : '#666'} />
      </TouchableOpacity>

      {error && <Text className='text-red-500 text-sm mt-2'>{error}</Text>}

      {/* Single Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType='slide'
        onRequestClose={() => setShowDatePicker(false)}
      >
        <SafeAreaView className='flex-1 bg-black/50 justify-end'>
          <View className='bg-white dark:bg-gray-800 rounded-t-xl p-6'>
            <View className='flex-row justify-between items-center mb-4'>
              <Text className='text-lg font-bold text-gray-900 dark:text-white'>
                Select Date Range
              </Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Ionicons name='close' size={24} color='#666' />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className='mb-6'>
              <CalendarView />
            </ScrollView>

            {/* Action Buttons */}
            <View className='flex-row gap-3'>
              <TouchableOpacity
                onPress={() => {
                  handleReset();
                  setShowDatePicker(false);
                }}
                className='flex-1 bg-gray-300 dark:bg-gray-600 p-4 rounded-lg'
              >
                <Text className='text-center font-semibold text-gray-900 dark:text-white'>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={!startDateSelected || !endDateSelected}
                className={`flex-1 p-4 rounded-lg ${
                  startDateSelected && endDateSelected ? 'bg-blue-500' : 'bg-gray-400'
                }`}
              >
                <Text className='text-center font-semibold text-white'>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};
