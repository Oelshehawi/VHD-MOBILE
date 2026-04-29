import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
export const DEFAULT_SCHEDULE_TIME_ZONE = 'America/Vancouver';

type ScheduleTimeSource = {
  scheduledStartAtUtc?: string | null;
  startDateTime?: string | null;
  timeZone?: string | null;
};

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getScheduleTimeZone(schedule: Pick<ScheduleTimeSource, 'timeZone'>): string {
  const timeZone = typeof schedule.timeZone === 'string' ? schedule.timeZone.trim() : '';
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIME_ZONE;
}

export function getScheduleStartAtUtc(schedule: ScheduleTimeSource): string {
  return schedule.scheduledStartAtUtc || schedule.startDateTime || '';
}

export function getScheduleStartDate(schedule: ScheduleTimeSource): Date | null {
  const startAtUtc = getScheduleStartAtUtc(schedule);
  if (!startAtUtc) return null;

  const date = new Date(startAtUtc);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getScheduleSortTime(schedule: ScheduleTimeSource): number {
  return getScheduleStartDate(schedule)?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function getLocalDateKey(date: string | Date): string {
  return format(typeof date === 'string' ? new Date(date) : date, 'yyyy-MM-dd');
}

export function getScheduleDateKey(schedule: ScheduleTimeSource): string {
  const startDate = getScheduleStartDate(schedule);
  if (!startDate) return '';

  return formatInTimeZone(startDate, getScheduleTimeZone(schedule), 'yyyy-MM-dd');
}

export function scheduleMatchesDateKey(schedule: ScheduleTimeSource, dateKey: string): boolean {
  return getScheduleDateKey(schedule) === dateKey;
}

export function formatScheduleTime(schedule: ScheduleTimeSource): string {
  const startDate = getScheduleStartDate(schedule);
  if (!startDate) return '';

  return formatInTimeZone(startDate, getScheduleTimeZone(schedule), 'h:mm a');
}

export function formatScheduleDateReadable(schedule: ScheduleTimeSource): string {
  const startDate = getScheduleStartDate(schedule);
  if (!startDate) return '';

  return formatInTimeZone(startDate, getScheduleTimeZone(schedule), 'EEEE, MMM d, yyyy');
}

export function formatScheduleDateShort(schedule: ScheduleTimeSource): string {
  const startDate = getScheduleStartDate(schedule);
  if (!startDate) return '';

  return formatInTimeZone(startDate, getScheduleTimeZone(schedule), 'MMM d, yyyy');
}

export function getScheduleHour(schedule: ScheduleTimeSource): number | null {
  const startDate = getScheduleStartDate(schedule);
  if (!startDate) return null;

  const hour = Number(formatInTimeZone(startDate, getScheduleTimeZone(schedule), 'H'));
  return Number.isFinite(hour) ? hour : null;
}
