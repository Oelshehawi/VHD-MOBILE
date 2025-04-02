import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { format, isSameMonth, isSameDay, isToday, startOfDay } from 'date-fns';
import { AppointmentType } from '@/types';
import { getMonthDays, getAppointmentsForDay } from '@/utils/calendar';
import { MonthHeader } from './MonthHeader';

interface MonthViewProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  appointments: AppointmentType[];
  onDayPress: (date: string) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_WIDTH = Math.floor(SCREEN_WIDTH / 7);
const DAY_HEIGHT = Math.max(DAY_WIDTH, 45);

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
}: MonthViewProps) {
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfDay(new Date(currentDate)).toISOString()
  );
  const currentDateObj = startOfDay(new Date(currentDate || selectedDate));
  const allDays = getMonthDays(currentDateObj);

  useEffect(() => {
    if (currentDate) {
      const newDate = startOfDay(new Date(currentDate));
      setSelectedDate(newDate.toISOString());
    }
  }, [currentDate]);

  const handleDayPress = useCallback(
    (date: Date) => {
      const newDate = startOfDay(date);
      const dateStr = newDate.toISOString();
      setSelectedDate(dateStr);
      onDayPress(dateStr);
    },
    [onDayPress]
  );

  const handleMonthChange = useCallback(
    (newDate: Date) => {
      const dateToUse = startOfDay(newDate);
      onDateChange(dateToUse.toISOString());
    },
    [onDateChange]
  );

  // This would normally be in a stylesheet
  const getDayTextStyle = (
    date: Date,
    isCurrentMonth: boolean,
    isCurrentDay: boolean,
    isSelected: boolean
  ) => {
    let baseStyle = 'text-sm ';

    // Sunday text is red
    if (date.getDay() === 0) {
      baseStyle += 'text-red-500 ';
    }
    // Today's date is blue and bold
    else if (isCurrentDay) {
      baseStyle += 'text-blue-500 font-bold ';
    }
    // Current month dates are dark in light mode, light in dark mode
    // Other month dates are dimmed
    else {
      baseStyle += isCurrentMonth
        ? 'text-gray-800 dark:text-gray-200 '
        : 'text-gray-400 dark:text-gray-600 ';
    }

    // Selected day is bold
    if (isSelected) {
      baseStyle += 'font-bold';
    }

    return baseStyle;
  };

  return (
    <View className='flex-1 bg-white dark:bg-gray-950'>
      <MonthHeader
        currentDate={currentDateObj}
        onMonthChange={handleMonthChange}
      />

      {/* Weekday Headers */}
      <View className='flex-row border-b border-gray-200 dark:border-gray-800'>
        {WEEKDAYS.map((day) => (
          <View
            key={day.key}
            style={{ width: DAY_WIDTH }}
            className='py-2 items-center'
          >
            <Text
              className={`text-sm font-medium ${
                day.key === 'sun'
                  ? 'text-red-500'
                  : 'text-gray-600 dark:text-gray-400'
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
            const isCurrentMonth = isSameMonth(date, currentDateObj);
            const dayAppointments = getAppointmentsForDay(date, appointments);
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
                className={`border-[0.5px] border-gray-200 dark:border-gray-800 p-1 ${
                  isSelected ? 'bg-gray-100 dark:bg-gray-800' : ''
                } ${isCurrentDay ? 'border-blue-500 border-[1.5px]' : ''}`}
                onPress={() => handleDayPress(date)}
              >
                <View className='flex-1'>
                  <Text
                    className={getDayTextStyle(
                      date,
                      isCurrentMonth,
                      isCurrentDay,
                      isSelected
                    )}
                  >
                    {format(date, 'd')}
                  </Text>

                  {/* Appointment Indicators */}
                  {dayAppointments.length > 0 && (
                    <View className='mt-1 flex flex-col gap-0.5'>
                      {dayAppointments.map((apt) => (
                        <View key={apt.id} className='mb-0.5'>
                          <View
                            className={`h-1 rounded-full ${
                              apt.status === 'confirmed'
                                ? 'bg-darkGreen'
                                : 'bg-blue-500'
                            }`}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export default MonthView;
