import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useDashboard } from '../../hooks/useDashboard';
import { formatTimeUTC, formatDateReadable } from '../../utils/date';
import { MaterialIcons } from '@expo/vector-icons';
import { EmployeeHours, PayrollSchedule } from '../../types';
import { Stack } from 'expo-router';

export default function HomeScreen() {
  const { data, loading, error, refreshDashboard } = useDashboard();
  const [showSchedules, setShowSchedules] = useState(false);

  const onRefresh = useCallback(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  const openMaps = useCallback((title: string, location: string) => {
    const query = encodeURIComponent(`${title} ${location}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.openURL(url);
  }, []);

  const renderPayrollSchedule = (schedule: PayrollSchedule) => (
    <View key={schedule._id} className='border-b border-gray-800 py-3'>
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
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View className='flex-1 bg-gray-950 justify-center items-center'>
          <Text className='text-gray-400'>Loading dashboard...</Text>
        </View>
      ) : error ? (
        <View className='flex-1 bg-gray-950 justify-center items-center p-4'>
          <Text className='text-red-500 text-center mb-4'>
            Error loading dashboard
          </Text>
          <Text className='text-gray-400 text-center'>{error.message}</Text>
        </View>
      ) : (
        <ScrollView
          className='flex-1 bg-gray-950'
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={onRefresh} />
          }
        >
          <View className='p-4 flex flex-col gap-4'>
            {/* Welcome Section */}
            <View className='bg-gray-900 rounded-lg p-4'>
              <Text className='text-2xl font-bold text-gray-200'>
                Welcome, {data?.name}
              </Text>
              <Text className='text-gray-400 mt-1'>
                {data?.canManage ? 'Manager' : 'Technician'}
              </Text>
            </View>

            {/* Today's Schedule */}
            <View className='bg-gray-900 rounded-lg p-4'>
              <Text className='text-lg font-bold text-gray-200 mb-2'>
                Today's Schedule
              </Text>
              {data?.todaySchedules.length === 0 ? (
                <Text className='text-gray-400'>
                  No appointments scheduled for today
                </Text>
              ) : (
                <View className='flex flex-col gap-3'>
                  {data?.todaySchedules.map((schedule) => (
                    <TouchableOpacity
                      key={schedule._id}
                      className='border-l-4 border-l-darkGreen p-3 bg-gray-800 rounded'
                      onPress={() =>
                        openMaps(schedule.jobTitle, schedule.location)
                      }
                    >
                      <View className='flex-row justify-between items-start'>
                        <View className='flex-1'>
                          <Text className='font-semibold text-gray-200 text-lg'>
                            {schedule.jobTitle}
                          </Text>
                          <Text className='text-gray-400 mt-1'>
                            {formatTimeUTC(schedule.startDateTime)}
                          </Text>
                          <Text className='text-gray-400 mt-1'>
                            {schedule.location}
                          </Text>
                        </View>
                        <MaterialIcons
                          name='directions'
                          size={24}
                          color='#0f766e'
                        />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Hours Summary or Current Payroll */}
            {data?.canManage ? (
              <View className='bg-gray-900 rounded-lg p-4'>
                <Text className='text-lg font-bold text-gray-200 mb-2'>
                  Hours Summary
                </Text>
                <View className='space-y-2'>
                  {data.employeeHours?.map((emp: EmployeeHours) => (
                    <View
                      key={emp.userId}
                      className='flex-row justify-between items-center'
                    >
                      <Text className='text-gray-200'>{emp.name}</Text>
                      <Text className='text-white font-bold'>{emp.hours}h</Text>
                    </View>
                  ))}
                  <View className='mt-4 pt-4 border-t border-gray-800'>
                    <View className='flex-row justify-between items-center'>
                      <Text className='text-gray-200 font-bold'>
                        Total Hours
                      </Text>
                      <Text className='text-white font-bold text-xl'>
                        {data.totalHours}h
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : data?.currentPayroll ? (
              <View className='bg-gray-900 rounded-lg p-4'>
                <Text className='text-lg font-bold text-gray-200 mb-2'>
                  Current Pay Period
                </Text>
                <View className='bg-gray-800 rounded-lg p-3 mb-4'>
                  <View className='flex-row justify-between mb-2'>
                    <View>
                      <Text className='text-gray-400 text-sm'>Period</Text>
                      <Text className='text-gray-200'>
                        {formatDateReadable(data.currentPayroll.periodStart)} -{' '}
                        {formatDateReadable(data.currentPayroll.periodEnd)}
                      </Text>
                    </View>
                    <View className='items-end'>
                      <Text className='text-gray-400 text-sm'>Pay Day</Text>
                      <Text className='text-gray-200'>
                        {formatDateReadable(data.currentPayroll.payDay)}
                      </Text>
                    </View>
                  </View>
                  <View className='flex-row justify-between items-center mt-2 pt-2 border-t border-gray-700'>
                    <Text className='text-gray-200 font-medium'>
                      Total Hours
                    </Text>
                    <Text className='text-2xl font-bold text-white'>
                      {data.currentPayroll.totalHours}h
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setShowSchedules(!showSchedules)}
                  className='flex-row justify-between items-center bg-gray-800 p-3 rounded-lg mb-2'
                >
                  <Text className='text-gray-200 font-medium'>
                    View Schedules ({data.currentPayroll.schedules.length})
                  </Text>
                  <MaterialIcons
                    name={showSchedules ? 'expand-less' : 'expand-more'}
                    size={24}
                    color='#9ca3af'
                  />
                </TouchableOpacity>

                {showSchedules && (
                  <View className='space-y-1 mt-2'>
                    {data.currentPayroll.schedules.map(renderPayrollSchedule)}
                  </View>
                )}
              </View>
            ) : (
              <View className='bg-gray-900 rounded-lg p-4'>
                <Text className='text-lg font-bold text-gray-200 mb-2'>
                  No Active Pay Period
                </Text>
                <Text className='text-gray-400'>
                  There is no active payroll period at the moment.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </>
  );
}
