import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
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
import { formatTimeUTC, toUTCDate } from '../../utils/date';

interface MonthViewProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  appointments: Array<{
    id: string;
    startTime: Date;
    endTime: Date;
    clientName: string;
    serviceType: string;
    status: 'scheduled' | 'completed' | 'cancelled';
  }>;
  onDayPress: (date: Date) => void;
  onAppointmentPress: (id: string) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_WIDTH = SCREEN_WIDTH / 7;
const MAX_EVENT_BARS = 4;

const WEEKDAYS = [
  { key: 'sun', label: 'S' },
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
];

export function MonthView({
  currentDate,
  onDateChange,
  appointments,
  onDayPress,
  onAppointmentPress,
}: MonthViewProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

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
      if (!date || !appointments?.length) return [];

      return appointments.filter((apt) => {
        if (!apt.startTime) return false;
        // Only compare the date part YYYY-MM-DD
        const appointmentDate = apt.startTime.toISOString().split('T')[0];
        const compareDate = date.toISOString().split('T')[0];
        return appointmentDate === compareDate;
      });
    },
    [appointments]
  );

  const handleDayPress = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      onDayPress(date);
    },
    [onDayPress]
  );

  const renderEventBars = useCallback((date: Date, dayAppointments: any[]) => {
    return dayAppointments
      .slice(0, MAX_EVENT_BARS)
      .map((apt) => (
        <View
          key={apt.id}
          className={`h-1 mb-0.5 rounded-full ${
            apt.status === 'cancelled'
              ? 'bg-red-500'
              : apt.status === 'completed'
              ? 'bg-darkGreen'
              : 'bg-blue-500'
          }`}
        />
      ));
  }, []);

  return (
    <View className='flex-1 bg-gray-950'>
      {/* Month Header */}
      <View className='flex-row justify-between items-center p-4'>
        <TouchableOpacity
          onPress={() => onDateChange(subMonths(currentDate, 1))}
          className='p-2'
        >
          <Text className='text-gray-200 text-lg'>←</Text>
        </TouchableOpacity>
        <Text className='text-xl font-bold text-gray-200'>
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity
          onPress={() => onDateChange(addMonths(currentDate, 1))}
          className='p-2'
        >
          <Text className='text-gray-200 text-lg'>→</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday Headers */}
      <View className='flex-row'>
        {WEEKDAYS.map((day, index) => (
          <View
            key={day.key}
            style={{ width: DAY_WIDTH }}
            className='py-2 items-center'
          >
            <Text
              className={`text-sm ${
                index === 0 ? 'text-red-500' : 'text-gray-400'
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
            const dayAppointments = getAppointmentsForDay(date as Date);
            const isSelected = isSameDay(date, selectedDate);
            const isCurrentDay = isToday(date);

            return (
              <TouchableOpacity
                key={index}
                style={{ width: DAY_WIDTH, height: DAY_WIDTH * 1.2 }}
                className={`border-[0.5px] border-gray-800 p-1 ${
                  isSelected ? 'bg-gray-900' : ''
                }`}
                onPress={() => handleDayPress(date as Date)}
              >
                <View className='flex-1'>
                  <Text
                    className={`text-base ${
                      index % 7 === 0
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
                    {renderEventBars(date as Date, dayAppointments)}
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
            {getAppointmentsForDay(selectedDate).map((apt) => (
              <TouchableOpacity
                key={apt.id}
                className='bg-gray-800 rounded-lg p-4'
                onPress={() => onAppointmentPress(apt.id)}
              >
                <View className='flex-row justify-between items-center'>
                  <Text className='text-gray-200 font-medium'>
                    {formatTimeUTC(apt.startTime)}
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
                <Text className='text-gray-200 text-lg'>{apt.clientName}</Text>
                <Text className='text-gray-400'>{apt.serviceType}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
