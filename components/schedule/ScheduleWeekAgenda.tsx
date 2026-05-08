import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { addDays, addWeeks, format, isSameDay, isToday, parseISO, startOfDay, startOfWeek } from 'date-fns';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import type { Schedule } from '@/types';
import {
  formatScheduleTime,
  getLocalDateKey,
  getScheduleDateKey,
  getScheduleSortTime,
  scheduleMatchesDateKey
} from '@/utils/scheduleTime';

interface ScheduleWeekAgendaProps {
  selectedDate: string;
  schedules: ReadonlyArray<Schedule>;
  onDateChange: (date: string) => void;
  onSchedulePress: (schedule: Schedule) => void;
}

const SWIPE_THRESHOLD = 50;

function statusLabel(schedule: Schedule): { label: string; bgClassName: string; textClassName: string } {
  if (schedule.deadRun) {
    return { label: 'blocked', bgClassName: 'bg-red-100 dark:bg-red-950/70', textClassName: 'text-red-700 dark:text-red-200' };
  }
  if (schedule.confirmed) {
    return { label: 'confirmed', bgClassName: 'bg-emerald-100 dark:bg-emerald-950/70', textClassName: 'text-emerald-800 dark:text-emerald-200' };
  }
  return { label: 'pending', bgClassName: 'bg-amber-100 dark:bg-amber-950/70', textClassName: 'text-amber-900 dark:text-amber-200' };
}

function JobProgressDots({ hasNotes }: { hasNotes: boolean }) {
  return (
    <View className='flex-row items-center gap-1'>
      {[0, 1, 2, 3].map((step) => (
        <React.Fragment key={step}>
          <View className={`h-2 w-2 rounded-full ${step === 0 ? 'bg-[#14110F] dark:bg-white' : 'bg-black/20 dark:bg-white/25'}`} />
          {step < 3 && <View className='h-px w-3 bg-black/10 dark:bg-white/15' />}
        </React.Fragment>
      ))}
      {hasNotes && (
        <View className='ml-2 rounded-full bg-red-100 px-2 py-1'>
          <Text className='text-xs font-semibold text-red-700'>notes</Text>
        </View>
      )}
    </View>
  );
}

function ScheduleRow({
  schedule,
  onPress
}: {
  schedule: Schedule;
  onPress: (schedule: Schedule) => void;
}) {
  const colorScheme = useColorScheme();
  const chevronColor = colorScheme === 'dark' ? '#C9C3BA' : '#76706A';
  const status = statusLabel(schedule);
  const hasNotes =
    typeof schedule.technicianNotes === 'string' && schedule.technicianNotes.trim().length > 0;

  return (
    <Pressable
      onPress={() => onPress(schedule)}
      className='rounded-2xl border border-black/10 bg-white p-4 active:bg-gray-50 dark:border-white/10 dark:bg-[#16140F] dark:active:bg-[#1F1C16]'
    >
      <View className='flex-row gap-3'>
        <View className='min-w-[54px] items-center'>
          <Text className='font-mono text-base font-bold text-[#14110F] dark:text-white'>
            {formatScheduleTime(schedule)}
          </Text>
        </View>
        <View className='w-px bg-black/10 dark:bg-white/10' />
        <View className='flex-1'>
          <View className='flex-row items-start gap-2'>
            <Text className='flex-1 text-base font-bold text-[#14110F] dark:text-white' numberOfLines={1}>
              {schedule.jobTitle}
            </Text>
            <View className={`rounded-full px-2 py-1 ${status.bgClassName}`}>
              <Text className={`text-xs font-semibold ${status.textClassName}`}>{status.label}</Text>
            </View>
          </View>
          <Text className='mt-1 text-xs font-medium text-gray-500' numberOfLines={1}>
            {schedule.location}
          </Text>
          <View className='mt-3 flex-row items-center justify-between gap-3'>
            <JobProgressDots hasNotes={hasNotes} />
            <Ionicons name='chevron-forward' size={18} color={chevronColor} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function ScheduleAgendaList({
  schedules,
  onSchedulePress,
  emptyMessage = 'No visits scheduled for this day'
}: {
  schedules: ReadonlyArray<Schedule>;
  onSchedulePress: (schedule: Schedule) => void;
  emptyMessage?: string;
}) {
  const colorScheme = useColorScheme();
  const mutedIconColor = colorScheme === 'dark' ? '#C9C3BA' : '#76706A';
  const sortedSchedules = useMemo(
    () => [...schedules].sort((a, b) => getScheduleSortTime(a) - getScheduleSortTime(b)),
    [schedules]
  );

  return (
    <ScrollView className='flex-1 px-4' contentContainerStyle={{ paddingBottom: 28 }}>
      {sortedSchedules.length === 0 ? (
        <View className='mt-6 items-center rounded-2xl border border-dashed border-black/15 bg-white p-8 dark:border-white/15 dark:bg-[#16140F]'>
          <Ionicons name='calendar-clear-outline' size={34} color={mutedIconColor} />
          <Text className='mt-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400'>
            {emptyMessage}
          </Text>
        </View>
      ) : (
        <View className='gap-3 pt-2'>
          {sortedSchedules.map((schedule) => (
            <ScheduleRow key={schedule.id} schedule={schedule} onPress={onSchedulePress} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

export function ScheduleWeekAgenda({
  selectedDate,
  schedules,
  onDateChange,
  onSchedulePress
}: ScheduleWeekAgendaProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#F2EFEA' : '#14110F';
  const selected = useMemo(() => startOfDay(parseISO(selectedDate)), [selectedDate]);
  const weekStart = useMemo(() => startOfWeek(selected, { weekStartsOn: 1 }), [selected]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );
  const selectedDateKey = useMemo(() => getLocalDateKey(selected), [selected]);

  const schedulesByDate = useMemo(() => {
    const counts = new Map<string, number>();
    schedules.forEach((schedule) => {
      const key = getScheduleDateKey(schedule);
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [schedules]);

  const selectedSchedules = useMemo(
    () =>
      schedules.filter((schedule) => scheduleMatchesDateKey(schedule, selectedDateKey)),
    [schedules, selectedDateKey]
  );

  const goToPreviousDay = useCallback(() => {
    onDateChange(addDays(selected, -1).toISOString());
  }, [onDateChange, selected]);

  const goToNextDay = useCallback(() => {
    onDateChange(addDays(selected, 1).toISOString());
  }, [onDateChange, selected]);

  const goToPreviousWeek = useCallback(() => {
    onDateChange(addWeeks(selected, -1).toISOString());
  }, [onDateChange, selected]);

  const goToNextWeek = useCallback(() => {
    onDateChange(addWeeks(selected, 1).toISOString());
  }, [onDateChange, selected]);

  const translateX = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      const translation = event.translationX;
      translateX.value = withSpring(0);

      if (translation > SWIPE_THRESHOLD) {
        scheduleOnRN(goToPreviousDay);
      } else if (translation < -SWIPE_THRESHOLD) {
        scheduleOnRN(goToNextDay);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * 0.14 }],
    opacity: 1 - Math.abs(translateX.value) / 1200
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[animatedStyle, { flex: 1 }]} className='bg-[#F7F5F1] dark:bg-gray-950'>
        <View className='px-4 pb-3 pt-2'>
          <View className='flex-row items-center gap-2'>
            <Pressable
              onPress={goToPreviousWeek}
              className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
            >
              <Ionicons name='chevron-back' size={18} color={iconColor} />
            </Pressable>
            <View className='flex-1 items-center'>
              <Text className='text-lg font-bold text-[#14110F] dark:text-white'>
                {format(selected, 'EEE, MMM d')}
              </Text>
              <Text className='mt-1 text-xs font-medium text-gray-500'>
                Week of {format(weekStart, 'MMM d')}
              </Text>
            </View>
            <Pressable
              onPress={goToNextWeek}
              className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
            >
              <Ionicons name='chevron-forward' size={18} color={iconColor} />
            </Pressable>
          </View>

          <View className='mt-3 flex-row gap-1'>
            {weekDays.map((day) => {
              const dateKey = getLocalDateKey(day);
              const selectedDay = isSameDay(day, selected);
              const today = isToday(day);
              const count = schedulesByDate.get(dateKey) ?? 0;

              return (
                <Pressable
                  key={dateKey}
                  onPress={() => onDateChange(startOfDay(day).toISOString())}
                  className={`flex-1 rounded-xl border px-1 py-2 ${
                    selectedDay
                      ? 'border-[#14110F] bg-[#14110F] dark:border-amber-400 dark:bg-amber-400'
                      : 'border-black/10 bg-white dark:border-white/10 dark:bg-[#16140F]'
                  }`}
                >
                  <Text
                    className={`text-center text-[10px] font-bold uppercase ${
                      selectedDay ? 'text-[#F7F5F1] dark:text-[#14110F]' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {format(day, 'EEE')}
                  </Text>
                  <Text
                    className={`mt-1 text-center font-mono text-base font-bold ${
                      selectedDay ? 'text-[#F7F5F1] dark:text-[#14110F]' : 'text-[#14110F] dark:text-white'
                    }`}
                  >
                    {format(day, 'd')}
                  </Text>
                  <View className='mt-1 h-2 flex-row justify-center gap-0.5'>
                    {Array.from({ length: Math.min(count, 3) }).map((_, index) => (
                      <View
                        key={index}
                        className={`h-1 w-1 rounded-full ${
                          selectedDay ? 'bg-amber-200 dark:bg-[#14110F]' : today ? 'bg-[#14110F] dark:bg-white' : 'bg-black/35 dark:bg-white/35'
                        }`}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScheduleAgendaList schedules={selectedSchedules} onSchedulePress={onSchedulePress} />
      </Animated.View>
    </GestureDetector>
  );
}
