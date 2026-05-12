import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  useCurrentPayrollPeriod,
  usePayrollSchedules,
  useTodaySchedules
} from '@/services/data/dashboard';
import { formatDateShort } from '@/utils/date';
import { roundHoursToBucket, formatHoursDisplay } from '@/utils/hoursFormatting';
import { getTechnicianName } from '@/providers/PowerSyncProvider';
import { getRemainingTodaySchedules, openMaps } from '@/utils/dashboard';
import {
  formatScheduleDateReadable,
  formatScheduleTime,
  getScheduleSortTime,
  getScheduleStartAtUtc
} from '@/utils/scheduleTime';
import { ThemeSelectorModal } from '@/components/common/ThemeSelectorModal';
import { useTheme } from '@/providers/ThemeProvider';
import { ReviewQRCodeModal } from '@/components/dashboard/ReviewQRCodeModal';
import { JobDetailModal } from '@/components/schedule/JobDetailModal';
import type { Schedule } from '@/types';

interface DashboardViewProps {
  userId: string;
  isManager: boolean;
}

export function DashboardView({ userId, isManager }: DashboardViewProps) {
  const [showSchedules, setShowSchedules] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [jobDetailVisible, setJobDetailVisible] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const googleReviewUrl = 'https://g.page/r/CRLDtlapvtO3EAE/review';
  const { colorScheme } = useTheme();
  const { data: todaySchedules = [] } = useTodaySchedules();
  const { data: currentPayroll = [] } = useCurrentPayrollPeriod();
  const { data: payrollSchedules = [] } = usePayrollSchedules(
    currentPayroll[0]?.id,
    isManager,
    userId
  );
  const sortedPayrollSchedules = useMemo(
    () => [...payrollSchedules].sort((a, b) => getScheduleSortTime(a) - getScheduleSortTime(b)),
    [payrollSchedules]
  );

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const remainingTodaySchedules = getRemainingTodaySchedules(todaySchedules, now);
  const parseAssignedTechnicians = (assignedTechnicians: unknown): string[] => {
    try {
      if (typeof assignedTechnicians === 'string') {
        const parsed = JSON.parse(assignedTechnicians);
        return Array.isArray(parsed) ? parsed : [];
      }
      return Array.isArray(assignedTechnicians) ? assignedTechnicians : [];
    } catch {
      return [];
    }
  };
  const visibleTodaySchedules = remainingTodaySchedules.filter((schedule) => {
    if (isManager) return true;
    return parseAssignedTechnicians(schedule.assignedTechnicians).includes(userId);
  });
  const nextUpSchedule = visibleTodaySchedules[0] ?? null;
  const totalHours = payrollSchedules.reduce(
    (acc, schedule) => acc + roundHoursToBucket(schedule.hours || 0),
    0
  );

  const renderScheduleItem = (schedule: any) => {
    if (!getScheduleStartAtUtc(schedule)) return null;

    const technicians = (() => {
      return parseAssignedTechnicians(schedule.assignedTechnicians);
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
        className='border-l-4 border-l-amber-500 p-3 bg-white dark:bg-[#1F1C16] rounded-xl shadow-sm border border-black/10 dark:border-white/10'
        onPress={() => openMaps(schedule.jobTitle, schedule.location)}
      >
        <StatusBar
          barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={colorScheme === 'dark' ? '#030712' : '#F7F5F1'}
        />
        <View className='flex-row justify-between items-start'>
          <View className='flex-1'>
            <Text className='font-semibold text-gray-900 dark:text-gray-200 text-lg'>
              {schedule.jobTitle?.trim() || 'Untitled Job'}
            </Text>
            <Text className='text-gray-600 dark:text-gray-400 mt-1'>
              {formatScheduleTime(schedule)}
            </Text>
            <Text className='text-gray-600 dark:text-gray-400 mt-1'>
              {schedule.location || 'No location specified'}
            </Text>

            {/* Only show technician list for managers */}
            {isManager && technicians?.length > 0 && (
              <View className='mt-2'>
                <Text className='text-gray-500 dark:text-gray-400 text-sm'>Technicians:</Text>
                {technicians.map((techId: string) => (
                  <Text key={techId} className='text-gray-700 dark:text-gray-300 text-sm ml-2'>
                    • {getTechnicianName(techId) || 'Unknown Technician'}
                  </Text>
                ))}
              </View>
            )}
          </View>

          <View className='bg-amber-100 dark:bg-amber-950/70 p-2 rounded-full'>
            <Ionicons name='location' size={20} color='#D97706' />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const handleOpenJob = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setJobDetailVisible(true);
  };

  const renderPayrollSchedule = (schedule: any) => (
    <View key={schedule.id} className='border-b border-gray-100 dark:border-gray-800 py-3'>
      <Text className='text-gray-900 dark:text-gray-200 font-medium'>{schedule.jobTitle}</Text>
      <View className='flex-row justify-between mt-1'>
        <Text className='text-gray-600 dark:text-gray-400'>
          {formatScheduleDateReadable(schedule)}
        </Text>
        <Text className='text-gray-600 dark:text-gray-400'>
          {formatHoursDisplay(schedule.hours)}
        </Text>
      </View>
      <Text className='text-gray-500 dark:text-gray-500 text-sm mt-1'>{schedule.location}</Text>

      {/* Only show technicians for managers */}
      {isManager && schedule.assignedTechnicians && (
        <View className='mt-1'>
          <Text className='text-gray-500 dark:text-gray-400 text-sm'>Technicians:</Text>
          {(typeof schedule.assignedTechnicians === 'string'
            ? JSON.parse(schedule.assignedTechnicians)
            : schedule.assignedTechnicians
          ).map((techId: string) => (
            <Text key={techId} className='text-gray-600 dark:text-gray-500 text-sm ml-2'>
              • {getTechnicianName(techId)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
      <StatusBar
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colorScheme === 'dark' ? '#030712' : '#F7F5F1'}
      />
      <View className='flex-row justify-between items-center p-4 bg-[#F7F5F1] dark:bg-gray-950 border-b border-black/10 dark:border-white/10'>
        <Text className='text-2xl font-bold text-[#14110F] dark:text-white'>Dashboard</Text>
        <View className='flex-row items-center gap-2'>
          <TouchableOpacity
            onPress={() => setShowReviewModal(true)}
            className='p-2 rounded-full bg-amber-100 dark:bg-amber-800/40'
          >
            <Ionicons name='star' size={22} color='#D97706' />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowThemeModal(true)}
            className='p-2 rounded-full bg-white dark:bg-[#16140F] border border-black/10 dark:border-white/15'
          >
            <Ionicons
              name='color-palette'
              size={24}
              color={colorScheme === 'dark' ? '#F2EFEA' : '#4B5563'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className='flex-1'>
        <View className='p-4 flex flex-col gap-4'>
          {nextUpSchedule && (
            <View>
              <Text className='mb-2 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400'>
                Next Up
              </Text>
              <View className='overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-[#16140F]'>
                <View className='flex-row items-center bg-[#14110F] px-4 py-4 dark:bg-amber-400'>
                  <Text className='font-mono text-2xl font-bold text-[#F7F5F1] dark:text-[#14110F]'>
                    {formatScheduleTime(nextUpSchedule)}
                  </Text>
                  <View className='mx-3 h-px flex-1 bg-white/25 dark:bg-black/20' />
                  <Text className='text-xs font-bold uppercase tracking-widest text-[#F7F5F1]/80 dark:text-[#14110F]/70'>
                    {nextUpSchedule.confirmed ? 'Confirmed' : 'Pending'}
                  </Text>
                </View>

                <View className='p-4'>
                  <Text className='text-xl font-bold text-[#14110F] dark:text-white' numberOfLines={2}>
                    {nextUpSchedule.jobTitle?.trim() || 'Untitled Job'}
                  </Text>
                  <View className='mt-2 flex-row items-center gap-2'>
                    <Ionicons name='location-outline' size={16} color='#76706A' />
                    <Text className='flex-1 text-sm font-medium text-gray-600 dark:text-gray-300' numberOfLines={1}>
                      {nextUpSchedule.location || 'No location specified'}
                    </Text>
                  </View>

                  <View className='mt-4 flex-row gap-3'>
                    <TouchableOpacity
                      onPress={() => openMaps(nextUpSchedule.jobTitle, nextUpSchedule.location)}
                      className='flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-4'
                    >
                      <Ionicons name='navigate' size={18} color='#14110F' />
                      <Text className='font-bold text-[#14110F]'>Navigate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleOpenJob(nextUpSchedule as Schedule)}
                      className='flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-4 dark:border-white/15 dark:bg-[#1F1C16]'
                    >
                      <Ionicons
                        name='briefcase-outline'
                        size={18}
                        color={colorScheme === 'dark' ? '#F2EFEA' : '#14110F'}
                      />
                      <Text className='font-bold text-[#14110F] dark:text-white'>Open Job</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Today's Schedule */}
          <View className='bg-white dark:bg-[#16140F] rounded-2xl p-5 shadow-sm border border-black/10 dark:border-white/10'>
            <View className='flex-row justify-between items-center mb-4'>
              <View className='flex-row items-center'>
                <Ionicons name='calendar' size={20} color='#059669' />
                <Text className='text-lg font-bold text-gray-900 dark:text-gray-100 ml-2'>
                  Today's Schedule
                </Text>
              </View>
              <Text className='text-sm text-gray-500 dark:text-gray-400'>
                {visibleTodaySchedules.length} {visibleTodaySchedules.length === 1 ? 'job' : 'jobs'}
              </Text>
            </View>

            {!visibleTodaySchedules?.length ? (
              <View className='items-center py-6'>
                <Ionicons name='calendar-outline' size={48} color='#D1D5DB' />
                <Text className='text-gray-500 dark:text-gray-400 mt-2'>
                  No appointments scheduled for today
                </Text>
              </View>
            ) : visibleTodaySchedules.filter((schedule) => schedule.id !== nextUpSchedule?.id).length === 0 ? (
              <View className='items-center py-5'>
                <Text className='text-gray-500 dark:text-gray-400'>
                  No additional visits after Next Up
                </Text>
              </View>
            ) : (
              <View className='flex flex-col gap-3'>
                {visibleTodaySchedules
                  .filter((schedule) => schedule.id !== nextUpSchedule?.id)
                  .map(renderScheduleItem)
                  .filter(Boolean)}
              </View>
            )}
          </View>

          {/* Hours Summary */}
          <View className='bg-white dark:bg-[#16140F] rounded-2xl p-5 shadow-sm border border-black/10 dark:border-white/10'>
            <View className='flex-row justify-between items-center mb-4'>
              <View className='flex-row items-center'>
                <Ionicons name='time' size={20} color='#059669' />
                <Text className='text-lg font-bold text-gray-900 dark:text-gray-100 ml-2'>
                  Hours Summary
                </Text>
              </View>
            </View>

            {currentPayroll[0] ? (
              <View className='bg-[#F0EDE6] dark:bg-[#1F1C16] rounded-xl p-4'>
                <View className='flex-row justify-between mb-3'>
                  <View>
                    <Text className='text-gray-500 dark:text-gray-400 text-sm'>Period</Text>
                    <Text className='text-gray-900 dark:text-gray-200 font-medium'>
                      {formatDateShort(currentPayroll[0].startDate)} -{' '}
                      {formatDateShort(currentPayroll[0].endDate)}
                    </Text>
                  </View>
                  <View className='items-end'>
                    {isManager ? (
                      <>
                        <Text className='text-gray-500 dark:text-gray-400 text-sm'>Pay Day</Text>
                        <Text className='text-gray-900 dark:text-gray-200 font-medium'>
                          {formatDateShort(currentPayroll[0].payDay)}
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
                  className='flex-row justify-between items-center bg-white dark:bg-[#2A261D] p-3 rounded-xl mt-2 border border-black/10 dark:border-white/10'
                >
                  <Text className='text-gray-800 dark:text-gray-200 font-medium'>
                    View {isManager ? 'All' : 'My'} Schedules ({sortedPayrollSchedules.length})
                  </Text>
                </TouchableOpacity>

                {showSchedules && (
                  <View className='mt-3'>{sortedPayrollSchedules.map(renderPayrollSchedule)}</View>
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

      {/* Theme Selector Modal */}
      <ThemeSelectorModal visible={showThemeModal} onClose={() => setShowThemeModal(false)} />

      <ReviewQRCodeModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        reviewUrl={googleReviewUrl}
      />

      {selectedSchedule && (
        <JobDetailModal
          visible={jobDetailVisible}
          onClose={() => setJobDetailVisible(false)}
          scheduleId={selectedSchedule.id}
          technicianId={userId}
          isManager={isManager}
        />
      )}
    </SafeAreaView>
  );
}
