import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type {
  LocationEventPlatform,
  MobileLocationEvent,
  ParsedTrackingWindow
} from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { postOrQueueLocationEvent } from './LocationEventQueue';
import {
  readLocationTrackingState,
  updateLocationTrackingState
} from './LocationTrackingState';
import type { PersistedTrackingWindow } from './LocationTrackingState';
import { getDistanceIntervalMeters, getPingIntervalSeconds } from './trackingWindowUtils';
import { selectActiveTravelWindow } from './fieldStatusWindowSelection';

export const LOCATION_GEOFENCE_TASK_NAME = 'com.braille71.vhdapp.location-geofence';
export const LOCATION_UPDATES_TASK_NAME = 'com.braille71.vhdapp.location-updates';

export const ARRIVAL_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
export const ARRIVAL_HEARTBEAT_CONFIRM_MS = 90 * 1000;
export const ARRIVAL_HEARTBEAT_ACCURACY_BUFFER_CAP_METERS = 100;
export const ARRIVAL_HEARTBEAT_INTERVAL_SECONDS = ARRIVAL_HEARTBEAT_INTERVAL_MS / 1000;
export const ARRIVAL_HEARTBEAT_DISTANCE_METERS = 750;

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

export function isPersistedTravelWindowActive(
  window: PersistedTrackingWindow,
  arrivedWindowIds: string[],
  exitedWindowIds: string[] = [],
  now: Date = new Date()
): boolean {
  const nowMs = now.getTime();
  return (
    !arrivedWindowIds.includes(window.id) &&
    !exitedWindowIds.includes(window.id) &&
    Date.parse(window.startsAtUtc) <= nowMs &&
    nowMs <= Date.parse(window.endsAtUtc)
  );
}

// Mirrors LocationTrackingCoordinator's selected-travel-window rule so the
// background task and the coordinator agree on the single active window.
export function getActivePersistedTravelWindows(
  windows: PersistedTrackingWindow[],
  arrivedWindowIds: string[],
  exitedWindowIds: string[]
): PersistedTrackingWindow[] {
  const selected = selectActiveTravelWindow(windows, arrivedWindowIds, exitedWindowIds);
  return selected ? [selected] : [];
}

export function isPersistedArrivalHeartbeatWindowActive(
  window: PersistedTrackingWindow,
  arrivedWindowIds: string[],
  exitedWindowIds: string[],
  now: Date = new Date()
): boolean {
  const nowMs = now.getTime();
  return (
    arrivedWindowIds.includes(window.id) &&
    !exitedWindowIds.includes(window.id) &&
    Date.parse(window.startsAtUtc) <= nowMs &&
    nowMs <= Date.parse(window.endsAtUtc)
  );
}

export function getActiveArrivalHeartbeatWindows(
  windows: PersistedTrackingWindow[],
  arrivedWindowIds: string[],
  exitedWindowIds: string[]
): PersistedTrackingWindow[] {
  return windows.filter((window) =>
    isPersistedArrivalHeartbeatWindowActive(window, arrivedWindowIds, exitedWindowIds)
  );
}

export function shouldEmitLocationPing(
  window: PersistedTrackingWindow,
  lastLocationPingAtByWindowId: Record<string, string>,
  recordedAtMs: number
): boolean {
  const lastPingAt = lastLocationPingAtByWindowId[window.id];
  if (!lastPingAt) {
    return true;
  }

  const lastPingAtMs = Date.parse(lastPingAt);
  if (Number.isNaN(lastPingAtMs)) {
    return true;
  }

  return recordedAtMs - lastPingAtMs >= getPingIntervalSeconds(window) * 1000;
}

export function shouldRunArrivalHeartbeat(
  window: PersistedTrackingWindow,
  lastArrivalHeartbeatAtByWindowId: Record<string, string>,
  recordedAtMs: number
): boolean {
  const lastHeartbeatAt = lastArrivalHeartbeatAtByWindowId[window.id];
  if (!lastHeartbeatAt) {
    return true;
  }

  const lastHeartbeatAtMs = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(lastHeartbeatAtMs)) {
    return true;
  }

  return recordedAtMs - lastHeartbeatAtMs >= ARRIVAL_HEARTBEAT_INTERVAL_MS;
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
      ? Math.min(accuracyMeters, ARRIVAL_HEARTBEAT_ACCURACY_BUFFER_CAP_METERS)
      : 0;

  return distanceMetersValue <= radiusMeters + accuracyBuffer;
}

export async function stopLocationUpdatesIfNoActivePersistedWindow(reason: string): Promise<void> {
  const state = await readLocationTrackingState();
  const activeWindows = getActivePersistedTravelWindows(
    state.windows,
    state.arrivedWindowIds,
    state.exitedWindowIds
  );
  const heartbeatWindows = getActiveArrivalHeartbeatWindows(
    state.windows,
    state.arrivedWindowIds,
    state.exitedWindowIds
  );

  if (activeWindows.length > 0 || heartbeatWindows.length > 0) {
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
    arrivalHeartbeatWindowIds: [],
    lastArrivalHeartbeatAtByWindowId: {},
    pendingOutsideJobCheckByWindowId: {},
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
  windows: ParsedTrackingWindow[],
  mode: 'travel' | 'arrival-heartbeat' = 'travel'
): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android' || windows.length === 0) {
    return;
  }

  const intervalSeconds =
    mode === 'arrival-heartbeat'
      ? ARRIVAL_HEARTBEAT_INTERVAL_SECONDS
      : Math.min(...windows.map(getPingIntervalSeconds));
  const distanceMetersValue =
    mode === 'arrival-heartbeat'
      ? ARRIVAL_HEARTBEAT_DISTANCE_METERS
      : Math.min(...windows.map(getDistanceIntervalMeters));
  const locationUpdatesSignature = `${mode}:${intervalSeconds}:${distanceMetersValue}`;
  const state = await readLocationTrackingState();
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);

  if (started && state.locationUpdatesSignature === locationUpdatesSignature) {
    return;
  }

  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: intervalSeconds * 1000,
    distanceInterval: distanceMetersValue,
    deferredUpdatesInterval: intervalSeconds * 1000,
    deferredUpdatesDistance: distanceMetersValue,
    pausesUpdatesAutomatically: true,
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
    intervalSeconds,
    distanceMeters: distanceMetersValue
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
