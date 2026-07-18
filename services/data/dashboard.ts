import { useQuery } from '@powersync/react-native';
import { Schedule, PayrollPeriod, PayrollSchedule } from '@/types';
import { ASSIGNED_TO_USER_CLAUSE } from './sqlFragments';

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

/**
 * Latest approved payroll period whose payday hasn't passed yet — i.e. the pay
 * you're currently awaiting or just received. A period is approved by the
 * manager *after* it ends (by which time "today" already falls in the next
 * period), so this is the period whose finalized hours the employee cares about.
 */
export function useMostRecentApprovedPayrollPeriod() {
  const todayStart = getLocalDateTimeString('start');

  const query = useQuery<PayrollPeriod>(
    `SELECT * FROM payrollperiods
     WHERE status = 'approved'
     AND datetime(payDay) >= datetime(?)
     ORDER BY datetime(endDate) DESC
     LIMIT 1`,
    [todayStart]
  );

  return query;
}

export function usePayrollSchedules(
  payrollId: string | undefined,
  isManager: boolean,
  fieldStaffId: string | null | undefined,
  canViewHours: boolean = true
) {
  const query = useQuery<PayrollSchedule>(
    `SELECT 
      s.id,
      s.jobTitle,
      s.scheduledStartAtUtc as date,
      s.scheduledStartAtUtc,
      s.timeZone,
      s.hours,
      s.shifts,
      s.assignedTechnicians,
      s.location
     FROM schedules s
     WHERE ? = true
     AND (? IS NULL OR s.payrollPeriod = ?)
     AND (? = true OR (${ASSIGNED_TO_USER_CLAUSE}))
     ORDER BY s.scheduledStartAtUtc ASC`,
    [canViewHours, payrollId, payrollId, isManager, fieldStaffId ?? '']
  );

  return query;
}

export function useTodaySchedules() {
  // Get today's date boundaries using the helper
  const startOfDayLocal = getLocalDateTimeString('start', -1);
  const endOfDayLocal = getLocalDateTimeString('end', 1);

  const query = useQuery<Schedule>(
    `SELECT * FROM schedules
     WHERE datetime(scheduledStartAtUtc) >= datetime(?)
     AND datetime(scheduledStartAtUtc) <= datetime(?)
     ORDER BY scheduledStartAtUtc ASC`,
    [startOfDayLocal, endOfDayLocal]
  );

  return query;
}
