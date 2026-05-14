import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { DEFAULT_ROW_COMPARATOR, useQuery } from '@powersync/react-native';
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
import { isScheduleReportRequired } from '@/utils/schedules';

interface ScheduleWeekAgendaProps {
  selectedDate: string;
  schedules: ReadonlyArray<Schedule>;
  onDateChange: (date: string) => void;
  onSchedulePress: (schedule: Schedule) => void;
}

const SWIPE_THRESHOLD = 50;
const PROGRESS_STEPS = [
  {
    key: 'confirmed',
    label: 'Confirmed',
    completeClassName: 'border-emerald-600 bg-emerald-600 dark:border-emerald-300 dark:bg-emerald-300',
    pendingClassName: 'border-emerald-600/45 bg-emerald-100 dark:border-emerald-300/45 dark:bg-emerald-950/80'
  },
  {
    key: 'photos',
    label: 'Photos',
    completeClassName: 'border-blue-600 bg-blue-600 dark:border-blue-300 dark:bg-blue-300',
    pendingClassName: 'border-blue-600/45 bg-blue-100 dark:border-blue-300/45 dark:bg-blue-950/80'
  },
  {
    key: 'signature',
    label: 'Signature',
    completeClassName: 'border-amber-500 bg-amber-500 dark:border-amber-300 dark:bg-amber-300',
    pendingClassName: 'border-amber-500/45 bg-amber-100 dark:border-amber-300/45 dark:bg-amber-950/80'
  },
  {
    key: 'report',
    label: 'Report',
    completeClassName: 'border-violet-600 bg-violet-600 dark:border-violet-300 dark:bg-violet-300',
    pendingClassName: 'border-violet-600/45 bg-violet-100 dark:border-violet-300/45 dark:bg-violet-950/80'
  }
] as const;

type JobProgress = {
  confirmed: boolean;
  photos: boolean;
  signature: boolean;
  report: boolean;
};

type PhotoProgressRow = {
  scheduleId: string;
  beforeCount: number | null;
  afterCount: number | null;
  signatureCount: number | null;
};

type ReportProgressRow = {
  scheduleId: string;
  reportDone: number | null;
};

function statusLabel(schedule: Schedule): { label: string; bgClassName: string; textClassName: string } {
  if (schedule.deadRun) {
    return { label: 'blocked', bgClassName: 'bg-red-100 dark:bg-red-950/70', textClassName: 'text-red-700 dark:text-red-200' };
  }
  if (schedule.confirmed) {
    return { label: 'confirmed', bgClassName: 'bg-emerald-100 dark:bg-emerald-950/70', textClassName: 'text-emerald-800 dark:text-emerald-200' };
  }
  return { label: 'pending', bgClassName: 'bg-amber-100 dark:bg-amber-950/70', textClassName: 'text-amber-900 dark:text-amber-200' };
}

function JobProgressDots({ hasNotes, progress }: { hasNotes: boolean; progress: JobProgress }) {
  const states = PROGRESS_STEPS.map((step) => ({
    ...step,
    complete: progress[step.key]
  }));
  const accessibilityLabel = PROGRESS_STEPS.map(
    (step, index) => `${step.label}: ${states[index].complete ? 'complete' : 'pending'}`
  ).join(', ');

  return (
    <View className='flex-row items-center gap-1' accessibilityLabel={accessibilityLabel}>
      {states.map((step, index) => (
        <React.Fragment key={step.key}>
          <View
            className={`h-2.5 w-2.5 rounded-full border ${
              step.complete ? step.completeClassName : step.pendingClassName
            }`}
          />
          {index < PROGRESS_STEPS.length - 1 && (
            <View className='h-px w-3 bg-black/10 dark:bg-white/15' />
          )}
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
  progress,
  onPress
}: {
  schedule: Schedule;
  progress: JobProgress;
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
            <JobProgressDots hasNotes={hasNotes} progress={progress} />
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
  const scheduleIds = useMemo(
    () => Array.from(new Set(sortedSchedules.map((schedule) => schedule.id).filter(Boolean))),
    [sortedSchedules]
  );
  const scheduleIdPlaceholders = useMemo(() => scheduleIds.map(() => '?').join(','), [scheduleIds]);

  const { data: photoProgressRows = [] } = useQuery<PhotoProgressRow>(
    scheduleIds.length > 0
      ? `SELECT
           scheduleId,
           SUM(CASE WHEN type = 'before' THEN 1 ELSE 0 END) as beforeCount,
           SUM(CASE WHEN type = 'after' THEN 1 ELSE 0 END) as afterCount,
           SUM(CASE WHEN type = 'signature' THEN 1 ELSE 0 END) as signatureCount
         FROM photos
         WHERE scheduleId IN (${scheduleIdPlaceholders})
         GROUP BY scheduleId`
      : `SELECT '' as scheduleId, 0 as beforeCount, 0 as afterCount, 0 as signatureCount WHERE 0`,
    scheduleIds,
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const { data: reportProgressRows = [] } = useQuery<ReportProgressRow>(
    scheduleIds.length > 0
      ? `SELECT
           scheduleId,
           MAX(CASE WHEN reportStatus IN ('in_progress', 'completed') THEN 1 ELSE 0 END) as reportDone
         FROM reports
         WHERE scheduleId IN (${scheduleIdPlaceholders})
         GROUP BY scheduleId`
      : `SELECT '' as scheduleId, 0 as reportDone WHERE 0`,
    scheduleIds,
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const photoProgressByScheduleId = useMemo(() => {
    return new Map(photoProgressRows.map((row) => [row.scheduleId, row]));
  }, [photoProgressRows]);
  const reportProgressByScheduleId = useMemo(() => {
    return new Map(reportProgressRows.map((row) => [row.scheduleId, Number(row.reportDone ?? 0) > 0]));
  }, [reportProgressRows]);

  const getProgress = useCallback(
    (schedule: Schedule): JobProgress => {
      const photoProgress = photoProgressByScheduleId.get(schedule.id);
      const beforeCount = Number(photoProgress?.beforeCount ?? 0);
      const afterCount = Number(photoProgress?.afterCount ?? 0);
      const signatureCount = Number(photoProgress?.signatureCount ?? 0);
      const reportRequired = isScheduleReportRequired(schedule);

      return {
        confirmed: Boolean(schedule.confirmed),
        photos: beforeCount > 0 && afterCount > 0,
        signature: signatureCount > 0,
        report: !reportRequired || (reportProgressByScheduleId.get(schedule.id) ?? false)
      };
    },
    [photoProgressByScheduleId, reportProgressByScheduleId]
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
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              progress={getProgress(schedule)}
              onPress={onSchedulePress}
            />
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
