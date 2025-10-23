import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { StatusBar, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';
import { Schedule, AppointmentType } from '@/types';
import { MonthView } from './MonthView';
import { DailyAgenda } from './DailyAgenda';
import { WeekView } from './WeekView';
import { InvoiceModal } from './InvoiceModal';
import { startOfWeek, endOfWeek, format, startOfDay } from 'date-fns';

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
  const [selectedDate, setSelectedDate] = useState<string>(
    startOfDay(new Date(currentDate)).toISOString()
  );
  const [viewMode, setViewMode] = useState<ViewMode>('day'); // Changed from 'month' to 'day'
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [selectedScheduleForInvoice, setSelectedScheduleForInvoice] =
    useState<Schedule | null>(null);

  useEffect(() => {
    const normalized = startOfDay(new Date(currentDate)).toISOString();
    setSelectedDate(normalized);
  }, [currentDate]);

  const selectedDateParam = useMemo(
    () => selectedDate.slice(0, 10),
    [selectedDate]
  );

  // Get all schedules for the month view
  const monthQuery = useQuery<Schedule>(
    isManager
      ? `SELECT * FROM schedules 
         WHERE datetime(startDateTime) 
         BETWEEN datetime(?, 'start of month', '-67 days') 
           AND datetime(?, 'start of month', '+67 days') 
         ORDER BY startDateTime`
      : `SELECT * FROM schedules 
         WHERE datetime(startDateTime) 
         BETWEEN datetime(?, 'start of month', '-67 days') 
           AND datetime(?, 'start of month', '+67 days') 
           AND assignedTechnicians LIKE ? 
         ORDER BY startDateTime`,
    isManager
      ? [selectedDateParam, selectedDateParam]
      : [selectedDateParam, selectedDateParam, `%${userId}%`],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const monthSchedules: ReadonlyArray<Schedule> = monthQuery.data ?? [];

  // Get schedules for the week view (current week +/- 1 week for smooth navigation)
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(selectedDate), { weekStartsOn: 0 });
  const weekQuery = useQuery<Schedule>(
    isManager
      ? `SELECT * FROM schedules WHERE DATE(startDateTime) BETWEEN DATE(?) AND DATE(?) ORDER BY startDateTime`
      : `SELECT * FROM schedules WHERE DATE(startDateTime) BETWEEN DATE(?) AND DATE(?) AND assignedTechnicians LIKE ? ORDER BY startDateTime`,
    isManager
      ? [format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')]
      : [
          format(weekStart, 'yyyy-MM-dd'),
          format(weekEnd, 'yyyy-MM-dd'),
          `%${userId}%`,
        ],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const weekSchedules: ReadonlyArray<Schedule> = weekQuery.data ?? [];

  // Convert schedules to appointments format for MonthView
  const appointments: AppointmentType[] = useMemo(
    () =>
      monthSchedules.map((schedule) => ({
        id: schedule.id,
        startTime: schedule.startDateTime,
        clientName: schedule.jobTitle,
        status: schedule.confirmed ? 'confirmed' : 'pending',
      })),
    [monthSchedules]
  );

  const schedulesForSelectedDate = useMemo(() => {
    if (!selectedDateParam) {
      return [];
    }

    return monthSchedules.filter((schedule) => {
      if (typeof schedule.startDateTime === 'string') {
        return schedule.startDateTime.slice(0, 10) === selectedDateParam;
      }

      try {
        return (
          format(new Date(schedule.startDateTime), 'yyyy-MM-dd') ===
          selectedDateParam
        );
      } catch {
        return false;
      }
    });
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

  // Helper function to safely extract technician ID
  const getTechnicianId = (technicians: any): string => {
    if (typeof technicians === 'string') {
      try {
        const parsed = JSON.parse(technicians);
        return Array.isArray(parsed)
          ? parsed[0]
          : technicians.split(',')[0] || '';
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
    <SafeAreaView edges={['top']} className='flex-1 bg-white dark:bg-gray-900'>
      <StatusBar barStyle='light-content' backgroundColor='#22543D' />

      {/* Tab Navigation Bar */}
      <View className='flex-row bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800'>
        <TouchableOpacity
          className={`flex-1 py-4 items-center border-b-2 ${
            viewMode === 'day' ? 'border-blue-500' : 'border-transparent'
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

        <TouchableOpacity
          className={`flex-1 py-4 items-center border-b-2 ${
            viewMode === 'week' ? 'border-blue-500' : 'border-transparent'
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
            viewMode === 'month' ? 'border-blue-500' : 'border-transparent'
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
      </View>

      {/* Conditional View Rendering */}
      {viewMode === 'month' && (
        <>
          {/* Month Calendar */}
          <MonthView
            currentDate={currentDate}
            onDateChange={handleDateSelection}
            appointments={appointments}
            schedules={monthSchedules}
            onDayPress={handleDayPress}
          />

          {/* Daily Schedule - now without severe weather alert */}
          <DailyAgenda
            selectedDate={selectedDate}
            schedules={schedulesForSelectedDate}
            isManager={isManager}
            userId={userId}
            showSevereWeatherAlert={false} // Hide weather alert in month view
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
          schedules={schedulesForSelectedDate}
          isManager={isManager}
          userId={userId}
          onDateChange={handleDateSelection} // Enable navigation in day view
          showSevereWeatherAlert={true} // Show weather alert in day view
        />
      )}

      {/* Invoice Modal */}
      {selectedScheduleForInvoice && (
        <InvoiceModal
          visible={invoiceModalVisible}
          onClose={() => setInvoiceModalVisible(false)}
          scheduleId={selectedScheduleForInvoice.id}
          technicianId={getTechnicianId(
            selectedScheduleForInvoice.assignedTechnicians
          )}
          isManager={isManager}
        />
      )}
    </SafeAreaView>
  );
}
