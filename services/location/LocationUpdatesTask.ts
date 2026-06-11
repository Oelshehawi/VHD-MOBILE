import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { MobileLocationEvent } from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { flushLocationEventQueue, postOrQueueLocationEvent } from './LocationEventQueue';
import {
  readLocationTrackingState,
  updateLocationTrackingState
} from './LocationTrackingState';
import {
  LOCATION_UPDATES_TASK_NAME,
  getActivePersistedPingWindows,
  getEventPlatform,
  getPingIntervalSecondsForState,
  isWindowOnSite,
  shouldEmitLocationPing,
  stopLocationUpdatesIfNoActivePersistedWindow
} from './locationTaskShared';

type LocationUpdatesTaskData = {
  locations: Location.LocationObject[];
};

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
    const pingWindows = getActivePersistedPingWindows(state.windows, state.arrivedWindowIds);

    if (pingWindows.length === 0) {
      await stopLocationUpdatesIfNoActivePersistedWindow('no-active-ping-window');
      return;
    }

    // Throttle check first: iOS ignores timeInterval and can invoke this task
    // far more often than the configured cadence, so the cheap early exit
    // keeps those invocations from doing any further work.
    const window = pingWindows[0];
    const onSite = isWindowOnSite(window.id, state.arrivedWindowIds, state.exitedWindowIds);
    const intervalSeconds = getPingIntervalSecondsForState(window, onSite);
    if (
      !shouldEmitLocationPing(
        window,
        state.lastLocationPingAtByWindowId,
        latestLocation.timestamp,
        intervalSeconds
      )
    ) {
      debugLogger.debug('LOCATION', 'Skipped throttled location ping', {
        trackingWindowId: window.id,
        scheduleId: window.scheduleId,
        onSite
      });
      return;
    }

    await flushLocationEventQueue();

    const recordedAt = new Date(latestLocation.timestamp).toISOString();
    const event: MobileLocationEvent = {
      trackingWindowId: window.id,
      scheduleId: window.scheduleId,
      eventType: 'location_ping',
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
    await updateLocationTrackingState((current) => ({
      ...current,
      lastLocationPingAtByWindowId: {
        ...current.lastLocationPingAtByWindowId,
        [window.id]: recordedAt
      }
    }));
  });
}
