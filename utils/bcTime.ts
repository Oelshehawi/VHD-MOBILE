export const VANCOUVER_TIME_ZONE = 'America/Vancouver';
// IANA's Etc/GMT signs are inverted: Etc/GMT+7 means UTC-07:00.
export const BC_PERMANENT_TIME_ZONE = 'Etc/GMT+7';
export const DEFAULT_SCHEDULE_TIME_ZONE = VANCOUVER_TIME_ZONE;
export const BC_PERMANENT_TIME_START_UTC = '2026-03-08T10:00:00.000Z';

const BC_PERMANENT_TIME_START_UTC_MS = Date.parse(BC_PERMANENT_TIME_START_UTC);

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function normalizeScheduleTimeZone(timeZone?: string | null): string {
  const normalized = typeof timeZone === 'string' ? timeZone.trim() : '';
  return normalized && isValidTimeZone(normalized)
    ? normalized
    : DEFAULT_SCHEDULE_TIME_ZONE;
}

/**
 * Resolves the timezone rules that apply to a true instant. Vancouver retains
 * its historical offsets before B.C.'s final transition and uses permanent
 * UTC-7 from the transition onward. Other valid IANA zones are unchanged.
 */
export function getEffectiveTimeZoneForInstant(
  timeZone: string | null | undefined,
  value: Date | string | number
): string {
  const normalized = normalizeScheduleTimeZone(timeZone);
  if (normalized !== VANCOUVER_TIME_ZONE) return normalized;

  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return normalized;

  return instant.getTime() >= BC_PERMANENT_TIME_START_UTC_MS
    ? BC_PERMANENT_TIME_ZONE
    : normalized;
}
