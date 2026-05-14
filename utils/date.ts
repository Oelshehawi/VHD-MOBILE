import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const VANCOUVER_TIME_ZONE = 'America/Vancouver';

/**
 * Check if a date string or Date object is valid
 */
export const isValidDate = (date: string | Date | undefined | null): boolean => {
  if (!date) return false;
  try {
    const parsedDate = typeof date === 'string' ? new Date(date) : date;
    return !isNaN(parsedDate.getTime());
  } catch {
    return false;
  }
};

/**
 * Format a date in UTC (YYYY-MM-DD)
 */
export const formatDateUTC = (date: string | Date): string => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  return parsedDate.toISOString().split('T')[0];
};

/**
 * Format a date in readable format (e.g. Thursday, Oct 23, 2025) in UTC
 */
export const formatDateReadable = (date: string | Date | undefined | null): string => {
  if (!date) return '';
  try {
    const parsedDate = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(parsedDate.getTime())) {
      return '';
    }
    return formatInTimeZone(parsedDate, 'UTC', 'EEEE, MMM d, yyyy');
  } catch {
    return '';
  }
};

/**
 * Format a date in short readable format without day of week (e.g. Oct 23, 2025) in UTC
 */
export const formatDateShort = (date: string | Date | undefined | null): string => {
  if (!date) return '';
  try {
    const parsedDate = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(parsedDate.getTime())) {
      return '';
    }
    return formatInTimeZone(parsedDate, 'UTC', 'MMM d, yyyy');
  } catch {
    return '';
  }
};

const getVancouverDateParts = (date: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VANCOUVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  ) as { year?: string; month?: string; day?: string };
};

const isUtcMidnight = (date: Date): boolean =>
  date.getUTCHours() === 0 &&
  date.getUTCMinutes() === 0 &&
  date.getUTCSeconds() === 0 &&
  date.getUTCMilliseconds() === 0;

/**
 * Persist a Vancouver calendar date as UTC midnight for date-only fields.
 */
export const formatVancouverDateAsUtcDateOnly = (date: Date = new Date()): string => {
  const values = getVancouverDateParts(date);
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  if (!year || !month || !day) {
    return date.toISOString();
  }

  return new Date(Date.UTC(year, month - 1, day)).toISOString();
};

/**
 * Display date-only values, including older mobile records that were saved as
 * Vancouver timestamps instead of UTC-midnight date-only values.
 */
export const formatStoredDateReadable = (date: string | Date | undefined | null): string => {
  if (!date) return '';
  try {
    const parsedDate = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(parsedDate.getTime())) {
      return '';
    }

    const timeZone = isUtcMidnight(parsedDate) ? 'UTC' : VANCOUVER_TIME_ZONE;
    return formatInTimeZone(parsedDate, timeZone, 'EEEE, MMM d, yyyy');
  } catch {
    return '';
  }
};

/**
 * Format time in UTC (e.g., "9:00 AM")
 */
export const formatTimeUTC = (date: string | Date): string => {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return parsedDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });
};

/**
 * Convert any date input to UTC Date object
 */
export const toUTCDate = (date: string | Date): Date => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  return new Date(parsedDate.toISOString());
};

/**
 * Format a timestamp in America/Vancouver with offset (e.g. 2026-01-27T14:05:33-08:00)
 */
export const formatVancouverTimestamp = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VANCOUVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );

  const dateTime = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;

  const offsetPart = new Intl.DateTimeFormat('en-CA', {
    timeZone: VANCOUVER_TIME_ZONE,
    timeZoneName: 'shortOffset'
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  const match = offsetPart?.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return date.toISOString();
  }

  const hours = match[1].padStart(3, '0');
  const minutes = match[2] ?? '00';
  return `${dateTime}${hours}:${minutes}`;
};
