import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useCallback, useState, useEffect } from 'react';
import { formatTimeUTC, formatDateReadable } from '../../utils/date';
import { MaterialIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { getTechnicianName } from '@/providers/PowerSyncProvider';
import { usePowerSync, useQuery } from '@powersync/react-native';
import { Schedule, PayrollPeriod, PayrollSchedule } from '@/types';

export default function HomeScreen() {
  const { getToken, userId } = useAuth();
  const [showSchedules, setShowSchedules] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const powerSync = usePowerSync();

  // Use PowerSync queries directly
  const { data: todaySchedules = [] } = useQuery<Schedule>(
    `SELECT * FROM schedules 
     WHERE date(startDateTime, 'localtime') = date('now', 'localtime')
     ORDER BY startDateTime ASC`
  );

  const { data: currentPayroll = [] } = useQuery<PayrollPeriod>(
    `SELECT * FROM payrollperiods 
     WHERE date(startDate) <= date('now', 'localtime')
     AND date(endDate) >= date('now', 'localtime')
     LIMIT 1`
  );

  const { data: payrollSchedules = [] } = useQuery<PayrollSchedule>(
    `SELECT 
      s.id,
      s.jobTitle,
      s.startDateTime as date,
      s.hours,
      s.location
     FROM schedules s
     WHERE s.payrollPeriod = ?
     AND (? IS NULL OR s.assignedTechnicians LIKE ?)
     ORDER BY s.startDateTime ASC`,
    [
      currentPayroll[0]?.id || '',
      isManager ? null : userId,
      userId ? `%${userId}%` : null,
    ]
  );

  const sortedTodaySchedules = todaySchedules
    .filter((schedule) => schedule.startDateTime)
    .sort((a, b) => {
      try {
        return (
          new Date(a.startDateTime).getTime() -
          new Date(b.startDateTime).getTime()
        );
      } catch (err) {
        console.error('Error sorting schedules:', err, {
          a: a.startDateTime,
          b: b.startDateTime,
        });
        return 0;
      }
    });

  const openMaps = useCallback((title: string, location: string) => {
    const query = encodeURIComponent(`${title} ${location}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.openURL(url);
  }, []);

  const renderPayrollSchedule = (schedule: PayrollSchedule) => (
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

  useEffect(() => {
    const checkManager = async () => {
      const token = await getToken();
      if (!token) {
        setIsManager(false);
        return;
      }

      try {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        setIsManager(decoded?.publicMetadata?.isManager || false);
      } catch (e) {
        console.error('Error decoding token:', e);
        setIsManager(false);
      }
    };

    checkManager();
  }, [getToken]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView className='flex-1 bg-gray-950'>
        <View className='p-4 flex flex-col gap-4'>
          {/* Welcome Section */}
          <View className='bg-gray-900 rounded-lg p-4'>
            <Text className='text-2xl font-bold text-gray-200'>
              Welcome back!
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
                {sortedTodaySchedules.map((schedule) => {
                  const technicians =
                    typeof schedule.assignedTechnicians === 'string'
                      ? JSON.parse(schedule.assignedTechnicians)
                      : schedule.assignedTechnicians;

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
                            {schedule.jobTitle.trim()}
                          </Text>
                          <Text className='text-gray-400 mt-1'>
                            {formatTimeUTC(schedule.startDateTime)}
                          </Text>
                          <Text className='text-gray-400 mt-1'>
                            {schedule.location}
                          </Text>
                          <View className='mt-2'>
                            <Text className='text-gray-400 text-sm'>
                              Technicians:
                            </Text>
                            {technicians.map((techId: string) => (
                              <Text
                                key={techId}
                                className='text-gray-300 text-sm ml-2'
                              >
                                {getTechnicianName(techId)}
                              </Text>
                            ))}
                          </View>
                        </View>
                        <MaterialIcons
                          name='directions'
                          size={24}
                          color='#0f766e'
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Hours Summary or Current Payroll */}
          {isManager ? (
            <View className='bg-gray-900 rounded-lg p-4'>
              <Text className='text-lg font-bold text-gray-200 mb-2'>
                Hours Summary
              </Text>
              <View className='space-y-2'>
                {payrollSchedules.map((schedule, index) => (
                  <View
                    key={index}
                    className='flex-row justify-between items-center'
                  >
                    <Text className='text-gray-200'>
                      {schedule.jobTitle}: {schedule.hours} hours
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : currentPayroll.length > 0 ? (
            <View className='bg-gray-900 rounded-lg p-4'>
              <Text className='text-lg font-bold text-gray-200 mb-2'>
                Current Pay Period
              </Text>
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
                    <Text className='text-gray-400 text-sm'>Pay Day</Text>
                    <Text className='text-gray-200'>
                      {formatDateReadable(currentPayroll[0].payDay)}
                    </Text>
                  </View>
                </View>
                <View className='flex-row justify-between items-center mt-2 pt-2 border-t border-gray-700'>
                  <Text className='text-gray-200 font-medium'>Total Hours</Text>
                  <Text className='text-2xl font-bold text-white'>
                    {payrollSchedules.reduce(
                      (sum, schedule) => sum + schedule.hours,
                      0
                    )}
                    h
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowSchedules(!showSchedules)}
                  className='flex-row justify-between items-center bg-gray-700 p-3 rounded-lg mt-4'
                >
                  <Text className='text-gray-200 font-medium'>
                    View Schedules ({payrollSchedules.length})
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
    </>
  );
}
