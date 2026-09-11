import * as Location from 'expo-location';
import type { LocationEventPlatform, MobileLocationEvent, ParsedTrackingWindow } from '@/types';
import { debugLogger } from '@/utils/DebugLogger';
import { enqueueLocationEvent } from '@/services/location/LocationEventQueue';
import { serializeLocationCapture } from './LocationOutbox';
import { withTimeout } from '@/services/background/withTimeout';
import {
  readLocationTrackingState,
  recordGeofenceTransition,
  toPersistedWindows,
  updateLocationTrackingState
} from '@/services/location/LocationTrackingState';
import {
  getDepotDistanceMeters,
  normalizeRecordedAt
} from '@/services/location/locationTaskShared';
import { shouldEmitInitialDepotEnter } from '@/services/location/InitialGeofenceStateRules';

export async function emitInitialDepotEnterEvents(args: {
  activeWindows: ParsedTrackingWindow[];
  platform: LocationEventPlatform;
}): Promise<void> {
  return serializeLocationCapture(() => captureInitialDepotEnterEvents(args));
}

async function captureInitialDepotEnterEvents(args: { activeWindows: ParsedTrackingWindow[]; platform: LocationEventPlatform }): Promise<void> {
  if (args.activeWindows.length === 0) {
    return;
  }

  const state = await readLocationTrackingState();

  // Only run the GPS fix for selected windows we have not already checked and
  // that have not already arrived/exited. This avoids a getCurrentPositionAsync
  // call on every coordinator tick; recordGeofenceTransition still guards
  // duplicate events.
  const windowsNeedingCheck = args.activeWindows.filter(
    (window) =>
      !state.initialDepotCheckedWindowIds.includes(window.id) &&
      !state.arrivedWindowIds.includes(window.id) &&
      !state.exitedWindowIds.includes(window.id)
  );

  if (windowsNeedingCheck.length === 0) {
    debugLogger.debug('LOCATION', 'Initial depot check already run for selected windows', {
      windowIds: args.activeWindows.map((window) => window.id)
    });
    return;
  }

  let latestLocation: Location.LocationObject;
  try {
    latestLocation = await withTimeout(Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    }), 4000);
  } catch (error) {
    debugLogger.warn('LOCATION', 'Initial depot state check failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  const persistedWindows = toPersistedWindows(windowsNeedingCheck);
  const recordedAt = normalizeRecordedAt(latestLocation.timestamp || Date.now());
  if (!recordedAt) {
    debugLogger.warn('LOCATION', 'Skipped initial depot enter with stale fix timestamp', {
      fixTimestamp: latestLocation.timestamp
    });
    return;
  }

  for (const window of persistedWindows) {
    const distanceFromDepotMeters = getDepotDistanceMeters(window, latestLocation);
    if (
      !shouldEmitInitialDepotEnter({
        window,
        distanceMeters: distanceFromDepotMeters,
        accuracyMeters: latestLocation.coords.accuracy,
        arrivedWindowIds: state.arrivedWindowIds,
        exitedWindowIds: state.exitedWindowIds
      })
    ) {
      debugLogger.debug('LOCATION', 'Initial depot state outside depot radius', {
        trackingWindowId: window.id,
        scheduleId: window.scheduleId,
        distanceFromDepotMeters,
        depotRadiusMeters: window.depotRadiusMeters
      });
      continue;
    }

    if (state.geofenceTransitions.some(item => item.trackingWindowId === window.id && item.regionType === 'depot' && item.eventType === 'geofence_enter')) {
      debugLogger.debug('LOCATION', 'Suppressed duplicate initial depot enter', {
        trackingWindowId: window.id,
        scheduleId: window.scheduleId
      });
      continue;
    }

    const event: MobileLocationEvent = {
      trackingWindowId: window.id,
      windowDefinitionVersion: window.definitionVersion,
      scheduleId: window.scheduleId,
      eventType: 'geofence_enter',
      regionType: 'depot',
      lat: window.depotLat,
      lng: window.depotLng,
      deviceLat: latestLocation.coords.latitude,
      deviceLng: latestLocation.coords.longitude,
      deviceAccuracyMeters: latestLocation.coords.accuracy != null && latestLocation.coords.accuracy >= 0 ? latestLocation.coords.accuracy : undefined,
      deviceRecordedAt: recordedAt,
      initialState: true,
      accuracyMeters: latestLocation.coords.accuracy ?? undefined,
      recordedAt,
      source: 'geofence',
      platform: args.platform
    };

    await enqueueLocationEvent(event);
    await recordGeofenceTransition({ trackingWindowId: window.id, regionType: 'depot', eventType: 'geofence_enter', recordedAt });
    debugLogger.info('LOCATION', 'Posted initial depot enter state', {
      trackingWindowId: window.id,
      scheduleId: window.scheduleId,
      distanceFromDepotMeters,
      depotRadiusMeters: window.depotRadiusMeters
    });
  }

  const checkedWindowIds = windowsNeedingCheck.map((window) => window.id);
  await updateLocationTrackingState((current) => ({
    ...current,
    initialDepotCheckedWindowIds: [
      ...current.initialDepotCheckedWindowIds,
      ...checkedWindowIds
    ]
  }));
}
