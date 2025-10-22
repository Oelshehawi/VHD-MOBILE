import React, { useState, useCallback } from 'react';
import { StatusBar, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@powersync/react-native';
import { Schedule, AppointmentType } from '@/types';
import { MonthView } from './MonthView';
import { DailyAgenda } from './DailyAgenda';
import { WeekView } from './WeekView';
import { InvoiceModal } from './InvoiceModal';
import { startOfWeek, endOfWeek, format } from 'date-fns';

interface ScheduleViewProps {
  userId: string;
  currentDate: string;
  onDateChange: (date: string) => void;
  isManager: boolean;
}

type ViewMode = 'month' | 'week' | 'day';

export function ScheduleView({
  userId,
  currentDate,
  onDateChange,
  isManager,
}: ScheduleViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(currentDate);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [selectedScheduleForInvoice, setSelectedScheduleForInvoice] =
    useState<Schedule | null>(null);

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

  // Get schedules for the week view (current week +/- 1 week for smooth navigation)
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(selectedDate), { weekStartsOn: 0 });
  const { data: weekSchedules = [] } = useQuery<Schedule>(
    isManager
      ? `SELECT * FROM schedules WHERE DATE(startDateTime) BETWEEN DATE(?) AND DATE(?) ORDER BY startDateTime`
      : `SELECT * FROM schedules WHERE DATE(startDateTime) BETWEEN DATE(?) AND DATE(?) AND assignedTechnicians LIKE ? ORDER BY startDateTime`,
    isManager
      ? [format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')]
      : [format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd'), `%${userId}%`]
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

  // Helper function to safely extract technician ID
  const getTechnicianId = (technicians: any): string => {
    if (typeof technicians === 'string') {
      try {
        const parsed = JSON.parse(technicians);
        return Array.isArray(parsed) ? parsed[0] : technicians.split(',')[0] || '';
      } catch {
        return technicians.split(',')[0] || '';
      }
    }
    if (Array.isArray(technicians) && technicians.length > 0) {
      return technicians[0];
    }
    return '';
  };

  // Handle schedule press - open invoice modal
  const handleSchedulePress = useCallback((schedule: Schedule) => {
    if (schedule.invoiceRef) {
      setSelectedScheduleForInvoice(schedule);
      setInvoiceModalVisible(true);
    }
  }, []);


  return (
    <SafeAreaView edges={["top"]} className='flex-1 bg-white dark:bg-gray-900'>
      <StatusBar barStyle='light-content' backgroundColor='#22543D' />

      {/* Tab Navigation Bar */}
      <View className='flex-row bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800'>
        <TouchableOpacity
          className={`flex-1 py-4 items-center border-b-2 ${
            viewMode === 'month'
              ? 'border-blue-500'
              : 'border-transparent'
          }`}
          onPress={() => setViewMode('month')}
        >
          <Text
            className={`font-semibold ${
              viewMode === 'month'
                ? 'text-blue-500'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Month
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className={`flex-1 py-4 items-center border-b-2 ${
            viewMode === 'week'
              ? 'border-blue-500'
              : 'border-transparent'
          }`}
          onPress={() => setViewMode('week')}
        >
          <Text
            className={`font-semibold ${
              viewMode === 'week'
                ? 'text-blue-500'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Week
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className={`flex-1 py-4 items-center border-b-2 ${
            viewMode === 'day'
              ? 'border-blue-500'
              : 'border-transparent'
          }`}
          onPress={() => setViewMode('day')}
        >
          <Text
            className={`font-semibold ${
              viewMode === 'day'
                ? 'text-blue-500'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Day
          </Text>
        </TouchableOpacity>
      </View>

      {/* Conditional View Rendering */}
      {viewMode === 'month' && (
        <>
          {/* Month Calendar */}
          <MonthView
            currentDate={currentDate}
            onDateChange={onDateChange}
            appointments={appointments}
            schedules={monthSchedules}
            onDayPress={handleDayPress}
          />

          {/* Daily Schedule */}
          <DailyAgenda
            selectedDate={selectedDate}
            schedules={schedules}
            isManager={isManager}
            userId={userId}
          />
        </>
      )}

      {viewMode === 'week' && (
        <WeekView
          schedules={weekSchedules}
          selectedDate={selectedDate}
          onDateSelect={handleDayPress}
          onSchedulePress={handleSchedulePress}
        />
      )}

      {viewMode === 'day' && (
        <DailyAgenda
          selectedDate={selectedDate}
          schedules={schedules}
          isManager={isManager}
          userId={userId}
        />
      )}

      {/* Invoice Modal */}
      {selectedScheduleForInvoice && (
        <InvoiceModal
          visible={invoiceModalVisible}
          onClose={() => setInvoiceModalVisible(false)}
          scheduleId={selectedScheduleForInvoice.id}
          technicianId={getTechnicianId(selectedScheduleForInvoice.assignedTechnicians)}
          isManager={isManager}
        />
      )}
    </SafeAreaView>
  );
}
