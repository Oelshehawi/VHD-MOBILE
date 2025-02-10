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
import {
  convertUTCToLocal,
  getMonthDays,
  getAppointmentsForDay,
} from '@/utils/calendar';
import { MonthHeader } from './MonthHeader';
import { DailyAgenda } from './DailyAgenda';

interface MonthViewProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  appointments: AppointmentType[];
  onDayPress: (date: string) => void;
  onAppointmentPress: (id: string) => void;
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
  onAppointmentPress,
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

  return (
    <View className='flex-1 bg-gray-950'>
      <MonthHeader
        currentDate={currentDateObj}
        onMonthChange={handleMonthChange}
      />

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

      <DailyAgenda
        selectedDate={new Date(selectedDate)}
        appointments={appointments}
        onAppointmentPress={onAppointmentPress}
      />
    </View>
  );
}

export default MonthView;
