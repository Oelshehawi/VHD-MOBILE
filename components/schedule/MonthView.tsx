import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import { formatTimeUTC } from '../../utils/date';

interface MonthViewProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  appointments: Array<{
    id: string;
    startTime: string;
    endTime: string;
    clientName: string;
    serviceType: string;
    status: 'scheduled' | 'completed' | 'cancelled';
  }>;
  onDayPress: (date: string) => void;
  onAppointmentPress: (id: string) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_WIDTH = Math.floor(SCREEN_WIDTH / 7);
const DAY_HEIGHT = Math.max(DAY_WIDTH, 45); // Set a reasonable minimum height

const WEEKDAYS = [
  { key: 'sun', label: 'S' },
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
];

// Helper function to get current date in PT
const getCurrentDateInPT = () => {
  const now = new Date();
  // Subtract 8 hours to convert from UTC to PST
  return new Date(now.getTime() - 8 * 60 * 60 * 1000);
};

// Helper to convert UTC ISO string to local date
const convertUTCToLocal = (dateStr: string) => {
  const date = new Date(dateStr);
  return new Date(date.getTime() + date.getTimezoneOffset() * 60 * 1000);
};

export function MonthView({
  currentDate,
  onDateChange,
  appointments,
  onDayPress,
  onAppointmentPress,
}: MonthViewProps) {
  // Initialize with current date if none provided
  const [selectedDate, setSelectedDate] = useState(currentDate);

  // Convert currentDate to Date object for calculations
  const currentDateObj = convertUTCToLocal(currentDate || selectedDate);
  const monthStart = startOfMonth(currentDateObj);
  const monthEnd = endOfMonth(currentDateObj);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Update selectedDate when currentDate changes
  useEffect(() => {
    if (currentDate) {
      const localDate = convertUTCToLocal(currentDate);
      setSelectedDate(localDate.toISOString());
    }
  }, [currentDate]);

  // Add padding days to start of month to align with weekday
  const startPadding = Array.from({ length: monthStart.getDay() }, (_, i) => {
    const date = new Date(monthStart);
    date.setMonth(date.getMonth() - 1);
    date.setDate(endOfMonth(subMonths(monthStart, 1)).getDate() - i);
    return date;
  }).reverse();

  // Add padding days to end of month to complete the grid
  const endPadding = Array.from({ length: 6 - monthEnd.getDay() }, (_, i) => {
    const date = new Date(monthStart);
    date.setMonth(date.getMonth() + 1);
    date.setDate(i + 1);
    return date;
  });

  const allDays = [...startPadding, ...days, ...endPadding];

  const getAppointmentsForDay = useCallback(
    (date: Date) => {
      // Keep UTC comparison for appointments
      const dateString = date.toISOString().split('T')[0];

      if (!date || !appointments?.length) return [];

      const dayAppointments = appointments.filter((apt) => {
        if (!apt.startTime) return false;
        const appointmentDate = new Date(apt.startTime)
          .toISOString()
          .split('T')[0];
        return appointmentDate === dateString;
      });

      return dayAppointments.sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    },
    [appointments]
  );

  const handleDayPress = useCallback(
    (date: Date) => {
      // Keep the date in local time
      const localDate = new Date(date);
      const dateStr = localDate.toISOString();
      setSelectedDate(dateStr);
      onDayPress(dateStr);
    },
    [onDayPress]
  );

  const handleMonthChange = useCallback(
    (newDate: Date) => {
      // Convert to local midnight
      const localDate = new Date(newDate);
      localDate.setHours(0, 0, 0, 0);
      onDateChange(localDate.toISOString());
    },
    [onDateChange]
  );

  return (
    <View className='flex-1 bg-gray-950'>
      {/* Month Header */}
      <View className='flex-row justify-between items-center px-2 py-3'>
        <TouchableOpacity
          onPress={() => handleMonthChange(subMonths(currentDate, 1))}
          className='h-10 w-10 bg-gray-800 rounded-full items-center justify-center'
        >
          <Text className='text-gray-200 text-xl leading-none'>←</Text>
        </TouchableOpacity>
        <Text className='text-xl font-bold text-gray-200'>
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity
          onPress={() => handleMonthChange(addMonths(currentDate, 1))}
          className='h-10 w-10 bg-gray-800 rounded-full items-center justify-center'
        >
          <Text className='text-gray-200 text-xl leading-none'>→</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday Headers */}
      <View className='flex-row border-b border-gray-800'>
        {WEEKDAYS.map((day) => (
          <View
            key={day.key}
            style={{ width: DAY_WIDTH }}
            className='py-2 items-center'
          >
            <Text
              className={`text-sm font-medium ${
                day.key === 'sun' ? 'text-red-500' : 'text-gray-400'
              }`}
            >
              {day.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <ScrollView className='flex-1'>
        <View className='flex-row flex-wrap'>
          {allDays.map((date, index) => {
            const isCurrentMonth = isSameMonth(date, currentDate);
            const dayAppointments = getAppointmentsForDay(date);
            const isSelected = isSameDay(date, new Date(selectedDate));
            const isCurrentDay = isToday(date);
            const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${index}`;

            return (
              <TouchableOpacity
                key={dateKey}
                style={{
                  width: DAY_WIDTH,
                  height: DAY_HEIGHT,
                }}
                className={`border-[0.5px] border-gray-800 p-1 ${
                  isSelected ? 'bg-gray-800' : ''
                } ${isCurrentDay ? 'border-blue-500 border-[1.5px]' : ''}`}
                onPress={() => handleDayPress(date)}
              >
                <View className='flex-1'>
                  <Text
                    className={`text-sm ${
                      date.getDay() === 0
                        ? 'text-red-500'
                        : isCurrentDay
                        ? 'text-blue-500 font-bold'
                        : isCurrentMonth
                        ? 'text-gray-200'
                        : 'text-gray-600'
                    } ${isSelected ? 'font-bold' : ''}`}
                  >
                    {format(date, 'd')}
                  </Text>
                  <View className='mt-1 flex flex-col gap-0.5'>
                    {dayAppointments.map((apt) => (
                      <View key={apt.id} className='mb-0.5'>
                        <View
                          className={`h-1 rounded-full ${
                            apt.status === 'cancelled'
                              ? 'bg-red-500'
                              : apt.status === 'completed'
                              ? 'bg-darkGreen'
                              : 'bg-blue-500'
                          }`}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Daily Agenda */}
      <View className='bg-gray-900 p-4 min-h-[200]'>
        <Text className='text-gray-200 text-lg mb-4'>
          {format(selectedDate, 'MMMM d, yyyy')}
        </Text>
        <ScrollView>
          <View className='flex flex-col gap-2'>
            {getAppointmentsForDay(new Date(selectedDate)).map((apt) => (
              <TouchableOpacity
                key={apt.id}
                className='bg-gray-800 rounded-lg p-4'
                onPress={() => onAppointmentPress(apt.id)}
              >
                <View className='flex-row justify-between items-center'>
                  <Text className='text-gray-200 font-medium'>
                    {formatTimeUTC(new Date(apt.startTime))}
                  </Text>
                  <View
                    className={`w-2 h-2 rounded-full ${
                      apt.status === 'cancelled'
                        ? 'bg-red-500'
                        : apt.status === 'completed'
                        ? 'bg-darkGreen'
                        : 'bg-blue-500'
                    }`}
                  />
                </View>
                <Text className='text-gray-200 text-lg'>
                  {apt.clientName.trim()}
                </Text>
                <Text className='text-gray-400'>{apt.serviceType}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export default MonthView;
