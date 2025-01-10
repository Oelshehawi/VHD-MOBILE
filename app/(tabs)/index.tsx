import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useCallback } from 'react';
import { useDashboard } from '../../hooks/useDashboard';
import { toLocalTime } from '../../utils/date';
import { Stack } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { EmployeeHours } from '../../types';

export default function HomeScreen() {
  const { data, loading, error, refreshDashboard } = useDashboard();

  const onRefresh = useCallback(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  const openMaps = useCallback((title: string, location: string) => {
    const query = encodeURIComponent(`${title} ${location}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.openURL(url);
  }, []);

  if (loading) {
    return (
      <View className='flex-1 bg-gray-950 justify-center items-center'>
        <Text className='text-gray-400'>Loading dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className='flex-1 bg-gray-950 justify-center items-center p-4'>
        <Text className='text-red-500 text-center mb-4'>
          Error loading dashboard
        </Text>
        <Text className='text-gray-400 text-center'>{error.message}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className='flex-1 bg-gray-950'
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={onRefresh} />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
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
                  onPress={() => openMaps(schedule.jobTitle, schedule.location)}
                >
                  <View className='flex-row justify-between items-start'>
                    <View className='flex-1'>
                      <Text className='font-semibold text-gray-200 text-lg'>
                        {schedule.jobTitle}
                      </Text>
                      <Text className='text-gray-400 mt-1'>
                        {toLocalTime(schedule.startDateTime).toLocaleTimeString(
                          'en-US',
                          {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZone: 'UTC',
                          }
                        )}
                      </Text>
                      <Text className='text-gray-400 mt-1'>
                        {schedule.location}
                      </Text>
                      <Text className='text-gray-400 mt-1'>
                        Duration: {schedule.hours} hours
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

        {/* Hours Summary */}
        <View className='bg-gray-900 rounded-lg p-4'>
          <Text className='text-lg font-bold text-gray-200 mb-2'>
            Hours Summary
          </Text>
          {data?.canManage ? (
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
                  <Text className='text-gray-200 font-bold'>Total Hours</Text>
                  <Text className='text-white font-bold text-xl'>
                    {data.totalHours}h
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View>
              <Text className='text-3xl font-bold text-white'>
                {data?.totalHours}h
              </Text>
              <Text className='text-gray-400'>Total hours today</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
