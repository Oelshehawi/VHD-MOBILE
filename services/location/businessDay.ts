// Current-business-day filtering for mobile tracking. PowerSync may sync
// windows up to 48h ahead (see `getRelevantTrackingWindows`); most Field
// Status display logic acts on windows whose stored service day is today.
// Tracking registration has a slightly wider range so pre-midnight geofences
// can be ready for 12 AM-2:59 AM service-date jobs.

const FIELD_STATUS_TIME_ZONE = 'America/Vancouver';
const SERVICE_DAY_CUTOFF_HOUR = 3;

const LOCAL_DATE_TIME_PARTS = [
  'year',
  'month',
  'day',
  'hour'
] as const;

/**
 * Service-day key (`YYYY-MM-DD`) for a UTC instant in the Field Status time
 * zone. Returns an empty string for an unparseable timestamp.
 */
export function getServiceDayKey(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('en-CA', {
    timeZone: FIELD_STATUS_TIME_ZONE
  });
}

function getLocalDateTimeParts(isoUtc: string): {
  dateKey: string;
  hour: number;
} | null {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FIELD_STATUS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) =>
        LOCAL_DATE_TIME_PARTS.includes(part.type as (typeof LOCAL_DATE_TIME_PARTS)[number])
      )
      .map((part) => [part.type, part.value])
  );

  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = Number.parseInt(values.hour ?? '', 10);
  if (!year || !month || !day || !Number.isFinite(hour)) {
    return null;
  }

  return {
    dateKey: `${year}-${month}-${day}`,
    hour
  };
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1] ?? '', 10);
  const month = Number.parseInt(match[2] ?? '', 10);
  const day = Number.parseInt(match[3] ?? '', 10);
  return [year, month, day].every(Number.isFinite) ? { year, month, day } : null;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const parts = parseDateKey(dateKey);
  if (!parts) {
    return '';
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayKey(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: FIELD_STATUS_TIME_ZONE });
}

/**
 * True when the window's scheduled start falls on the current Vancouver
 * business day.
 */
export function isWindowInCurrentBusinessDay(
  window: { scheduledStartAtUtc: string },
  now: Date = new Date()
): boolean {
  const windowKey = getServiceDayKey(window.scheduledStartAtUtc);
  if (!windowKey) {
    return false;
  }

  const todayKey = getTodayKey(now);
  return windowKey === todayKey;
}

/**
 * True when mobile should register tracking for the window now. This mirrors
 * backend tracking generation: today's Vancouver service-date windows, plus
 * next-day windows before the 3 AM service cutoff so midnight jobs can begin
 * tracking before local midnight.
 */
export function isWindowInCurrentTrackingGenerationRange(
  window: { scheduledStartAtUtc: string },
  now: Date = new Date()
): boolean {
  const local = getLocalDateTimeParts(window.scheduledStartAtUtc);
  if (!local) {
    return false;
  }

  const todayKey = getTodayKey(now);
  if (local.dateKey === todayKey) {
    return true;
  }

  return (
    local.dateKey === addDaysToDateKey(todayKey, 1) &&
    local.hour < SERVICE_DAY_CUTOFF_HOUR
  );
}
