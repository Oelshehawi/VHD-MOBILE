import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type {
  LocationEventPlatform,
  MobileLocationEvent
} from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { postOrQueueLocationEvent } from './LocationEventQueue';
import {
  readLocationTrackingState,
  updateLocationTrackingState
} from './LocationTrackingState';
import type { PersistedTrackingWindow } from './LocationTrackingState';
import {
  getOnSitePingIntervalSeconds,
  getPingIntervalSeconds
} from './trackingWindowUtils';
import { selectActivePingWindow } from './fieldStatusWindowSelection';

export const LOCATION_GEOFENCE_TASK_NAME = 'com.braille71.vhdapp.location-geofence';
export const LOCATION_UPDATES_TASK_NAME = 'com.braille71.vhdapp.location-updates';

export const ACCURACY_BUFFER_CAP_METERS = 100;

export type LocationUpdatesMode = 'travel' | 'on-site';

// Travel pings stay tight enough for the server presence engine to confirm
// transitions quickly; on-site pings relax slightly to save battery.
const TRAVEL_INTERVAL_MIN_SECONDS = 60;
const TRAVEL_INTERVAL_MAX_SECONDS = 300;

export function getEventPlatform(): LocationEventPlatform | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }

  return null;
}

export function buildBaseEvent(
  window: Pick<PersistedTrackingWindow, 'id' | 'scheduleId'>,
  eventType: MobileLocationEvent['eventType'],
  source: MobileLocationEvent['source']
): MobileLocationEvent | null {
  const platform = getEventPlatform();
  if (!platform) {
    return null;
  }

  return {
    trackingWindowId: window.id,
    scheduleId: window.scheduleId,
    eventType,
    recordedAt: new Date().toISOString(),
    source,
    platform
  };
}

// Ping-active is purely a time-range property: arrived/exited state only
// selects cadence (the server presence engine owns enter/exit decisions).
export function isPersistedWindowPingActive(
  window: PersistedTrackingWindow,
  now: Date = new Date()
): boolean {
  const nowMs = now.getTime();
  return Date.parse(window.startsAtUtc) <= nowMs && nowMs <= Date.parse(window.endsAtUtc);
}

// Mirrors LocationTrackingCoordinator's selected-ping-window rule so the
// background task and the coordinator agree on the single active window.
export function getActivePersistedPingWindows(
  windows: PersistedTrackingWindow[],
  arrivedWindowIds: string[],
  now: Date = new Date()
): PersistedTrackingWindow[] {
  const selected = selectActivePingWindow(windows, arrivedWindowIds, now);
  return selected ? [selected] : [];
}

export function isWindowOnSite(
  windowId: string,
  arrivedWindowIds: string[],
  exitedWindowIds: string[]
): boolean {
  return arrivedWindowIds.includes(windowId) && !exitedWindowIds.includes(windowId);
}

export function getPingIntervalSecondsForState(
  window: Pick<PersistedTrackingWindow, 'pingIntervalSeconds' | 'onSitePingIntervalSeconds'>,
  onSite: boolean
): number {
  if (onSite) {
    return getOnSitePingIntervalSeconds(window);
  }

  return Math.min(TRAVEL_INTERVAL_MAX_SECONDS, getPingIntervalSeconds(window));
}

export function shouldEmitLocationPing(
  window: PersistedTrackingWindow,
  lastLocationPingAtByWindowId: Record<string, string>,
  recordedAtMs: number,
  intervalSeconds: number = getPingIntervalSeconds(window)
): boolean {
  const lastPingAt = lastLocationPingAtByWindowId[window.id];
  if (!lastPingAt) {
    return true;
  }

  const lastPingAtMs = Date.parse(lastPingAt);
  if (Number.isNaN(lastPingAtMs)) {
    return true;
  }

  return recordedAtMs - lastPingAtMs >= intervalSeconds * 1000;
}

export function distanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  // haversine distance in meters
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

export function getJobSiteDistanceMeters(
  window: PersistedTrackingWindow,
  location: Location.LocationObject
): number | null {
  if (
    typeof window.jobSiteLat !== 'number' ||
    typeof window.jobSiteLng !== 'number' ||
    typeof window.jobSiteRadiusMeters !== 'number'
  ) {
    return null;
  }

  return distanceMeters(
    {
      lat: window.jobSiteLat,
      lng: window.jobSiteLng
    },
    {
      lat: location.coords.latitude,
      lng: location.coords.longitude
    }
  );
}

export function getDepotDistanceMeters(
  window: PersistedTrackingWindow,
  location: Location.LocationObject
): number | null {
  if (
    typeof window.depotLat !== 'number' ||
    typeof window.depotLng !== 'number' ||
    typeof window.depotRadiusMeters !== 'number'
  ) {
    return null;
  }

  return distanceMeters(
    {
      lat: window.depotLat,
      lng: window.depotLng
    },
    {
      lat: location.coords.latitude,
      lng: location.coords.longitude
    }
  );
}

export function isLocationInsideRadius(
  distanceMetersValue: number,
  radiusMeters: number,
  accuracyMeters?: number | null
): boolean {
  const accuracyBuffer =
    typeof accuracyMeters === 'number' && accuracyMeters > 0
      ? Math.min(accuracyMeters, ACCURACY_BUFFER_CAP_METERS)
      : 0;

  return distanceMetersValue <= radiusMeters + accuracyBuffer;
}

export async function stopLocationUpdatesIfNoActivePersistedWindow(reason: string): Promise<void> {
  const state = await readLocationTrackingState();
  const hasTimeActiveWindow = state.windows.some((window) =>
    isPersistedWindowPingActive(window)
  );

  if (hasTimeActiveWindow) {
    return;
  }

  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
    if (started) {
      await Location.stopLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
    }
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to stop background location updates from task', {
      reason,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const stoppedWindowIds = state.activeLocationWindowIds;
  await updateLocationTrackingState((current) => ({
    ...current,
    activeLocationWindowIds: [],
    locationUpdatesSignature: undefined
  }));

  for (const windowId of stoppedWindowIds) {
    const window = state.windows.find((item) => item.id === windowId);
    if (!window) {
      continue;
    }

    const event = buildBaseEvent(window, 'tracking_stopped', 'system');
    if (event) {
      await postOrQueueLocationEvent(event);
    }
  }

  debugLogger.info('LOCATION', 'Background location updates stopped from task', {
    reason,
    stoppedWindowIds
  });
}

export async function startLocationUpdatesForWindows(
  windows: Array<
    Pick<PersistedTrackingWindow, 'id' | 'pingIntervalSeconds' | 'onSitePingIntervalSeconds'>
  >,
  mode: LocationUpdatesMode = 'travel'
): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android' || windows.length === 0) {
    return;
  }

  // Time-driven streaming: distanceInterval 0 and no automatic pausing so a
  // stationary on-site technician keeps pinging (the server presence engine
  // needs the stream to confirm exits). Note `timeInterval` is Android-only —
  // on iOS the JS throttle in LocationUpdatesTask enforces the cadence.
  const intervalSeconds =
    mode === 'on-site'
      ? Math.min(...windows.map(getOnSitePingIntervalSeconds))
      : Math.max(
          TRAVEL_INTERVAL_MIN_SECONDS,
          Math.min(TRAVEL_INTERVAL_MAX_SECONDS, Math.min(...windows.map(getPingIntervalSeconds)))
        );
  const locationUpdatesSignature = `${mode}:${intervalSeconds}:0`;
  const state = await readLocationTrackingState();
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);

  if (started && state.locationUpdatesSignature === locationUpdatesSignature) {
    return;
  }

  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME, {
    accuracy: mode === 'on-site' ? Location.Accuracy.Balanced : Location.Accuracy.High,
    timeInterval: intervalSeconds * 1000,
    distanceInterval: 0,
    deferredUpdatesInterval: intervalSeconds * 1000,
    deferredUpdatesDistance: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'VHD job travel tracking',
      notificationBody: 'Location updates are active for scheduled job travel.',
      notificationColor: '#22543D'
    }
  });

  await updateLocationTrackingState((current) => ({
    ...current,
    locationUpdatesSignature
  }));

  debugLogger.info('LOCATION', 'Started background location updates', {
    windowIds: windows.map((window) => window.id),
    mode,
    intervalSeconds
  });
}

export async function stopLocationUpdates(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
    if (started) {
      await Location.stopLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
      await updateLocationTrackingState((current) => ({
        ...current,
        locationUpdatesSignature: undefined
      }));
      debugLogger.info('LOCATION', 'Stopped background location updates');
    }
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to stop background location updates', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
