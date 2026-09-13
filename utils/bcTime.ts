export const VANCOUVER_TIME_ZONE = 'America/Vancouver';
// IANA's Etc/GMT signs are inverted: Etc/GMT+7 means UTC-07:00.
export const BC_PERMANENT_TIME_ZONE = 'Etc/GMT+7';
export const DEFAULT_SCHEDULE_TIME_ZONE = VANCOUVER_TIME_ZONE;
export const BC_PERMANENT_TIME_START_UTC = '2026-03-08T10:00:00.000Z';

const BC_PERMANENT_TIME_START_UTC_MS = Date.parse(BC_PERMANENT_TIME_START_UTC);

// `new Intl.DateTimeFormat` is expensive on Hermes and this probe sits on the
// hot path for every schedule row. IANA validity is constant for the lifetime
// of the process, so the answer is memoized. Purely a speed cache: it never
// changes which timezone a given string resolves to.
const timeZoneValidityCache = new Map<string, boolean>();

export function isValidTimeZone(timeZone: string): boolean {
  const cached = timeZoneValidityCache.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }

  let valid: boolean;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    valid = true;
  } catch {
    valid = false;
  }

  timeZoneValidityCache.set(timeZone, valid);
  return valid;
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
