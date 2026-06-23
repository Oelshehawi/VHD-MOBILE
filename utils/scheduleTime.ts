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

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return [year, month, day].every(Number.isFinite) ? { year, month, day } : null;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return '';

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatInTimeZone(date, 'UTC', 'yyyy-MM-dd');
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

/**
 * Actual on-site duration: true submission instant minus the true scheduled
 * start. With true-instant storage there is no day-early compensation — a
 * June 26 00:00 start completed at June 26 02:00 is a clean 120 minutes.
 */
export function calculateActualServiceDurationMinutes(
  schedule: ScheduleTimeSource,
  completedAt: Date
): number | null {
  const startDate = getScheduleStartDate(schedule);
  if (!startDate || !Number.isFinite(completedAt.getTime())) return null;

  const elapsedMinutes = Math.round((completedAt.getTime() - startDate.getTime()) / (1000 * 60));
  return Math.max(0, elapsedMinutes);
}

export function getScheduleSortTime(schedule: ScheduleTimeSource): number {
  const parts = getScheduleClockParts(schedule);
  if (!parts) return Number.POSITIVE_INFINITY;

  // Anchor the day component on the service-day key so a true next-day midnight
  // job lands on the prior service day while still sorting (1440) after that
  // day's 11:30 PM visit (1410).
  const serviceKey = getScheduleServiceDayKey(schedule);
  const [year, month, day] = serviceKey.split('-').map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;

  const dayStartMinutes = Date.UTC(year, month - 1, day) / 60000;
  const scheduleMinutes = getServiceDayMinutes(parts);

  return dayStartMinutes + scheduleMinutes;
}

export function getLocalDateKey(date: string | Date): string {
  return format(typeof date === 'string' ? new Date(date) : date, 'yyyy-MM-dd');
}

function dateKeyToLocalStartIso(dateKey: string): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return new Date().toISOString();
  return new Date(parts.year, parts.month - 1, parts.day).toISOString();
}

/**
 * Literal local calendar date (`YYYY-MM-DD`) — no service-day cutoff applied.
 * A true June 26 00:00 job returns `2026-06-26`. Use only when a literal-date
 * is needed; for grouping/labeling prefer `getScheduleServiceDayKey`.
 */
export function getScheduleLocalDateKey(schedule: ScheduleTimeSource): string {
  return getScheduleClockParts(schedule)?.dateKey ?? '';
}

/**
 * Service-day key (`YYYY-MM-DD`): local `00:00–02:59` maps to the *previous*
 * calendar date; `03:00+` stays on the same date. A true June 26 00:00 job
 * returns `2026-06-25`. Mirrors web `getScheduleServiceDayKeyForSchedule`.
 */
export function getScheduleServiceDayKey(schedule: ScheduleTimeSource): string {
  const parts = getScheduleClockParts(schedule);
  if (!parts) return '';
  return parts.hour < SERVICE_DAY_START_HOUR
    ? addDaysToDateKey(parts.dateKey, -1)
    : parts.dateKey;
}

export function getServiceDayKeyForInstant(
  instant: Date = new Date(),
  timeZone = DEFAULT_SCHEDULE_TIME_ZONE
): string {
  return getScheduleServiceDayKey({
    scheduledStartAtUtc: instant.toISOString(),
    timeZone
  });
}

export function getServiceDayStartIsoForInstant(
  instant: Date = new Date(),
  timeZone = DEFAULT_SCHEDULE_TIME_ZONE
): string {
  const serviceDayKey = getServiceDayKeyForInstant(instant, timeZone);
  return serviceDayKey ? dateKeyToLocalStartIso(serviceDayKey) : instant.toISOString();
}

/**
 * `true` when the schedule's local time is in `[00:00, 03:00)` — the overnight
 * tail that belongs to the prior service day.
 */
export function isPostMidnightServiceTime(schedule: ScheduleTimeSource): boolean {
  const parts = getScheduleClockParts(schedule);
  if (!parts) return false;
  return parts.hour < SERVICE_DAY_START_HOUR;
}

/**
 * Service-day key as a UTC-midnight ISO string (or `''` when unavailable).
 * Mirrors web `getScheduleServiceDayUtcDateForSchedule` — used by report and
 * photo code that needs the service-day date.
 */
export function getScheduleServiceDayUtcIso(schedule: ScheduleTimeSource): string {
  const serviceDayKey = getScheduleServiceDayKey(schedule);
  if (!serviceDayKey) return '';
  return new Date(`${serviceDayKey}T00:00:00.000Z`).toISOString();
}

export function scheduleMatchesDateKey(schedule: ScheduleTimeSource, dateKey: string): boolean {
  return getScheduleServiceDayKey(schedule) === dateKey;
}

export function formatScheduleTime(schedule: ScheduleTimeSource): string {
  const parts = getScheduleClockParts(schedule);
  if (!parts) return '';

  const date = new Date(Date.UTC(2000, 0, 1, parts.hour, parts.minute));
  return formatInTimeZone(date, 'UTC', 'h:mm a');
}

export function formatScheduleDateReadable(schedule: ScheduleTimeSource): string {
  const dateKey = getScheduleServiceDayKey(schedule);
  if (!dateKey) return '';

  return formatInTimeZone(new Date(`${dateKey}T00:00:00.000Z`), 'UTC', 'EEEE, MMM d, yyyy');
}

export function formatScheduleDateShort(schedule: ScheduleTimeSource): string {
  const dateKey = getScheduleServiceDayKey(schedule);
  if (!dateKey) return '';

  return formatInTimeZone(new Date(`${dateKey}T00:00:00.000Z`), 'UTC', 'MMM d, yyyy');
}

export function getScheduleHour(schedule: ScheduleTimeSource): number | null {
  return getScheduleClockParts(schedule)?.hour ?? null;
}
