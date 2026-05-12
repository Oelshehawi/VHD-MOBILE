import * as Location from 'expo-location';
import type { LocationEventPlatform, MobileLocationEvent } from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { postOrQueueLocationEvent } from './LocationEventQueue';
import {
  markWindowExited,
  recordGeofenceTransition,
  updateLocationTrackingState
} from './LocationTrackingState';
import type { PersistedTrackingWindow } from './LocationTrackingState';
import {
  ARRIVAL_HEARTBEAT_ACCURACY_BUFFER_CAP_METERS,
  ARRIVAL_HEARTBEAT_CONFIRM_MS,
  getJobSiteDistanceMeters,
  stopLocationUpdatesIfNoActivePersistedWindow
} from './locationTaskShared';

export async function evaluateArrivalHeartbeatExit(
  window: PersistedTrackingWindow,
  latestLocation: Location.LocationObject,
  recordedAt: string,
  platform: LocationEventPlatform
): Promise<void> {
  const distanceFromJobMeters = getJobSiteDistanceMeters(window, latestLocation);
  if (distanceFromJobMeters === null || typeof window.jobSiteRadiusMeters !== 'number') {
    debugLogger.warn('LOCATION', 'Skipped arrival heartbeat without job coordinates', {
      trackingWindowId: window.id,
      scheduleId: window.scheduleId
    });
    return;
  }

  const accuracyMeters =
    typeof latestLocation.coords.accuracy === 'number' && latestLocation.coords.accuracy > 0
      ? latestLocation.coords.accuracy
      : 0;
  const accuracyBuffer = Math.min(accuracyMeters, ARRIVAL_HEARTBEAT_ACCURACY_BUFFER_CAP_METERS);
  const outsideByMeters = distanceFromJobMeters - (window.jobSiteRadiusMeters + accuracyBuffer);
  const isOutside = outsideByMeters > 0;

  const updated = await updateLocationTrackingState((current) => ({
    ...current,
    lastArrivalHeartbeatAtByWindowId: {
      ...current.lastArrivalHeartbeatAtByWindowId,
      [window.id]: recordedAt
    },
    pendingOutsideJobCheckByWindowId: isOutside
      ? {
          ...current.pendingOutsideJobCheckByWindowId,
          [window.id]: current.pendingOutsideJobCheckByWindowId[window.id] ?? recordedAt
        }
      : Object.fromEntries(
          Object.entries(current.pendingOutsideJobCheckByWindowId).filter(([id]) => id !== window.id)
        )
  }));

  if (!isOutside) {
    debugLogger.debug('LOCATION', 'Arrival heartbeat still inside job radius', {
      trackingWindowId: window.id,
      scheduleId: window.scheduleId,
      distanceFromJobMeters,
      jobSiteRadiusMeters: window.jobSiteRadiusMeters
    });
    return;
  }

  const pendingOutsideAt = updated.pendingOutsideJobCheckByWindowId[window.id];
  const pendingOutsideAgeMs = pendingOutsideAt
    ? Date.parse(recordedAt) - Date.parse(pendingOutsideAt)
    : 0;
  const confirmedOutside =
    Number.isFinite(pendingOutsideAgeMs) && pendingOutsideAgeMs >= ARRIVAL_HEARTBEAT_CONFIRM_MS;

  debugLogger.info('LOCATION', 'Arrival heartbeat outside job radius', {
    trackingWindowId: window.id,
    scheduleId: window.scheduleId,
    distanceFromJobMeters,
    jobSiteRadiusMeters: window.jobSiteRadiusMeters,
    outsideByMeters,
    accuracyMeters,
    pendingOutsideAgeMs,
    confirmedOutside
  });

  if (!confirmedOutside) {
    return;
  }

  const transition = await recordGeofenceTransition({
    trackingWindowId: window.id,
    regionType: 'job',
    eventType: 'geofence_exit',
    recordedAt
  });

  if (!transition.shouldEmit) {
    await markWindowExited(window.id);
    await stopLocationUpdatesIfNoActivePersistedWindow('duplicate-arrival-heartbeat-job-exit');
    return;
  }

  const event: MobileLocationEvent = {
    trackingWindowId: window.id,
    scheduleId: window.scheduleId,
    eventType: 'geofence_exit',
    regionType: 'job',
    lat: latestLocation.coords.latitude,
    lng: latestLocation.coords.longitude,
    accuracyMeters: latestLocation.coords.accuracy ?? undefined,
    speedMetersPerSecond: latestLocation.coords.speed ?? undefined,
    headingDegrees: latestLocation.coords.heading ?? undefined,
    recordedAt,
    source: 'background_location',
    platform
  };

  await postOrQueueLocationEvent(event);
  await markWindowExited(window.id);
  await stopLocationUpdatesIfNoActivePersistedWindow('arrival-heartbeat-job-exit');
}
