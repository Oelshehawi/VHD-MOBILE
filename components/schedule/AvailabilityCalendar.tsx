import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import {
  getDayName,
  formatTo12Hour,
  formatAvailabilityDisplay
} from '../../utils/availabilityValidation';
import type { Availability } from '../../services/database/schema';

interface AvailabilityCalendarProps {
  availability: Availability[];
}

/**
 * AvailabilityCalendar Component
 * Displays unavailable-time blockers. No blocker means available.
 */
export const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({ availability }) => {
  // Group unavailable blocks by day of week for recurring patterns
  const recurringByDay: { [key: number]: Availability[] } = {};
  const oneTimeAvailability: Availability[] = [];

  availability.forEach((av) => {
    if (av.isRecurring && av.dayOfWeek !== null) {
      if (!recurringByDay[av.dayOfWeek!]) {
        recurringByDay[av.dayOfWeek!] = [];
      }
      recurringByDay[av.dayOfWeek!].push(av);
    } else if (!av.isRecurring && av.specificDate) {
      oneTimeAvailability.push(av);
    }
  });

  // Sort one-time unavailable blocks by date
  oneTimeAvailability.sort(
    (a, b) => new Date(a.specificDate!).getTime() - new Date(b.specificDate!).getTime()
  );

  if (availability.length === 0) {
    return (
      <View className='rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#16140F]'>
        <Text className='text-center font-medium text-gray-600 dark:text-gray-300'>
          No unavailable blocks. You are available by default.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className='space-y-4'>
      {/* Recurring unavailable blocks */}
      {Object.keys(recurringByDay).length > 0 && (
        <View className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
          <Text className='mb-4 text-lg font-bold text-[#14110F] dark:text-white'>
            Weekly Unavailability
          </Text>

          {[0, 1, 2, 3, 4, 5, 6].map((dayNum) => {
            const blocks = recurringByDay[dayNum];
            if (!blocks || blocks.length === 0) return null;

            return (
              <View key={`day-${dayNum}`} className='mb-4'>
                <Text className='mb-2 font-semibold text-gray-800 dark:text-gray-100'>
                  {getDayName(dayNum)}
                </Text>
                {blocks.map((block) => (
                  <View
                    key={block.id}
                    className='mb-2 rounded-xl border-l-4 border-amber-500 bg-[#F0EDE6] p-3 dark:bg-[#1F1C16]'
                  >
                    <View className='flex-row justify-between items-start'>
                      <View className='flex-1'>
                        {block.isFullDay ? (
                          <Text className='text-gray-800 dark:text-white font-semibold'>
                            Full Day Unavailable
                          </Text>
                        ) : (
                          <Text className='text-gray-800 dark:text-white font-semibold'>
                            {formatTo12Hour(block.startTime || '')} -{' '}
                            {formatTo12Hour(block.endTime || '')}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}

      {/* One-time unavailable blocks */}
      {oneTimeAvailability.length > 0 && (
        <View className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
          <Text className='mb-4 text-lg font-bold text-[#14110F] dark:text-white'>
            Specific Date Unavailability
          </Text>

          {oneTimeAvailability.map((block) => (
            <View
              key={block.id}
              className='mb-2 rounded-xl border-l-4 border-amber-500 bg-[#F0EDE6] p-3 dark:bg-[#1F1C16]'
            >
              <Text className='text-gray-800 dark:text-white font-semibold'>
                {formatAvailabilityDisplay(block)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};
