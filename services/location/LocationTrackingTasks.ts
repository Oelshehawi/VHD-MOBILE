import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type {
  LocationEventPlatform,
  MobileLocationEvent,
  ParsedTrackingWindow
} from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { flushLocationEventQueue, postOrQueueLocationEvent } from './LocationEventQueue';
import {
  markWindowArrived,
  readLocationTrackingState,
  updateLocationTrackingState
} from './LocationTrackingState';
import type { PersistedGeofenceRegion, PersistedTrackingWindow } from './LocationTrackingState';
import { getDistanceIntervalMeters, getPingIntervalSeconds } from './trackingWindowUtils';

export const LOCATION_GEOFENCE_TASK_NAME = 'com.braille71.vhdapp.location-geofence';
export const LOCATION_UPDATES_TASK_NAME = 'com.braille71.vhdapp.location-updates';

type GeofenceTaskData = {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
};

type LocationUpdatesTaskData = {
  locations: Location.LocationObject[];
};

function getEventPlatform(): LocationEventPlatform | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }

  return null;
}

function buildBaseEvent(
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

function isPersistedTravelWindowActive(
  window: PersistedTrackingWindow,
  arrivedWindowIds: string[],
  now: Date = new Date()
): boolean {
  const nowMs = now.getTime();
  return (
    !arrivedWindowIds.includes(window.id) &&
    Date.parse(window.startsAtUtc) <= nowMs &&
    nowMs <= Date.parse(window.scheduledStartAtUtc)
  );
}

async function stopLocationUpdatesIfNoActivePersistedWindow(reason: string): Promise<void> {
  const state = await readLocationTrackingState();
  const activeWindows = state.windows.filter((window) =>
    isPersistedTravelWindowActive(window, state.arrivedWindowIds)
  );

  if (activeWindows.length > 0) {
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
    activeLocationWindowIds: []
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

if (!TaskManager.isTaskDefined(LOCATION_GEOFENCE_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error) {
      debugLogger.error('LOCATION', 'Geofence task error', {
        error: error.message
      });
      return;
    }

    const taskData = data as GeofenceTaskData | undefined;
    const region = taskData?.region;
    if (!region?.identifier || taskData?.eventType === undefined) {
      debugLogger.warn('LOCATION', 'Geofence task invoked without region data');
      return;
    }

    const state = await readLocationTrackingState();
    const metadata = state.geofenceRegions.find((item) => item.identifier === region.identifier);
    if (!metadata) {
      debugLogger.warn('LOCATION', 'Geofence task received stale region', {
        identifier: region.identifier
      });
      return;
    }

    const eventType =
      taskData.eventType === Location.GeofencingEventType.Enter
        ? 'geofence_enter'
        : 'geofence_exit';

    const platform = getEventPlatform();
    if (!platform) {
      return;
    }

    const event: MobileLocationEvent = {
      trackingWindowId: metadata.trackingWindowId,
      scheduleId: metadata.scheduleId,
      eventType,
      regionType: metadata.regionType,
      lat: metadata.lat,
      lng: metadata.lng,
      recordedAt: new Date().toISOString(),
      source: 'geofence',
      platform
    };

    await flushLocationEventQueue();
    await postOrQueueLocationEvent(event);

    if (eventType === 'geofence_enter' && metadata.regionType === 'job') {
      await markWindowArrived(metadata.trackingWindowId);
      await stopLocationUpdatesIfNoActivePersistedWindow('job-geofence-enter');
    }
  });
}

if (!TaskManager.isTaskDefined(LOCATION_UPDATES_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_UPDATES_TASK_NAME, async ({ data, error }) => {
    if (error) {
      debugLogger.error('LOCATION', 'Background location update task error', {
        error: error.message
      });
      return;
    }

    const taskData = data as LocationUpdatesTaskData | undefined;
    const latestLocation = taskData?.locations?.at(-1);
    if (!latestLocation) {
      debugLogger.warn('LOCATION', 'Background location update task invoked without locations');
      return;
    }

    const platform = getEventPlatform();
    if (!platform) {
      return;
    }

    const state = await readLocationTrackingState();
    const activeWindows = state.windows.filter((window) =>
      isPersistedTravelWindowActive(window, state.arrivedWindowIds)
    );

    if (activeWindows.length === 0) {
      await stopLocationUpdatesIfNoActivePersistedWindow('no-active-travel-window');
      return;
    }

    await flushLocationEventQueue();

    for (const window of activeWindows) {
      const event: MobileLocationEvent = {
        trackingWindowId: window.id,
        scheduleId: window.scheduleId,
        eventType: 'location_ping',
        lat: latestLocation.coords.latitude,
        lng: latestLocation.coords.longitude,
        accuracyMeters: latestLocation.coords.accuracy ?? undefined,
        speedMetersPerSecond: latestLocation.coords.speed ?? undefined,
        headingDegrees: latestLocation.coords.heading ?? undefined,
        recordedAt: new Date(latestLocation.timestamp).toISOString(),
        source: 'background_location',
        platform
      };

      await postOrQueueLocationEvent(event);
    }
  });
}

export function buildLocationRegionIdentifier(
  windowId: string,
  regionType: PersistedGeofenceRegion['regionType']
): string {
  return `vhd:${windowId}:${regionType}`;
}

export function buildGeofenceRegions(windows: ParsedTrackingWindow[]): {
  regions: Location.LocationRegion[];
  metadata: PersistedGeofenceRegion[];
} {
  const selectedWindows = windows.slice(0, 8);
  const regions: Location.LocationRegion[] = [];
  const metadata: PersistedGeofenceRegion[] = [];

  for (const window of selectedWindows) {
    const targets = [
      { regionType: 'depot' as const, target: window.depotTarget },
      { regionType: 'job' as const, target: window.jobSiteTarget }
    ];

    for (const { regionType, target } of targets) {
      const identifier = buildLocationRegionIdentifier(window.id, regionType);
      regions.push({
        identifier,
        latitude: target.lat,
        longitude: target.lng,
        radius: target.radiusMeters,
        notifyOnEnter: true,
        notifyOnExit: true
      });
      metadata.push({
        identifier,
        trackingWindowId: window.id,
        scheduleId: window.scheduleId,
        regionType,
        lat: target.lat,
        lng: target.lng
      });
    }
  }

  return { regions, metadata };
}

export async function syncGeofences(regions: Location.LocationRegion[]): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }

  if (regions.length === 0) {
    await stopGeofencing();
    return;
  }

  await Location.startGeofencingAsync(LOCATION_GEOFENCE_TASK_NAME, regions);
  debugLogger.info('LOCATION', 'Synced location geofences', {
    regionCount: regions.length
  });
}

export async function stopGeofencing(): Promise<void> {
  try {
    const started = await Location.hasStartedGeofencingAsync(LOCATION_GEOFENCE_TASK_NAME);
    if (started) {
      await Location.stopGeofencingAsync(LOCATION_GEOFENCE_TASK_NAME);
      debugLogger.info('LOCATION', 'Stopped location geofencing');
    }
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to stop location geofencing', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function startLocationUpdatesForWindows(
  windows: ParsedTrackingWindow[]
): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android' || windows.length === 0) {
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
  if (started) {
    return;
  }

  const intervalSeconds = Math.min(...windows.map(getPingIntervalSeconds));
  const distanceMeters = Math.min(...windows.map(getDistanceIntervalMeters));

  await Location.startLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: intervalSeconds * 1000,
    distanceInterval: distanceMeters,
    deferredUpdatesInterval: intervalSeconds * 1000,
    deferredUpdatesDistance: distanceMeters,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'VHD job travel tracking',
      notificationBody: 'Location updates are active for scheduled job travel.',
      notificationColor: '#22543D'
    }
  });

  debugLogger.info('LOCATION', 'Started background location updates', {
    windowIds: windows.map((window) => window.id),
    intervalSeconds,
    distanceMeters
  });
}

export async function stopLocationUpdates(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
    if (started) {
      await Location.stopLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME);
      debugLogger.info('LOCATION', 'Stopped background location updates');
    }
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to stop background location updates', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
