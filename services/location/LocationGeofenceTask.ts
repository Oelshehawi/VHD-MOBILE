import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { MobileLocationEvent, ParsedTrackingWindow } from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { flushLocationEventQueue, postOrQueueLocationEvent } from './LocationEventQueue';
import {
  markWindowArrived,
  markWindowExited,
  readLocationTrackingState,
  recordGeofenceTransition,
  updateLocationTrackingState
} from './LocationTrackingState';
import type { PersistedGeofenceRegion } from './LocationTrackingState';
import {
  LOCATION_GEOFENCE_TASK_NAME,
  getEventPlatform,
  stopLocationUpdatesIfNoActivePersistedWindow
} from './locationTaskShared';

type GeofenceTaskData = {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
};

// iOS allows roughly 20 monitored regions. Eight windows gives us up to
// sixteen regions (selected depot+job, plus job regions) with room for system
// overhead and future app-owned geofences.
const MAX_GEOFENCE_WINDOWS = 8;

export function buildLocationRegionIdentifier(
  windowId: string,
  regionType: PersistedGeofenceRegion['regionType']
): string {
  return `vhd:${windowId}:${regionType}`;
}

function selectGeofenceWindows(
  windows: ParsedTrackingWindow[],
  activeDepotWindowIds: ReadonlySet<string>
): ParsedTrackingWindow[] {
  const activeDepotWindows = windows.filter((window) => activeDepotWindowIds.has(window.id));
  const otherWindows = windows.filter((window) => !activeDepotWindowIds.has(window.id));
  return [...activeDepotWindows, ...otherWindows].slice(0, MAX_GEOFENCE_WINDOWS);
}

export function buildGeofenceRegions(
  windows: ParsedTrackingWindow[],
  activeDepotWindowIds: ReadonlySet<string>
): {
  regions: Location.LocationRegion[];
  metadata: PersistedGeofenceRegion[];
} {
  const selectedWindows = selectGeofenceWindows(windows, activeDepotWindowIds);
  const regions: Location.LocationRegion[] = [];
  const metadata: PersistedGeofenceRegion[] = [];

  for (const window of selectedWindows) {
    const targets: { regionType: 'depot' | 'job'; target: ParsedTrackingWindow['depotTarget'] }[] = [
      { regionType: 'job', target: window.jobSiteTarget }
    ];
    if (activeDepotWindowIds.has(window.id)) {
      targets.unshift({ regionType: 'depot', target: window.depotTarget });
    }

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

function formatGeofenceCoordinate(value: number | undefined): string {
  return Number.isFinite(value) ? Number(value).toFixed(6) : '';
}

function formatGeofenceRadius(value: number | undefined): string {
  return Number.isFinite(value) ? String(Math.round(Number(value))) : '';
}

export function buildGeofenceSignature(regions: Location.LocationRegion[]): string {
  return regions
    .map((region) => [
      region.identifier ?? '',
      formatGeofenceCoordinate(region.latitude),
      formatGeofenceCoordinate(region.longitude),
      formatGeofenceRadius(region.radius),
      region.notifyOnEnter === false ? '0' : '1',
      region.notifyOnExit === false ? '0' : '1'
    ].join(':'))
    .sort()
    .join('|');
}

export async function syncGeofences(regions: Location.LocationRegion[]): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }

  if (regions.length === 0) {
    await stopGeofencing();
    await updateLocationTrackingState((state) => ({
      ...state,
      geofenceSignature: undefined
    }));
    return;
  }

  const geofenceSignature = buildGeofenceSignature(regions);
  const state = await readLocationTrackingState();
  const started = await Location.hasStartedGeofencingAsync(LOCATION_GEOFENCE_TASK_NAME);
  if (started && state.geofenceSignature === geofenceSignature) {
    debugLogger.debug('LOCATION', 'Skipped unchanged location geofence registration', {
      regionCount: regions.length
    });
    return;
  }

  await Location.startGeofencingAsync(LOCATION_GEOFENCE_TASK_NAME, regions);
  await updateLocationTrackingState((current) => ({
    ...current,
    geofenceSignature
  }));

  debugLogger.info('LOCATION', 'Synced location geofences', {
    regionCount: regions.length,
    changed: state.geofenceSignature !== geofenceSignature
  });
}

function isBackgroundLocationAuthorizationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Not authorized to use background location services');
}

export async function stopGeofencing(): Promise<void> {
  try {
    const started = await Location.hasStartedGeofencingAsync(LOCATION_GEOFENCE_TASK_NAME);
    if (started) {
      await Location.stopGeofencingAsync(LOCATION_GEOFENCE_TASK_NAME);
      debugLogger.info('LOCATION', 'Stopped location geofencing');
    }
  } catch (error) {
    const log = isBackgroundLocationAuthorizationError(error)
      ? debugLogger.debug.bind(debugLogger)
      : debugLogger.warn.bind(debugLogger);
    log('LOCATION', 'Failed to stop location geofencing', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleJobGeofenceSideEffects(
  eventType: 'geofence_enter' | 'geofence_exit',
  regionType: 'depot' | 'job',
  trackingWindowId: string,
  duplicate: boolean
): Promise<void> {
  if (regionType !== 'job') {
    return;
  }
  const reasonSuffix = duplicate ? 'duplicate-' : '';
  if (eventType === 'geofence_enter') {
    await markWindowArrived(trackingWindowId);
    await stopLocationUpdatesIfNoActivePersistedWindow(`${reasonSuffix}job-geofence-enter`);
  } else {
    await markWindowExited(trackingWindowId);
    await stopLocationUpdatesIfNoActivePersistedWindow(`${reasonSuffix}job-geofence-exit`);
  }
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

    const recordedAt = new Date().toISOString();
    const transition = await recordGeofenceTransition({
      trackingWindowId: metadata.trackingWindowId,
      regionType: metadata.regionType,
      eventType,
      recordedAt
    });

    if (!transition.shouldEmit) {
      debugLogger.info('LOCATION', 'Suppressed duplicate geofence transition', {
        trackingWindowId: metadata.trackingWindowId,
        scheduleId: metadata.scheduleId,
        regionType: metadata.regionType,
        eventType
      });
      await handleJobGeofenceSideEffects(eventType, metadata.regionType, metadata.trackingWindowId, true);
      return;
    }

    const event: MobileLocationEvent = {
      trackingWindowId: metadata.trackingWindowId,
      scheduleId: metadata.scheduleId,
      eventType,
      regionType: metadata.regionType,
      lat: metadata.lat,
      lng: metadata.lng,
      recordedAt,
      source: 'geofence',
      platform
    };

    await flushLocationEventQueue();
    await postOrQueueLocationEvent(event);
    await handleJobGeofenceSideEffects(eventType, metadata.regionType, metadata.trackingWindowId, false);
  });
}
