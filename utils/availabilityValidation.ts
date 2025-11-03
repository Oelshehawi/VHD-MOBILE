import { differenceInDays, parseISO, format } from 'date-fns';
import type { Availability } from '../services/database/schema';

/**
 * Validate that start time is before end time in HH:mm format
 * @param startTime Start time in HH:mm format
 * @param endTime End time in HH:mm format
 * @returns true if valid, false otherwise
 */
export function validateTimeRange(startTime: string, endTime: string): boolean {
  try {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startTotalMinutes = startHour * 60 + startMin;
    const endTotalMinutes = endHour * 60 + endMin;

    return startTotalMinutes < endTotalMinutes;
  } catch {
    return false;
  }
}

/**
 * Validate that a time-off request has at least 2 weeks (14 days) advance notice
 * @param startDate Start date in ISO format
 * @returns true if valid, false otherwise
 */
export function validateTimeOffAdvanceNotice(startDate: string): boolean {
  try {
    const requestDate = new Date();
    const availabilityDate = parseISO(startDate);
    const daysDifference = differenceInDays(availabilityDate, requestDate);
    return daysDifference >= 14;
  } catch {
    return false;
  }
}

/**
 * Check if date is within 14 days from today (for disabling in date picker)
 * @param date Date in ISO format
 * @returns true if date is within 14 days, false otherwise
 */
export function isWithin14Days(date: string): boolean {
  try {
    const checkDate = parseISO(date);
    const today = new Date();
    const daysDifference = differenceInDays(checkDate, today);
    return daysDifference < 14 && daysDifference >= 0;
  } catch {
    return false;
  }
}

/**
 * Validate that availability records don't overlap
 * @param existingAvailability Array of existing availability records
 * @param newAvailability New availability record to check
 * @returns error message if conflict found, null if no conflict
 */
export function validateNoConflicts(
  existingAvailability: Availability[],
  newAvailability: {
    dayOfWeek?: number;
    startTime: string;
    endTime: string;
    isRecurring: boolean;
    specificDate?: string;
    availabilityId?: string;
  }
): string | null {
  try {
    const [newStartHour, newStartMin] = newAvailability.startTime
      .split(':')
      .map(Number);
    const [newEndHour, newEndMin] = newAvailability.endTime
      .split(':')
      .map(Number);

    const newStartMinutes = newStartHour * 60 + newStartMin;
    const newEndMinutes = newEndHour * 60 + newEndMin;

    for (const existing of existingAvailability) {
      // Skip the same record if editing
      if (
        newAvailability.availabilityId &&
        existing.id === newAvailability.availabilityId
      ) {
        continue;
      }

      // Check if both are recurring and on same day
      if (
        newAvailability.isRecurring &&
        existing.isRecurring &&
        newAvailability.dayOfWeek === existing.dayOfWeek
      ) {
        const [existStartHour, existStartMin] = (existing.startTime || '')
          .split(':')
          .map(Number);
        const [existEndHour, existEndMin] = (existing.endTime || '')
          .split(':')
          .map(Number);

        const existStartMinutes = existStartHour * 60 + existStartMin;
        const existEndMinutes = existEndHour * 60 + existEndMin;

        // Check for overlap
        if (newStartMinutes < existEndMinutes && newEndMinutes > existStartMinutes) {
          return `Overlapping availability block exists for ${getDayName(
            newAvailability.dayOfWeek!
          )}`;
        }
      }

      // Check if both are specific dates and same date
      if (
        !newAvailability.isRecurring &&
        !existing.isRecurring &&
        newAvailability.specificDate === existing.specificDate
      ) {
        const [existStartHour, existStartMin] = (existing.startTime || '')
          .split(':')
          .map(Number);
        const [existEndHour, existEndMin] = (existing.endTime || '')
          .split(':')
          .map(Number);

        const existStartMinutes = existStartHour * 60 + existStartMin;
        const existEndMinutes = existEndHour * 60 + existEndMin;

        // Check for overlap
        if (newStartMinutes < existEndMinutes && newEndMinutes > existStartMinutes) {
          const dateStr = format(
            parseISO(newAvailability.specificDate!),
            'MMM d, yyyy'
          );
          return `Overlapping availability block exists on ${dateStr}`;
        }
      }
    }

    return null;
  } catch (error) {
    return 'Error validating availability';
  }
}

/**
 * Validate date range for time-off requests
 * @param startDate Start date in ISO format
 * @param endDate End date in ISO format
 * @returns error message if invalid, null if valid
 */
export function validateTimeOffDateRange(
  startDate: string,
  endDate: string
): string | null {
  try {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (start > end) {
      return 'End date must be after or equal to start date';
    }

    if (!validateTimeOffAdvanceNotice(startDate)) {
      return 'Time off must be requested at least 2 weeks in advance';
    }

    return null;
  } catch {
    return 'Invalid date format';
  }
}

/**
 * Format time to HH:mm format
 * @param time Time string or Date object
 * @returns Formatted HH:mm string
 */
export function formatTimeToHHmm(time: string | Date): string {
  try {
    if (typeof time === 'string') {
      // Assume it's already in HH:mm format or similar
      const match = time.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        const hour = String(parseInt(match[1])).padStart(2, '0');
        const min = match[2];
        return `${hour}:${min}`;
      }
    } else {
      const hour = String(time.getHours()).padStart(2, '0');
      const min = String(time.getMinutes()).padStart(2, '0');
      return `${hour}:${min}`;
    }
    return '00:00';
  } catch {
    return '00:00';
  }
}

/**
 * Format availability for UI display
 * @param availability Availability record
 * @returns Formatted string like "Monday 9:00 AM - 5:00 PM" or "Dec 15, 2024 2:00 PM - 6:00 PM"
 */
export function formatAvailabilityDisplay(availability: Availability): string {
  try {
    const startTime = formatTo12Hour(availability.startTime || '00:00');
    const endTime = formatTo12Hour(availability.endTime || '00:00');

    if (availability.isRecurring && availability.dayOfWeek !== null) {
      const dayName = getDayName(availability.dayOfWeek!);
      return `${dayName} ${startTime} - ${endTime}`;
    } else if (availability.specificDate) {
      const dateStr = format(parseISO(availability.specificDate), 'MMM d, yyyy');
      return `${dateStr} ${startTime} - ${endTime}`;
    }

    return `${startTime} - ${endTime}`;
  } catch {
    return 'Invalid availability';
  }
}

/**
 * Convert 24-hour time to 12-hour format with AM/PM
 * @param time Time in HH:mm format
 * @returns Time in 12-hour format like "9:00 AM"
 */
export function formatTo12Hour(time: string): string {
  try {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  } catch {
    return time;
  }
}

/**
 * Get day name from day of week number (0-6, Sunday=0)
 * @param dayOfWeek Day number (0-6)
 * @returns Day name like "Monday"
 */
export function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}

/**
 * Calculate days between two dates
 * @param date1 First date in ISO format
 * @param date2 Second date in ISO format
 * @returns Number of days between dates
 */
export function calculateDateDifference(date1: string, date2: string): number {
  try {
    const d1 = parseISO(date1);
    const d2 = parseISO(date2);
    return differenceInDays(d2, d1);
  } catch {
    return 0;
  }
}

/**
 * Parse an ISO date string and return a Date in the local timezone
 * This fixes the issue where UTC dates at midnight are interpreted in local timezone
 * @param isoDateString ISO date string like "2025-11-17T00:00:00.000Z"
 * @returns Date object adjusted for local timezone
 */
export function parseISODateToLocalDate(isoDateString: string): Date {
  // Extract just the date part (YYYY-MM-DD)
  const dateMatch = isoDateString.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) {
    throw new Error('Invalid date format');
  }

  const [, year, month, day] = dateMatch;
  // Create a date in local timezone using these components
  // This ensures we get the date as intended, not shifted by timezone
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

/**
 * Format date range for display
 * @param startDate Start date in ISO format (can be null/undefined)
 * @param endDate End date in ISO format (can be null/undefined)
 * @returns Formatted string like "Dec 15 - Dec 20, 2024"
 */
export function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  try {
    if (!startDate || !endDate) {
      return 'Invalid dates';
    }

    const start = parseISODateToLocalDate(startDate);
    const end = parseISODateToLocalDate(endDate);

    const startFormatted = format(start, 'MMM d');
    const endFormatted = format(end, 'MMM d, yyyy');

    return `${startFormatted} - ${endFormatted}`;
  } catch {
    return 'Invalid dates';
  }
}
