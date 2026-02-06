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
 * Displays a visual representation of technician's availability patterns
 */
export const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({ availability }) => {
  // Group availability by day of week for recurring patterns
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

  // Sort one-time availability by date
  oneTimeAvailability.sort(
    (a, b) => new Date(a.specificDate!).getTime() - new Date(b.specificDate!).getTime()
  );

  if (availability.length === 0) {
    return (
      <View className='bg-gray-50 dark:bg-gray-800 p-4 rounded-lg'>
        <Text className='text-gray-600 dark:text-gray-400 text-center'>
          No availability set yet. Add your first availability block.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className='space-y-4'>
      {/* Recurring Availability */}
      {Object.keys(recurringByDay).length > 0 && (
        <View className='bg-white dark:bg-gray-700 p-4 rounded-lg'>
          <Text className='text-lg font-bold text-gray-900 dark:text-white mb-4'>
            Weekly Availability
          </Text>

          {[0, 1, 2, 3, 4, 5, 6].map((dayNum) => {
            const blocks = recurringByDay[dayNum];
            if (!blocks || blocks.length === 0) return null;

            return (
              <View key={`day-${dayNum}`} className='mb-4'>
                <Text className='font-semibold text-gray-800 dark:text-gray-100 mb-2'>
                  {getDayName(dayNum)}
                </Text>
                {blocks.map((block) => (
                  <View
                    key={block.id}
                    className='bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500 p-3 mb-2 rounded'
                  >
                    <View className='flex-row justify-between items-start'>
                      <View className='flex-1'>
                        {block.isFullDay ? (
                          <Text className='text-gray-800 dark:text-white font-semibold'>
                            Full Day Available
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

      {/* One-Time Availability */}
      {oneTimeAvailability.length > 0 && (
        <View className='bg-white dark:bg-gray-700 p-4 rounded-lg'>
          <Text className='text-lg font-bold text-gray-900 dark:text-white mb-4'>
            Specific Date Availability
          </Text>

          {oneTimeAvailability.map((block) => (
            <View
              key={block.id}
              className='bg-green-50 dark:bg-green-900 border-l-4 border-green-500 p-3 mb-2 rounded'
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
