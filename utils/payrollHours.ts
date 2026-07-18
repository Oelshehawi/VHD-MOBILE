import type { ShiftType } from '@/types';

/**
 * Per-worker payroll hours resolution (mirror of the web `payrollHours` util).
 *
 * `schedule.hours` is the shared, planned/default duration for a job. A manager
 * correction for an individual worker is stored in `schedule.shifts[]` keyed by
 * the worker's Technician `_id` (`shifts[].technicianId`, matching
 * `assignedTechnicians[]`). On-device, `shifts` arrives as a JSON text column,
 * so we parse it the same way `parseAssignedTechnicians` parses assignees.
 */

interface PayrollHoursSchedule {
  hours?: number | null;
  shifts?: string | ShiftType[] | null;
}

/** Mirrors the `hours` default on the web `ScheduleSchema`. */
export const DEFAULT_PAYROLL_HOURS = 4;

function parseShifts(shifts: unknown): ShiftType[] {
  try {
    if (typeof shifts === 'string') {
      const parsed = JSON.parse(shifts);
      return Array.isArray(parsed) ? parsed : [];
    }
    return Array.isArray(shifts) ? shifts : [];
  } catch {
    return [];
  }
}

/**
 * Resolve the payroll hours for a single worker on a schedule.
 *
 * 1. A per-worker override in `shifts[]` (including an intentional `0`) — note
 *    the `??` so `0` is respected.
 * 2. The shared job default `schedule.hours`.
 * 3. The schema default of `4`.
 *
 * Managers are never written into `shifts[]`, so they fall back to the shared
 * `schedule.hours`, which is correct for the manager review view.
 */
export function getPayrollHoursForTechnician(
  schedule: PayrollHoursSchedule,
  technicianId: string
): number {
  const override = parseShifts(schedule.shifts).find(
    (shift) => shift.technicianId === technicianId
  )?.hoursWorked;

  return override ?? schedule.hours ?? DEFAULT_PAYROLL_HOURS;
}
