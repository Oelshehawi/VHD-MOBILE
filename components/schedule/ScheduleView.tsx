import React, { useState, useCallback } from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { useQuery } from '@powersync/react-native';
import { Schedule, AppointmentType } from '@/types';
import { MonthView } from './MonthView';
import { DailyAgenda } from './DailyAgenda';

interface ScheduleViewProps {
  userId: string;
  currentDate: string;
  onDateChange: (date: string) => void;
  isManager: boolean;
}

export function ScheduleView({
  userId,
  currentDate,
  onDateChange,
  isManager,
}: ScheduleViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(currentDate);

  // Get schedules for the selected date - adjust query based on role
  const { data: schedules = [] } = useQuery<Schedule>(
    isManager
      ? `SELECT * FROM schedules WHERE DATE(startDateTime) = DATE(?) ORDER BY startDateTime`
      : `SELECT * FROM schedules WHERE DATE(startDateTime) = DATE(?) AND assignedTechnicians LIKE ? ORDER BY startDateTime`,
    isManager ? [selectedDate] : [selectedDate, `%${userId}%`]
  );

  // Get all schedules for the month view
  const { data: monthSchedules = [] } = useQuery<Schedule>(
    isManager
      ? `SELECT * FROM schedules WHERE datetime(startDateTime) BETWEEN datetime('now', 'start of month', '-67 days') AND datetime('now', 'start of month', '+67 days') ORDER BY startDateTime`
      : `SELECT * FROM schedules WHERE datetime(startDateTime) BETWEEN datetime('now', 'start of month', '-67 days') AND datetime('now', 'start of month', '+67 days') AND assignedTechnicians LIKE ? ORDER BY startDateTime`,
    isManager ? [] : [`%${userId}%`]
  );

  // Convert schedules to appointments format for MonthView
  const appointments: AppointmentType[] = monthSchedules.map((schedule) => ({
    id: schedule.id,
    startTime: schedule.startDateTime,
    clientName: schedule.jobTitle,
    status: schedule.confirmed ? 'confirmed' : 'pending',
  }));

  // Function to handle day press in the MonthView
  const handleDayPress = useCallback(
    (date: string) => {
      setSelectedDate(date);
      onDateChange(date);

      // NOTE: Performance optimization possibility:
      // Instead of triggering a new query when a day is selected,
      // we could filter the already-fetched monthSchedules data
      // for the selected date. This would eliminate the query overhead.
      //
      // Example implementation:
      // const filteredSchedules = monthSchedules.filter(schedule =>
      //   new Date(schedule.startDateTime).toDateString() === new Date(date).toDateString()
      // );
      // And then use this filtered list instead of making a new query
    },
    [onDateChange]
  );

  // Function to handle schedule press in DailyAgenda
  const handleSchedulePress = useCallback((id: string) => {
    // This is now just a placeholder function that can be extended later
    // if additional functionality is needed
    console.log(`Schedule pressed: ${id}`);
  }, []);

  return (
    <SafeAreaView className='flex-1 bg-white dark:bg-gray-900'>
      <StatusBar barStyle='light-content' backgroundColor='#22543D' />

      {/* Month Calendar */}
      <MonthView
        currentDate={currentDate}
        onDateChange={onDateChange}
        appointments={appointments}
        onDayPress={handleDayPress}
      />

      {/* Daily Schedule */}
      <DailyAgenda
        selectedDate={selectedDate}
        schedules={schedules}
        onSchedulePress={handleSchedulePress}
        isManager={isManager}
        userId={userId}
      />
    </SafeAreaView>
  );
}
