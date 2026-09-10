import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type {
  GeofenceTarget,
  MobileLocationEvent,
  ParsedTrackingWindow
} from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { enqueueLocationEvent, flushLocationEventQueue } from './LocationEventQueue';
import { serializeLocationCapture } from './LocationOutbox';
import { getLocationOwner } from './LocationAccount';
import { withTimeout } from '@/services/background/withTimeout';
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
  getActivePersistedPingWindows,
  getEventPlatform,
  isWindowOnSite,
  isPersistedWindowPingActive,
  startLocationUpdatesForWindows
} from './locationTaskShared';

type GeofenceTaskData = {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
};

// iOS allows roughly 20 monitored regions. Eight windows gives us up to
// sixteen regions (selected depot+job, plus job regions) with room for system
// overhead and future app-owned geofences.
const MAX_GEOFENCE_WINDOWS = 8;
// Hard ceiling across tracking + wake regions, leaving headroom under the
// ~20-region iOS budget.
const MAX_TOTAL_GEOFENCE_REGIONS = 18;

// iOS reports the device's current state for a newly registered region, so a
// re-registration while the tech is parked on site surfaces as a fresh
// geofence_enter stamped "now" — which is departure time, not arrival. Enters
// this close to registration are still reported (they are real presence
// evidence) but flagged so the server refuses to confirm an arrival on them
// alone.
export const GEOFENCE_REGISTRATION_INITIAL_STATE_WINDOW_MS = 90 * 1000;

// True when an enter fired close enough to the last region registration that
// it is more likely the OS reporting "you are already inside" than a crossing.
export function isInitialStateGeofenceEnter(args: {
  eventType: 'geofence_enter' | 'geofence_exit';
  geofenceRegionsRegisteredAt: string | undefined;
  nowMs: number;
}): boolean {
  if (args.eventType !== 'geofence_enter' || !args.geofenceRegionsRegisteredAt) {
    return false;
  }

  const registeredAtMs = Date.parse(args.geofenceRegionsRegisteredAt);
  if (!Number.isFinite(registeredAtMs)) {
    return false;
  }

  const sinceRegistrationMs = args.nowMs - registeredAtMs;
  return (
    sinceRegistrationMs >= 0 &&
    sinceRegistrationMs <= GEOFENCE_REGISTRATION_INITIAL_STATE_WINDOW_MS
  );
}

// Standing depot wake region: stays registered after a shift winds down so
// iOS region monitoring can relaunch a force-quit app the next time the
// technician passes the depot. Belongs to no tracking window.
export const STANDING_DEPOT_REGION_IDENTIFIER = 'vhd:standing:depot';

export interface WakeGeofenceOptions {
  // Upcoming (next business day) windows whose job sites should wake the app
  // before any tracking window is live — covers techs who never pass depot.
  upcomingWindows?: ParsedTrackingWindow[];
  standingDepotTarget?: GeofenceTarget | null;
}

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
  activeDepotWindowIds: ReadonlySet<string>,
  wakeOptions?: WakeGeofenceOptions
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
        lng: target.lng,
        radiusMeters: target.radiusMeters
      });
    }
  }

  const standingDepotTarget = wakeOptions?.standingDepotTarget;
  if (standingDepotTarget && regions.length < MAX_TOTAL_GEOFENCE_REGIONS) {
    regions.push({
      identifier: STANDING_DEPOT_REGION_IDENTIFIER,
      latitude: standingDepotTarget.lat,
      longitude: standingDepotTarget.lng,
      radius: standingDepotTarget.radiusMeters,
      notifyOnEnter: true,
      notifyOnExit: true
    });
    metadata.push({
      identifier: STANDING_DEPOT_REGION_IDENTIFIER,
      trackingWindowId: '',
      scheduleId: '',
      regionType: 'depot',
      lat: standingDepotTarget.lat,
      lng: standingDepotTarget.lng,
      radiusMeters: standingDepotTarget.radiusMeters,
      purpose: 'wake'
    });
  }

  const coveredWindowIds = new Set(selectedWindows.map((window) => window.id));
  for (const window of wakeOptions?.upcomingWindows ?? []) {
    if (regions.length >= MAX_TOTAL_GEOFENCE_REGIONS) {
      break;
    }
    if (coveredWindowIds.has(window.id)) {
      continue;
    }
    coveredWindowIds.add(window.id);

    const identifier = buildLocationRegionIdentifier(window.id, 'job');
    regions.push({
      identifier,
      latitude: window.jobSiteTarget.lat,
      longitude: window.jobSiteTarget.lng,
      radius: window.jobSiteTarget.radiusMeters,
      notifyOnEnter: true,
      notifyOnExit: true
    });
    metadata.push({
      identifier,
      trackingWindowId: window.id,
      scheduleId: window.scheduleId,
      regionType: 'job',
      lat: window.jobSiteTarget.lat,
      lng: window.jobSiteTarget.lng,
      radiusMeters: window.jobSiteTarget.radiusMeters,
      purpose: 'wake'
    });
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
    geofenceSignature,
    geofenceRegionsRegisteredAt: new Date().toISOString()
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
  trackingWindowId: string
): Promise<void> {
  if (regionType !== 'job') {
    return;
  }
  // Arrived/exited only switches the ping cadence; pinging continues for the
  // whole window so the server presence engine can confirm real transitions.
  if (eventType === 'geofence_enter') {
    await markWindowArrived(trackingWindowId);
  } else {
    await markWindowExited(trackingWindowId);
  }
}

// iOS relaunches a force-quit app headless for registered geofence regions;
// timed pings died with the process, so restart them from persisted state.
// Also applies the cadence switch (travel <-> on-site) right at the geofence
// boundary instead of waiting for the next coordinator run.
async function ensureLocationUpdatesRunning(reason: string): Promise<void> {
  try {
    const state = await readLocationTrackingState();
    const pingWindows = getActivePersistedPingWindows(state.windows, state.arrivedWindowIds);
    const window = pingWindows[0];
    if (!window) {
      return;
    }

    const onSite = isWindowOnSite(window.id, state.arrivedWindowIds, state.exitedWindowIds);
    await startLocationUpdatesForWindows(pingWindows, onSite ? 'on-site' : 'travel');
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to ensure location updates from geofence task', {
      reason,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function getDeviceCoords(): Promise<{
  deviceLat: number;
  deviceLng: number;
  deviceAccuracyMeters?: number;
  deviceRecordedAt: string;
} | null> {
  try {
    const lastKnown = await withTimeout(Location.getLastKnownPositionAsync({ maxAge: 60_000 }), 2000);
    if (!lastKnown) {
      return null;
    }

    return {
      deviceLat: lastKnown.coords.latitude,
      deviceLng: lastKnown.coords.longitude,
      deviceAccuracyMeters: lastKnown.coords.accuracy != null && lastKnown.coords.accuracy >= 0 ? lastKnown.coords.accuracy : undefined,
      deviceRecordedAt: new Date(lastKnown.timestamp).toISOString()
    };
  } catch {
    return null;
  }
}

// Exported for tests: the body of the OS geofence task.
export async function processGeofenceEvent(taskData: GeofenceTaskData | undefined): Promise<void> {
  const recordedAtMs = Date.now();
  const wake = await serializeLocationCapture(() => captureGeofenceEvent(taskData, recordedAtMs));
  if (wake) {
    const { refreshLocationTracking } = require('./LocationTrackingRefreshRunner') as typeof import('./LocationTrackingRefreshRunner');
    await refreshLocationTracking('geofence-wake');
  } else {
    await flushLocationEventQueue();
    const { reportTrackingHealth } = require('./TrackingHealth') as typeof import('./TrackingHealth');
    await reportTrackingHealth();
  }
}

async function captureGeofenceEvent(taskData: GeofenceTaskData | undefined, recordedAtMs: number): Promise<boolean> {
const region = taskData?.region;
if (!region?.identifier || taskData?.eventType === undefined) {
  debugLogger.warn('LOCATION', 'Geofence task invoked without region data');
  return false;
}

  const state = await readLocationTrackingState();
  const owner = await getLocationOwner();
  if (!owner || (state.ownerAppUserId && state.ownerAppUserId !== owner.appUserId)) return false;
  const metadata = state.geofenceRegions.find((item) => item.identifier === region.identifier);
  if (!metadata) {
    debugLogger.warn('LOCATION', 'Geofence task received stale region', {
      identifier: region.identifier
    });
    return false;
  }

  const eventType =
    taskData.eventType === Location.GeofencingEventType.Enter
      ? 'geofence_enter'
      : 'geofence_exit';

  const window = state.windows.find(item => item.id === metadata.trackingWindowId);
  // A job wake crossing is real evidence once its saved work window is active.
  // Outside that range (including the standing depot), no coordinates are sent.
  if (!window || state.closedScheduleIds.includes(window.scheduleId) || !isPersistedWindowPingActive(window, new Date(recordedAtMs))) return true;

  const platform = getEventPlatform();
  if (!platform) {
    return false;
  }

  const recordedAt = new Date(recordedAtMs).toISOString();
  const initialState = isInitialStateGeofenceEnter({
    eventType,
    geofenceRegionsRegisteredAt: state.geofenceRegionsRegisteredAt,
    nowMs: recordedAtMs
  });
  if (state.geofenceTransitions.some(item => item.trackingWindowId === metadata.trackingWindowId && item.regionType === metadata.regionType && item.eventType === eventType)) {
    debugLogger.info('LOCATION', 'Suppressed duplicate geofence transition', {
      trackingWindowId: metadata.trackingWindowId,
      scheduleId: metadata.scheduleId,
      regionType: metadata.regionType,
      eventType
    });
    await handleJobGeofenceSideEffects(eventType, metadata.regionType, metadata.trackingWindowId);
    await ensureLocationUpdatesRunning(`duplicate-${eventType}`);
    return metadata.purpose === 'wake';
  }

  // lat/lng stay the region center for backward compatibility; the actual
  // device fix rides along so the server can map and feed its presence
  // engine real coordinates.
  const deviceCoords = await getDeviceCoords();
  const event: MobileLocationEvent = {
    trackingWindowId: metadata.trackingWindowId,
    windowDefinitionVersion: window.definitionVersion,
    scheduleId: metadata.scheduleId,
    eventType,
    regionType: metadata.regionType,
    lat: metadata.lat,
    lng: metadata.lng,
    ...(deviceCoords ?? {}),
    recordedAt,
    source: 'geofence',
    platform,
    ...(initialState ? { initialState: true } : {})
  };

  await enqueueLocationEvent(event);
  await recordGeofenceTransition({ trackingWindowId: metadata.trackingWindowId, regionType: metadata.regionType, eventType, recordedAt });
  await handleJobGeofenceSideEffects(eventType, metadata.regionType, metadata.trackingWindowId);
  await ensureLocationUpdatesRunning(eventType);
  return metadata.purpose === 'wake';
}

if (!TaskManager.isTaskDefined(LOCATION_GEOFENCE_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error) {
      debugLogger.error('LOCATION', 'Geofence task error', {
        error: error.message
      });
      return;
    }

    await processGeofenceEvent(data as GeofenceTaskData | undefined);
  });
}
