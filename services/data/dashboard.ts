import { useQuery } from '@powersync/react-native';
import { Schedule, PayrollPeriod, PayrollSchedule } from '@/types';

/**
 * Helper function to get formatted date strings with timezone handling
 * @param type 'start' or 'end' of day
 * @param offsetDays Optional number of days to offset (positive or negative)
 * @param referenceDate Optional reference date (defaults to today)
 * @returns Formatted datetime string for SQLite
 */
function getLocalDateTimeString(
  type: 'start' | 'end' = 'start',
  offsetDays: number = 0,
  referenceDate: Date = new Date()
): string {
  // Apply day offset if any
  if (offsetDays !== 0) {
    referenceDate.setDate(referenceDate.getDate() + offsetDays);
  }

  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');

  // Format as YYYY-MM-DD
  const dateStr = `${year}-${month}-${day}`;

  // Add time component based on type
  const timeStr = type === 'start' ? 'T00:00:00' : 'T23:59:59';

  return dateStr + timeStr;
}

export function useCurrentPayrollPeriod() {
  // Get today's date boundaries
  const todayStart = getLocalDateTimeString('start');
  const todayEnd = getLocalDateTimeString('end');

  const query = useQuery<PayrollPeriod>(
    `SELECT * FROM payrollperiods 
     WHERE datetime(startDate) <= datetime(?) 
     AND datetime(endDate) >= datetime(?)
     LIMIT 1`,
    [todayEnd, todayStart] // Use end of today for start comparison and start of today for end comparison
  );

  return query;
}

export function usePayrollSchedules(
  payrollId: string | undefined,
  isManager: boolean,
  userId: string | null | undefined
) {
  const query = useQuery<PayrollSchedule>(
    `SELECT 
      s.id,
      s.jobTitle,
      s.startDateTime as date,
      s.hours,
      s.location
     FROM schedules s
     WHERE (? IS NULL OR s.payrollPeriod = ?)
     AND (? = true OR s.assignedTechnicians LIKE ?)
     ORDER BY s.startDateTime ASC`,
    [payrollId, payrollId, isManager, userId ? `%${userId}%` : '']
  );

  return query;
}

export function useTodaySchedules() {
  // Get today's date boundaries using the helper
  const startOfDayLocal = getLocalDateTimeString('start');
  const endOfDayLocal = getLocalDateTimeString('end');

  const query = useQuery<Schedule>(
    `SELECT * FROM schedules 
     WHERE datetime(startDateTime) >= datetime(?) 
     AND datetime(startDateTime) <= datetime(?)
     ORDER BY startDateTime ASC`,
    [startOfDayLocal, endOfDayLocal]
  );

  return query;
}
