import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { StatusBar, View, Text, TouchableOpacity, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';
import { Schedule, AppointmentType } from '@/types';
import { MonthView } from './MonthView';
import { ScheduleAgendaList, ScheduleWeekAgenda } from './ScheduleWeekAgenda';
import { JobDetailModal } from './JobDetailModal';
import { format, startOfDay } from 'date-fns';
import {
  getLocalDateKey,
  getScheduleDateKey,
  scheduleMatchesDateKey
} from '@/utils/scheduleTime';
import { ASSIGNED_TO_USER_CLAUSE } from '@/services/data/sqlFragments';

interface ScheduleViewProps {
  userId: string;
  currentDate: string;
  onDateChange: (date: string) => void;
  isManager: boolean;
}

type ViewMode = 'week' | 'month';

export function ScheduleView({ userId, currentDate, onDateChange, isManager }: ScheduleViewProps) {
  const colorScheme = useColorScheme();
  const [selectedDate, setSelectedDate] = useState<string>(
    startOfDay(new Date(currentDate)).toISOString()
  );
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [jobDetailVisible, setJobDetailVisible] = useState(false);
  const [selectedScheduleForDetail, setSelectedScheduleForDetail] = useState<Schedule | null>(
    null
  );

  useEffect(() => {
    const normalized = startOfDay(new Date(currentDate)).toISOString();
    setSelectedDate(normalized);
  }, [currentDate]);

  const selectedDateParam = useMemo(() => getLocalDateKey(selectedDate), [selectedDate]);

  // Get all schedules for the month view
  const monthQuery = useQuery<Schedule>(
    isManager
      ? `SELECT * FROM schedules
         WHERE datetime(scheduledStartAtUtc)
         BETWEEN datetime(?, 'start of month', '-67 days')
           AND datetime(?, 'start of month', '+67 days')
         ORDER BY scheduledStartAtUtc`
      : `SELECT * FROM schedules
         WHERE datetime(scheduledStartAtUtc)
         BETWEEN datetime(?, 'start of month', '-67 days')
           AND datetime(?, 'start of month', '+67 days')
           AND (${ASSIGNED_TO_USER_CLAUSE})
         ORDER BY scheduledStartAtUtc`,
    isManager
      ? [selectedDateParam, selectedDateParam]
      : [selectedDateParam, selectedDateParam, userId ?? ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const monthSchedules = useMemo<ReadonlyArray<Schedule>>(
    () => monthQuery.data ?? [],
    [monthQuery.data]
  );

  // Convert schedules to appointments format for MonthView
  const appointments: AppointmentType[] = useMemo(
    () =>
      monthSchedules.map((schedule) => ({
        id: schedule.id,
        startTime: getScheduleDateKey(schedule),
        clientName: schedule.jobTitle,
        status: schedule.confirmed ? 'confirmed' : 'pending'
      })),
    [monthSchedules]
  );

  const schedulesForSelectedDate = useMemo(() => {
    if (!selectedDateParam) return [];
    return monthSchedules.filter((schedule) => scheduleMatchesDateKey(schedule, selectedDateParam));
  }, [monthSchedules, selectedDateParam]);

  // Function to handle day press in the MonthView
  const handleDateSelection = useCallback(
    (date: string) => {
      const normalized = startOfDay(new Date(date)).toISOString();
      setSelectedDate(normalized);
      onDateChange(normalized);
    },
    [onDateChange]
  );

  const handleDayPress = useCallback(
    (date: string) => {
      handleDateSelection(date);
    },
    [handleDateSelection]
  );

  const handleSchedulePress = useCallback((schedule: Schedule) => {
    setSelectedScheduleForDetail(schedule);
    setJobDetailVisible(true);
  }, []);

  return (
    <SafeAreaView edges={['top']} className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
      <StatusBar
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colorScheme === 'dark' ? '#030712' : '#F7F5F1'}
      />

      {/* Tab Navigation Bar */}
      <View className='border-b border-black/10 bg-[#F7F5F1] px-4 pb-3 pt-2 dark:border-white/10 dark:bg-gray-950'>
        <View className='mb-3 flex-row items-center justify-between'>
          <Text className='text-2xl font-bold text-[#14110F] dark:text-white'>Schedule</Text>
          <TouchableOpacity
            onPress={() => handleDateSelection(new Date().toISOString())}
            className='h-10 items-center justify-center rounded-xl border border-black/15 bg-white px-3 dark:border-white/20 dark:bg-[#16140F]'
          >
            <Text className='font-mono text-sm font-bold text-[#14110F] dark:text-white'>
              Today
            </Text>
          </TouchableOpacity>
        </View>

        <View className='flex-row rounded-xl bg-[#F0EDE6] p-1 dark:bg-[#16140F]'>
          <TouchableOpacity
            className={`flex-1 rounded-lg py-3 items-center ${
              viewMode === 'week' ? 'bg-white dark:bg-[#2A261D]' : ''
            }`}
            onPress={() => setViewMode('week')}
          >
            <Text
              className={`font-semibold ${
                viewMode === 'week' ? 'text-[#14110F] dark:text-white' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Week
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`flex-1 rounded-lg py-3 items-center ${
              viewMode === 'month' ? 'bg-white dark:bg-[#2A261D]' : ''
            }`}
            onPress={() => setViewMode('month')}
          >
            <Text
              className={`font-semibold ${
                viewMode === 'month' ? 'text-[#14110F] dark:text-white' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Month
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Conditional View Rendering */}
      {viewMode === 'week' && (
        <ScheduleWeekAgenda
          schedules={monthSchedules}
          selectedDate={selectedDate}
          onDateChange={handleDateSelection}
          onSchedulePress={handleSchedulePress}
        />
      )}

      {viewMode === 'month' && (
        <View className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
          <MonthView
            currentDate={selectedDate}
            onDateChange={handleDateSelection}
            appointments={appointments}
            onDayPress={handleDayPress}
          />
          <View className='flex-1 border-t border-black/10 pt-3 dark:border-white/10'>
            <View className='px-4 pb-1'>
              <Text className='text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400'>
                {format(startOfDay(new Date(selectedDate)), 'EEE, MMM d')}
              </Text>
            </View>
            <ScheduleAgendaList
              schedules={schedulesForSelectedDate}
              onSchedulePress={handleSchedulePress}
            />
          </View>
        </View>
      )}

      {selectedScheduleForDetail && (
        <JobDetailModal
          visible={jobDetailVisible}
          onClose={() => setJobDetailVisible(false)}
          scheduleId={selectedScheduleForDetail.id}
          technicianId={userId}
          isManager={isManager}
        />
      )}
    </SafeAreaView>
  );
}
