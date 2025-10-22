import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
  addWeeks,
  parseISO,
  startOfDay,
} from 'date-fns';
import { Schedule } from '@/types';
import Ionicons from '@expo/vector-icons/Ionicons';

interface WeekViewProps {
  schedules: Schedule[];
  selectedDate: string;
  onDateSelect: (date: string) => void;
  onSchedulePress: (schedule: Schedule) => void;
}

const TIME_SLOTS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM to 10 PM (9 PM inclusive)
const SCREEN_WIDTH = Dimensions.get('window').width;
const TIME_COLUMN_WIDTH = 60;
const DAY_COLUMN_WIDTH = (SCREEN_WIDTH - TIME_COLUMN_WIDTH) / 7;

export function WeekView({
  schedules,
  selectedDate,
  onDateSelect,
  onSchedulePress,
}: WeekViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(selectedDate), { weekStartsOn: 0 })
  );

  // Generate 7 days for the week (Sunday to Saturday)
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)),
    [currentWeekStart]
  );

  // Navigate to previous week
  const goToPreviousWeek = useCallback(() => {
    setCurrentWeekStart((prev) => addWeeks(prev, -1));
  }, []);

  // Navigate to next week
  const goToNextWeek = useCallback(() => {
    setCurrentWeekStart((prev) => addWeeks(prev, 1));
  }, []);

  // Jump to today's week
  const goToToday = useCallback(() => {
    const today = startOfWeek(new Date(), { weekStartsOn: 0 });
    setCurrentWeekStart(today);
    onDateSelect(startOfDay(new Date()).toISOString());
  }, [onDateSelect]);

  // Get color based on schedule status
  const getScheduleColor = (schedule: Schedule): string => {
    if (schedule.confirmed) return 'bg-green-500';
    if (schedule.deadRun) return 'bg-red-500';
    return 'bg-blue-500';
  };

  // Get schedules for a specific day and hour
  const getSchedulesForSlot = useCallback(
    (day: Date, hour: number): Schedule[] => {
      return schedules.filter((schedule) => {
        try {
          const scheduleDate = parseISO(schedule.startDateTime);
          return (
            isSameDay(scheduleDate, day) && scheduleDate.getHours() === hour
          );
        } catch (err) {
          console.error('Error parsing schedule date:', err);
          return false;
        }
      });
    },
    [schedules]
  );

  return (
    <View className="flex-1 bg-white dark:bg-gray-950">
      {/* Week Navigation Bar */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <TouchableOpacity
          onPress={goToPreviousWeek}
          className="flex-row items-center px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
        >
          <Ionicons
            name="chevron-back"
            size={18}
            color="#6b7280"
          />
          <Text className="text-sm text-gray-600 dark:text-gray-400 ml-1">
            Prev
          </Text>
        </TouchableOpacity>

        <View className="flex-1 items-center">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {format(currentWeekStart, 'MMM d')} -{' '}
            {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
          </Text>
        </View>

        <TouchableOpacity
          onPress={goToToday}
          className="px-3 py-2 bg-blue-500 rounded-lg mx-2"
        >
          <Text className="text-sm text-white font-medium">Today</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToNextWeek}
          className="flex-row items-center px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
        >
          <Text className="text-sm text-gray-600 dark:text-gray-400 mr-1">
            Next
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color="#6b7280"
          />
        </TouchableOpacity>
      </View>

      {/* Week Header with Day Names */}
      <View className="flex-row border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        {/* Empty space for time column */}
        <View style={{ width: TIME_COLUMN_WIDTH }} className="border-r border-gray-200 dark:border-gray-800" />

        {weekDays.map((day, index) => {
          const isSelected = isSameDay(day, new Date(selectedDate));
          const isTodayDay = isToday(day);

          return (
            <TouchableOpacity
              key={index}
              style={{ width: DAY_COLUMN_WIDTH }}
              className={`py-3 items-center border-r border-gray-200 dark:border-gray-800 ${
                isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
              } ${isTodayDay ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
              onPress={() => onDateSelect(startOfDay(day).toISOString())}
            >
              <Text
                className={`text-xs font-medium ${
                  day.getDay() === 0
                    ? 'text-red-500'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {format(day, 'EEE')}
              </Text>
              <Text
                className={`text-lg font-bold mt-1 ${
                  isTodayDay
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-900 dark:text-white'
                }`}
              >
                {format(day, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Scrollable Time Grid */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={true}>
        {TIME_SLOTS.map((hour) => {
          const timeLabel = format(new Date().setHours(hour, 0, 0, 0), 'ha');

          return (
            <View
              key={hour}
              className="flex-row border-b border-gray-100 dark:border-gray-800"
              style={{ minHeight: 80 }}
            >
              {/* Time Label Column */}
              <View
                style={{ width: TIME_COLUMN_WIDTH }}
                className="items-center justify-start pt-2 border-r border-gray-200 dark:border-gray-800"
              >
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {timeLabel}
                </Text>
              </View>

              {/* Day Columns */}
              {weekDays.map((day, dayIndex) => {
                const slotSchedules = getSchedulesForSlot(day, hour);

                return (
                  <View
                    key={dayIndex}
                    style={{ width: DAY_COLUMN_WIDTH }}
                    className="border-r border-gray-100 dark:border-gray-800 p-1"
                  >
                    {slotSchedules.map((schedule) => (
                      <TouchableOpacity
                        key={schedule.id}
                        className={`${getScheduleColor(schedule)} rounded-md p-2 mb-1`}
                        onPress={() => onSchedulePress(schedule)}
                        activeOpacity={0.7}
                      >
                        <Text
                          className="text-xs font-semibold text-white"
                          numberOfLines={2}
                        >
                          {schedule.jobTitle}
                        </Text>
                        <Text
                          className="text-[10px] text-white opacity-90 mt-1"
                          numberOfLines={1}
                        >
                          {schedule.location}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
