import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  useCurrentPayrollPeriod,
  usePayrollSchedules,
  useTodaySchedules,
} from '@/services/data/dashboard';
import { formatTimeUTC, formatDateReadable } from '@/utils/date';
import { sortSchedulesByTime, openMaps } from '@/utils/dashboard';
import { useState } from 'react';

interface TechnicianDashboardViewProps {
  userId: string;
}

export function TechnicianDashboardView({
  userId,
}: TechnicianDashboardViewProps) {
  const [showSchedules, setShowSchedules] = useState(false);
  const { data: todaySchedules = [] } = useTodaySchedules();
  const { data: currentPayroll = [] } = useCurrentPayrollPeriod();
  const { data: payrollSchedules = [] } = usePayrollSchedules(
    currentPayroll[0]?.id,
    false,
    userId
  );

  const sortedTodaySchedules = sortSchedulesByTime(todaySchedules);
  const totalHours = payrollSchedules.reduce(
    (acc, schedule) => acc + (schedule.hours || 0),
    0
  );

  const renderPayrollSchedule = (schedule: any) => (
    <View key={schedule.id} className='border-b border-gray-800 py-3'>
      <Text className='text-gray-200 font-medium'>{schedule.jobTitle}</Text>
      <View className='flex-row justify-between mt-1'>
        <Text className='text-gray-400'>
          {formatDateReadable(schedule.date)}
        </Text>
        <Text className='text-gray-400'>{schedule.hours}h</Text>
      </View>
      <Text className='text-gray-500 text-sm mt-1'>{schedule.location}</Text>
    </View>
  );

  return (
    <ScrollView className='flex-1 bg-gray-950'>
      <View className='p-4 flex flex-col gap-4'>
        {/* Welcome Section */}
        <View className='bg-gray-900 rounded-lg p-4'>
          <Text className='text-2xl font-bold text-gray-200'>
            Welcome back, Technician!
          </Text>
        </View>

        {/* Today's Schedule */}
        <View className='bg-gray-900 rounded-lg p-4'>
          <Text className='text-lg font-bold text-gray-200 mb-2'>
            Today's Schedule
          </Text>
          {!sortedTodaySchedules?.length ? (
            <Text className='text-gray-400'>
              No appointments scheduled for today
            </Text>
          ) : (
            <View className='flex flex-col gap-3'>
              {sortedTodaySchedules
                .map((schedule) => {
                  if (!schedule?.startDateTime) return null;

                  return (
                    <TouchableOpacity
                      key={schedule.id}
                      className='border-l-4 border-l-darkGreen p-3 bg-gray-800 rounded'
                      onPress={() =>
                        openMaps(schedule.jobTitle, schedule.location)
                      }
                    >
                      <View className='flex-row justify-between items-start'>
                        <View className='flex-1'>
                          <Text className='font-semibold text-gray-200 text-lg'>
                            {schedule.jobTitle?.trim() || 'Untitled Job'}
                          </Text>
                          <Text className='text-gray-400 mt-1'>
                            {formatTimeUTC(schedule.startDateTime)}
                          </Text>
                          <Text className='text-gray-400 mt-1'>
                            {schedule.location || 'No location specified'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
                .filter(Boolean)}
            </View>
          )}
        </View>

        {/* Hours Summary */}
        <View className='bg-gray-900 rounded-lg p-4'>
          <Text className='text-lg font-bold text-gray-200 mb-2'>
            Hours Summary
          </Text>
          {currentPayroll[0] && (
            <View className='bg-gray-800 rounded-lg p-3 mb-4'>
              <View className='flex-row justify-between mb-2'>
                <View>
                  <Text className='text-gray-400 text-sm'>Period</Text>
                  <Text className='text-gray-200'>
                    {formatDateReadable(currentPayroll[0].startDate)} -{' '}
                    {formatDateReadable(currentPayroll[0].endDate)}
                  </Text>
                </View>
                <View className='items-end'>
                  <Text className='text-gray-400 text-sm'>Total Hours</Text>
                  <Text className='text-gray-200 text-xl font-bold'>
                    {totalHours}h
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setShowSchedules(!showSchedules)}
                className='flex-row justify-between items-center bg-gray-700 p-3 rounded-lg mt-4'
              >
                <Text className='text-gray-200 font-medium'>
                  View My Schedules ({payrollSchedules.length})
                </Text>
                <MaterialIcons
                  name={showSchedules ? 'expand-less' : 'expand-more'}
                  size={24}
                  color='#9ca3af'
                />
              </TouchableOpacity>

              {showSchedules && (
                <View className='space-y-1 mt-2'>
                  {payrollSchedules.map(renderPayrollSchedule)}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
