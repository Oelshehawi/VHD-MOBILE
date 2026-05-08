import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions } from 'react-native';
import { format, isSameMonth, isSameDay, isToday, startOfDay } from 'date-fns';
import { AppointmentType } from '@/types';
import { getMonthDays } from '@/utils/calendar';
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
  { key: 'sat', label: 'S' }
];

interface MonthDayCellProps {
  date: Date;
  dayKey: string;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  appointments: AppointmentType[];
  dayTextStyle: string;
  onPress: (date: Date) => void;
}

const MonthDayCell = React.memo(
  ({
    date,
    dayKey: _dayKey,
    isCurrentMonth: _isCurrentMonth,
    isSelected,
    isToday,
    appointments,
    dayTextStyle,
    onPress
  }: MonthDayCellProps) => {
    const handlePress = useCallback(() => {
      onPress(date);
    }, [onPress, date]);

    return (
      <Pressable
        style={{
          width: DAY_WIDTH,
          height: DAY_HEIGHT
        }}
        className={`border-[0.5px] border-black/10 p-1 active:bg-gray-50 dark:border-white/10 dark:active:bg-[#1F1C16] ${
          isSelected ? 'bg-[#14110F] dark:bg-amber-400' : 'bg-[#F7F5F1] dark:bg-gray-950'
        } ${isToday && !isSelected ? 'border-[#14110F] dark:border-amber-400 border-[1.5px]' : ''}`}
        onPress={handlePress}
      >
        <View className='flex-1'>
          <Text className={dayTextStyle}>{format(date, 'd')}</Text>

          {appointments.length > 0 && (
            <View className='mt-1 flex flex-col gap-0.5'>
              {appointments.map((apt) => (
                <View key={apt.id} className='mb-0.5'>
                  <View
                    className={`h-1 rounded-full ${
                      isSelected
                        ? 'bg-amber-200 dark:bg-[#14110F]'
                        : apt.status === 'confirmed'
                          ? 'bg-darkGreen'
                          : 'bg-blue-500'
                    }`}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </Pressable>
    );
  }
);

export function MonthView({ currentDate, onDateChange, appointments, onDayPress }: MonthViewProps) {
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfDay(new Date(currentDate)).toISOString()
  );
  const currentDateObj = useMemo(
    () => startOfDay(new Date(currentDate || selectedDate)),
    [currentDate, selectedDate]
  );
  const selectedDateObj = useMemo(() => startOfDay(new Date(selectedDate)), [selectedDate]);
  const allDays = useMemo(() => getMonthDays(currentDateObj), [currentDateObj]);

  useEffect(() => {
    if (currentDate) {
      const newDate = startOfDay(new Date(currentDate));
      setSelectedDate(newDate.toISOString());
    }
  }, [currentDate]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, AppointmentType[]>();
    const uniqueAppointments = new Map<string, AppointmentType>();

    // Deduplicate appointments by ID
    appointments.forEach((apt) => {
      if (apt.id && !uniqueAppointments.has(apt.id)) {
        uniqueAppointments.set(apt.id, apt);
      }
    });

    uniqueAppointments.forEach((appointment) => {
      try {
        // Use string slicing to get the date, matching ScheduleView logic
        // This prevents timezone conversion issues where the bar shows up on the wrong day
        const dateKey =
          typeof appointment.startTime === 'string'
            ? appointment.startTime.slice(0, 10)
            : format(new Date(appointment.startTime), 'yyyy-MM-dd');
        if (!map.has(dateKey)) {
          map.set(dateKey, []);
        }
        map.get(dateKey)!.push(appointment);
      } catch (error) {
        console.error('Error grouping appointment', appointment.startTime, error);
      }
    });
    return map;
  }, [appointments]);

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
    let baseStyle = 'text-sm font-mono ';

    if (isSelected) {
      return `${baseStyle}font-bold text-[#F7F5F1] dark:text-[#14110F]`;
    }

    // Sunday text is red
    if (date.getDay() === 0) {
      baseStyle += 'text-red-500 dark:text-red-300 ';
    }
    // Today's date is blue and bold
    else if (isCurrentDay) {
      baseStyle += 'text-[#14110F] dark:text-amber-400 font-bold ';
    }
    // Current month dates are dark in light mode, light in dark mode
    // Other month dates are dimmed
    else {
      baseStyle += isCurrentMonth
        ? 'text-[#14110F] dark:text-white '
        : 'text-gray-400 dark:text-gray-600 ';
    }

    // Selected day is bold
    if (isSelected) {
      baseStyle += 'font-bold';
    }

    return baseStyle;
  };

  return (
    <View className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
      <MonthHeader currentDate={currentDateObj} onMonthChange={handleMonthChange} />

      {/* Weekday Headers */}
      <View className='flex-row border-y border-black/10 bg-[#F0EDE6] dark:border-white/10 dark:bg-[#16140F]'>
        {WEEKDAYS.map((day) => (
          <View key={day.key} style={{ width: DAY_WIDTH }} className='py-2 items-center'>
            <Text
              className={`text-xs font-bold uppercase ${
                day.key === 'sun' ? 'text-red-500 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'
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
            const isSelected = isSameDay(date, selectedDateObj);
            const isCurrentDay = isToday(date);
            const dayKey = format(date, 'yyyy-MM-dd');
            const appointmentsForDay = appointmentsByDate.get(dayKey) || [];
            const dayTextStyle = getDayTextStyle(date, isCurrentMonth, isCurrentDay, isSelected);

            return (
              <MonthDayCell
                key={`${dayKey}-${index}`}
                date={date}
                dayKey={dayKey}
                isCurrentMonth={isCurrentMonth}
                isSelected={isSelected}
                isToday={isCurrentDay}
                appointments={appointmentsForDay}
                dayTextStyle={dayTextStyle}
                onPress={handleDayPress}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export default MonthView;
