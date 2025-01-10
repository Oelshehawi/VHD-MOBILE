import { parseISO } from 'date-fns';
import { toZonedTime, format } from 'date-fns-tz';

/**
 * Format a date in UTC
 * @param date Date string or Date object
 * @returns Formatted date string (e.g., "January 9th, 2024")
 */
export const formatDateUTC = (date: string | Date): string => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  return format(parsedDate, 'MMMM do, yyyy', { timeZone: 'UTC' });
};

/**
 * Format a time in local timezone
 * @param date Date string or Date object
 * @returns Formatted time string (e.g., "9:00 AM")
 */
export const formatLocalTime = (date: string | Date): string => {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zonedDate = toZonedTime(parsedDate, timeZone);
  return format(zonedDate, 'h:mm a');
};

/**
 * Format a date and time in local timezone
 * @param date Date string or Date object
 * @returns Formatted date and time string (e.g., "January 9th, 2024 at 9:00 AM")
 */
export const formatLocalDateTime = (date: string | Date): string => {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zonedDate = toZonedTime(parsedDate, timeZone);
  return format(zonedDate, "MMMM do, yyyy 'at' h:mm a");
};

/**
 * Convert a UTC date to local timezone
 * @param date Date string or Date object
 * @returns Date object in local timezone
 */
export const toLocalTime = (date: string | Date): Date => {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return toZonedTime(parsedDate, timeZone);
};
