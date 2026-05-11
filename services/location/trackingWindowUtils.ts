import type {
  GeofenceTarget,
  ParsedTrackingWindow,
  TechnicianTrackingWindow
} from '@/types/locationTracking';

const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 500;
const DEFAULT_DEPOT_RADIUS_METERS = 150;
const DEFAULT_JOB_RADIUS_METERS = 200;
const MAX_RELEVANT_WINDOW_LOOKAHEAD_MS = 48 * 60 * 60 * 1000;

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function clampRadius(value: number | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  return Math.min(MAX_RADIUS_METERS, Math.max(MIN_RADIUS_METERS, Math.round(value)));
}

export function parseGeofenceTarget(
  value: string | GeofenceTarget | null | undefined,
  fallbackRadiusMeters: number
): GeofenceTarget | null {
  if (!value) {
    return null;
  }

  let parsed: Partial<GeofenceTarget> | null = null;
  if (typeof value === 'string') {
    try {
      const json = JSON.parse(value);
      parsed = typeof json === 'object' && json !== null ? json : null;
    } catch {
      parsed = null;
    }
  } else {
    parsed = value;
  }

  if (!parsed) {
    return null;
  }

  const lat = finiteNumber(parsed.lat);
  const lng = finiteNumber(parsed.lng);
  if (lat === null || lng === null) {
    return null;
  }

  return {
    address: typeof parsed.address === 'string' ? parsed.address : undefined,
    lat,
    lng,
    radiusMeters: clampRadius(finiteNumber(parsed.radiusMeters), fallbackRadiusMeters)
  };
}

export function parseTrackingWindow(
  window: TechnicianTrackingWindow
): ParsedTrackingWindow | null {
  if (window.status === 'cancelled' || window.status === 'expired') {
    return null;
  }

  if (window.locationUpdateMode !== 'travel_only') {
    return null;
  }

  const depotTarget = parseGeofenceTarget(window.depot, DEFAULT_DEPOT_RADIUS_METERS);
  const jobSiteTarget = parseGeofenceTarget(window.jobSite, DEFAULT_JOB_RADIUS_METERS);
  if (!depotTarget || !jobSiteTarget) {
    return null;
  }

  if (
    Number.isNaN(Date.parse(window.startsAtUtc)) ||
    Number.isNaN(Date.parse(window.scheduledStartAtUtc)) ||
    Number.isNaN(Date.parse(window.endsAtUtc))
  ) {
    return null;
  }

  return {
    ...window,
    depotTarget,
    jobSiteTarget
  };
}

export function getRelevantTrackingWindows(
  windows: ReadonlyArray<TechnicianTrackingWindow>,
  now: Date = new Date()
): ParsedTrackingWindow[] {
  const nowMs = now.getTime();
  const lookaheadMs = nowMs + MAX_RELEVANT_WINDOW_LOOKAHEAD_MS;

  return windows
    .map(parseTrackingWindow)
    .filter((window): window is ParsedTrackingWindow => {
      if (!window) {
        return false;
      }

      const startsAtMs = Date.parse(window.startsAtUtc);
      const endsAtMs = Date.parse(window.endsAtUtc);
      return endsAtMs >= nowMs && startsAtMs <= lookaheadMs;
    })
    .sort((a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc));
}

export function isTravelWindowActive(
  window: Pick<ParsedTrackingWindow, 'startsAtUtc' | 'endsAtUtc'>,
  now: Date = new Date()
): boolean {
  const nowMs = now.getTime();
  return Date.parse(window.startsAtUtc) <= nowMs && nowMs <= Date.parse(window.endsAtUtc);
}

export function getPingIntervalSeconds(
  window: Pick<TechnicianTrackingWindow, 'pingIntervalSeconds'>
): number {
  const fallbackSeconds = 5 * 60;
  const value = finiteNumber(window.pingIntervalSeconds);
  if (value === null) {
    return fallbackSeconds;
  }

  return Math.min(5 * 60, Math.max(5 * 60, Math.round(value)));
}

export function getDistanceIntervalMeters(
  window: Pick<TechnicianTrackingWindow, 'distanceIntervalMeters'>
): number {
  const fallbackMeters = 250;
  const value = finiteNumber(window.distanceIntervalMeters);
  if (value === null) {
    return fallbackMeters;
  }

  return Math.min(500, Math.max(100, Math.round(value)));
}
