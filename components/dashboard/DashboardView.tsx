import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import {
  useCurrentPayrollPeriod,
  usePayrollSchedules,
  useTodaySchedules,
} from '@/services/data/dashboard';
import { formatTimeUTC, formatDateReadable } from '@/utils/date';
import { getTechnicianName } from '@/providers/PowerSyncProvider';
import { sortSchedulesByTime, openMaps } from '@/utils/dashboard';

interface DashboardViewProps {
  userId: string;
  isManager: boolean;
}

export function DashboardView({ userId, isManager }: DashboardViewProps) {
  const [showSchedules, setShowSchedules] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data: todaySchedules = [] } = useTodaySchedules();
  const { data: currentPayroll = [] } = useCurrentPayrollPeriod();
  const { data: payrollSchedules = [] } = usePayrollSchedules(
    currentPayroll[0]?.id,
    isManager,
    userId
  );

  const sortedTodaySchedules = sortSchedulesByTime(todaySchedules);
  const totalHours = payrollSchedules.reduce(
    (acc, schedule) => acc + (schedule.hours || 0),
    0
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate a refresh
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const renderScheduleItem = (schedule: any) => {
    if (!schedule?.startDateTime) return null;

    const technicians = (() => {
      try {
        return typeof schedule.assignedTechnicians === 'string'
          ? JSON.parse(schedule.assignedTechnicians)
          : schedule.assignedTechnicians;
      } catch (error) {
        return [];
      }
    })();

    const isAssignedToCurrentUser =
      !isManager && Array.isArray(technicians) && technicians.includes(userId);

    // Only show jobs assigned to the technician when in technician mode
    if (!isManager && !isAssignedToCurrentUser) {
      return null;
    }

    return (
      <TouchableOpacity
        key={schedule.id}
        className='border-l-4 border-l-darkGreen p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm'
        onPress={() => openMaps(schedule.jobTitle, schedule.location)}
      >
        <StatusBar barStyle='light-content' backgroundColor='#22543D' />
        <View className='flex-row justify-between items-start'>
          <View className='flex-1'>
            <Text className='font-semibold text-gray-900 dark:text-gray-200 text-lg'>
              {schedule.jobTitle?.trim() || 'Untitled Job'}
            </Text>
            <Text className='text-gray-600 dark:text-gray-400 mt-1'>
              {formatTimeUTC(schedule.startDateTime)}
            </Text>
            <Text className='text-gray-600 dark:text-gray-400 mt-1'>
              {schedule.location || 'No location specified'}
            </Text>

            {/* Only show technician list for managers */}
            {isManager && technicians?.length > 0 && (
              <View className='mt-2'>
                <Text className='text-gray-500 dark:text-gray-400 text-sm'>
                  Technicians:
                </Text>
                {technicians.map((techId: string) => (
                  <Text
                    key={techId}
                    className='text-gray-700 dark:text-gray-300 text-sm ml-2'
                  >
                    • {getTechnicianName(techId) || 'Unknown Technician'}
                  </Text>
                ))}
              </View>
            )}
          </View>

          <View className='bg-darkGreen/10 p-2 rounded-full'>
            <Ionicons name='location' size={20} color='#047857' />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPayrollSchedule = (schedule: any) => (
    <View
      key={schedule.id}
      className='border-b border-gray-100 dark:border-gray-800 py-3'
    >
      <Text className='text-gray-900 dark:text-gray-200 font-medium'>
        {schedule.jobTitle}
      </Text>
      <View className='flex-row justify-between mt-1'>
        <Text className='text-gray-600 dark:text-gray-400'>
          {formatDateReadable(schedule.date)}
        </Text>
        <Text className='text-gray-600 dark:text-gray-400'>
          {schedule.hours}h
        </Text>
      </View>
      <Text className='text-gray-500 dark:text-gray-500 text-sm mt-1'>
        {schedule.location}
      </Text>

      {/* Only show technicians for managers */}
      {isManager && schedule.assignedTechnicians && (
        <View className='mt-1'>
          <Text className='text-gray-500 dark:text-gray-400 text-sm'>
            Technicians:
          </Text>
          {(typeof schedule.assignedTechnicians === 'string'
            ? JSON.parse(schedule.assignedTechnicians)
            : schedule.assignedTechnicians
          ).map((techId: string) => (
            <Text
              key={techId}
              className='text-gray-600 dark:text-gray-500 text-sm ml-2'
            >
              • {getTechnicianName(techId)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView className='flex-1 bg-gray-50 dark:bg-gray-900'>
      <StatusBar barStyle='dark-content' backgroundColor='#F9FAFB' />

      <ScrollView
        className='flex-1'
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className='p-4 flex flex-col gap-4'>
          {/* Welcome Section */}
          <View className='bg-white dark:bg-gray-800 rounded-lg p-5 shadow-sm'>
            <Text className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              Welcome back, {isManager ? 'Manager' : 'Technician'}!
            </Text>
          </View>

          {/* Today's Schedule */}
          <View className='bg-white dark:bg-gray-800 rounded-lg p-5 shadow-sm'>
            <View className='flex-row justify-between items-center mb-4'>
              <View className='flex-row items-center'>
                <Ionicons name='calendar' size={20} color='#059669' />
                <Text className='text-lg font-bold text-gray-900 dark:text-gray-100 ml-2'>
                  Today's Schedule
                </Text>
              </View>
              <Text className='text-sm text-gray-500 dark:text-gray-400'>
                {sortedTodaySchedules.length}{' '}
                {sortedTodaySchedules.length === 1 ? 'job' : 'jobs'}
              </Text>
            </View>

            {!sortedTodaySchedules?.length ? (
              <View className='items-center py-6'>
                <Ionicons name='calendar-outline' size={48} color='#D1D5DB' />
                <Text className='text-gray-500 dark:text-gray-400 mt-2'>
                  No appointments scheduled for today
                </Text>
              </View>
            ) : (
              <View className='flex flex-col gap-3'>
                {sortedTodaySchedules.map(renderScheduleItem).filter(Boolean)}
              </View>
            )}
          </View>

          {/* Hours Summary */}
          <View className='bg-white dark:bg-gray-800 rounded-lg p-5 shadow-sm'>
            <View className='flex-row justify-between items-center mb-4'>
              <View className='flex-row items-center'>
                <Ionicons name='time' size={20} color='#059669' />
                <Text className='text-lg font-bold text-gray-900 dark:text-gray-100 ml-2'>
                  Hours Summary
                </Text>
              </View>
            </View>

            {currentPayroll[0] ? (
              <View className='bg-gray-50 dark:bg-gray-700 rounded-lg p-4'>
                <View className='flex-row justify-between mb-3'>
                  <View>
                    <Text className='text-gray-500 dark:text-gray-400 text-sm'>
                      Period
                    </Text>
                    <Text className='text-gray-900 dark:text-gray-200 font-medium'>
                      {formatDateReadable(currentPayroll[0].startDate)} -{' '}
                      {formatDateReadable(currentPayroll[0].endDate)}
                    </Text>
                  </View>
                  <View className='items-end'>
                    {isManager ? (
                      <>
                        <Text className='text-gray-500 dark:text-gray-400 text-sm'>
                          Pay Day
                        </Text>
                        <Text className='text-gray-900 dark:text-gray-200 font-medium'>
                          {formatDateReadable(currentPayroll[0].payDay)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text className='text-gray-500 dark:text-gray-400 text-sm'>
                          Total Hours
                        </Text>
                        <Text className='text-gray-900 dark:text-gray-200 text-xl font-bold'>
                          {totalHours}h
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setShowSchedules(!showSchedules)}
                  className='flex-row justify-between items-center bg-white dark:bg-gray-600 p-3 rounded-lg mt-2'
                >
                  <Text className='text-gray-800 dark:text-gray-200 font-medium'>
                    View {isManager ? 'All' : 'My'} Schedules (
                    {payrollSchedules.length})
                  </Text>
                  <MaterialIcons
                    name={showSchedules ? 'expand-less' : 'expand-more'}
                    size={24}
                    color='#6B7280'
                  />
                </TouchableOpacity>

                {showSchedules && (
                  <View className='mt-3'>
                    {payrollSchedules.map(renderPayrollSchedule)}
                  </View>
                )}
              </View>
            ) : (
              <View className='items-center py-6'>
                <Ionicons name='calendar-outline' size={48} color='#D1D5DB' />
                <Text className='text-gray-500 dark:text-gray-400 mt-2'>
                  No active payroll period found
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
