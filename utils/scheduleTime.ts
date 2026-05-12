import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
export const DEFAULT_SCHEDULE_TIME_ZONE = 'America/Vancouver';
const SERVICE_DAY_START_HOUR = 3;

type ScheduleTimeSource = {
  scheduledStartAtUtc?: string | null;
  startDateTime?: string | null;
  timeZone?: string | null;
};

type ScheduleClockParts = {
  dateKey: string;
  hour: number;
  minute: number;
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

function parseZonedClockParts(date: Date, timeZone: string): ScheduleClockParts | null {
  const [dateKey, time] = formatInTimeZone(date, timeZone, 'yyyy-MM-dd HH:mm').split(' ');
  const [rawHour, rawMinute] = time.split(':');
  const hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (!dateKey || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  return { dateKey, hour, minute };
}

function getServiceDayMinutes(parts: Pick<ScheduleClockParts, 'hour' | 'minute'>): number {
  const hour = parts.hour < SERVICE_DAY_START_HOUR ? parts.hour + 24 : parts.hour;
  return hour * 60 + parts.minute;
}

function getScheduleClockParts(schedule: ScheduleTimeSource): ScheduleClockParts | null {
  const startAtUtc = getScheduleStartAtUtc(schedule);
  if (!startAtUtc) return null;

  const startDate = getScheduleStartDate(schedule);
  if (!startDate) return null;

  return parseZonedClockParts(startDate, getScheduleTimeZone(schedule));
}

export function getScheduleStartDate(schedule: ScheduleTimeSource): Date | null {
  const startAtUtc = getScheduleStartAtUtc(schedule);
  if (!startAtUtc) return null;

  const date = new Date(startAtUtc);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getScheduleSortTime(schedule: ScheduleTimeSource): number {
  const parts = getScheduleClockParts(schedule);
  if (!parts) return Number.POSITIVE_INFINITY;

  const [year, month, day] = parts.dateKey.split('-').map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;

  const dayStartMinutes = Date.UTC(year, month - 1, day) / 60000;
  const scheduleMinutes = getServiceDayMinutes(parts);

  return dayStartMinutes + scheduleMinutes;
}

export function getLocalDateKey(date: string | Date): string {
  return format(typeof date === 'string' ? new Date(date) : date, 'yyyy-MM-dd');
}

export function getScheduleDateKey(schedule: ScheduleTimeSource): string {
  return getScheduleClockParts(schedule)?.dateKey ?? '';
}

export function scheduleMatchesDateKey(schedule: ScheduleTimeSource, dateKey: string): boolean {
  return getScheduleDateKey(schedule) === dateKey;
}

export function formatScheduleTime(schedule: ScheduleTimeSource): string {
  const parts = getScheduleClockParts(schedule);
  if (!parts) return '';

  const date = new Date(Date.UTC(2000, 0, 1, parts.hour, parts.minute));
  return formatInTimeZone(date, 'UTC', 'h:mm a');
}

export function formatScheduleDateReadable(schedule: ScheduleTimeSource): string {
  const dateKey = getScheduleDateKey(schedule);
  if (!dateKey) return '';

  return formatInTimeZone(new Date(`${dateKey}T00:00:00.000Z`), 'UTC', 'EEEE, MMM d, yyyy');
}

export function formatScheduleDateShort(schedule: ScheduleTimeSource): string {
  const dateKey = getScheduleDateKey(schedule);
  if (!dateKey) return '';

  return formatInTimeZone(new Date(`${dateKey}T00:00:00.000Z`), 'UTC', 'MMM d, yyyy');
}

export function getScheduleHour(schedule: ScheduleTimeSource): number | null {
  return getScheduleClockParts(schedule)?.hour ?? null;
}
