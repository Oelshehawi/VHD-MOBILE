import { Schedule } from '@/types';
import { Linking } from 'react-native';
import {
  getLocalDateKey,
  getScheduleSortTime,
  getScheduleStartDate,
  scheduleMatchesDateKey
} from './scheduleTime';

const DEFAULT_ACTIVE_JOB_DURATION_MINUTES = 2 * 60;

function toFiniteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getScheduleDurationMinutes(schedule: Schedule): number {
  const actualDurationMinutes = toFiniteNumber(schedule.actualServiceDurationMinutes);
  if (actualDurationMinutes !== null && actualDurationMinutes >= 0) {
    return actualDurationMinutes;
  }

  const scheduledHours = toFiniteNumber(schedule.hours);
  if (scheduledHours !== null && scheduledHours > 0) {
    return Math.round(scheduledHours * 60);
  }

  return DEFAULT_ACTIVE_JOB_DURATION_MINUTES;
}

function isScheduleActiveOrUpcoming(schedule: Schedule, now: Date): boolean {
  const startDate = getScheduleStartDate(schedule);
  if (!startDate) return false;

  if (startDate.getTime() > now.getTime()) return true;

  const endDate = new Date(startDate.getTime() + getScheduleDurationMinutes(schedule) * 60 * 1000);
  return endDate.getTime() > now.getTime();
}

export const sortSchedulesByTime = (schedules: Schedule[]) => {
  return schedules
    .filter((schedule) => scheduleMatchesDateKey(schedule, getLocalDateKey(new Date())))
    .sort((a, b) => {
      return getScheduleSortTime(a) - getScheduleSortTime(b);
    });
};

export const getRemainingTodaySchedules = (schedules: Schedule[], now: Date = new Date()) => {
  const todayKey = getLocalDateKey(now);

  return schedules
    .filter((schedule) => scheduleMatchesDateKey(schedule, todayKey))
    .filter((schedule) => isScheduleActiveOrUpcoming(schedule, now))
    .sort((a, b) => getScheduleSortTime(a) - getScheduleSortTime(b));
};

export const openMaps = (title: string, location: string) => {
  const query = encodeURIComponent(`${title} ${location}`);
  const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  Linking.openURL(url);
};
