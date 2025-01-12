import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Format a date in UTC (YYYY-MM-DD)
 */
export const formatDateUTC = (date: string | Date): string => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  return parsedDate.toISOString().split('T')[0];
};

/**
 * Format a date in readable format (e.g. Jan 12, 2025) in UTC
 */
export const formatDateReadable = (date: string | Date): string => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(parsedDate, 'UTC', 'MMM d, yyyy');
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
    timeZone: 'UTC',
  });
};

/**
 * Convert any date input to UTC Date object
 */
export const toUTCDate = (date: string | Date): Date => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  return new Date(parsedDate.toISOString());
};
