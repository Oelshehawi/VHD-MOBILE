import { useQuery } from '@powersync/react-native';
import { Schedule, PayrollPeriod, PayrollSchedule } from '@/types';

export function useCurrentPayrollPeriod() {
  const query = useQuery<PayrollPeriod>(
    `SELECT * FROM payrollperiods 
     WHERE date(startDate) <= date('now', 'localtime')
     AND date(endDate) >= date('now', 'localtime')
     LIMIT 1`
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
  const query = useQuery<Schedule>(
    `SELECT * FROM schedules 
     WHERE date(startDateTime, 'localtime') = date('now', 'localtime')
     ORDER BY startDateTime ASC`
  );

  return query;
}
