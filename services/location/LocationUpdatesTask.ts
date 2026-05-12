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
  getActiveArrivalHeartbeatWindows,
  getActivePersistedTravelWindows,
  getEventPlatform,
  shouldEmitLocationPing,
  shouldRunArrivalHeartbeat,
  stopLocationUpdatesIfNoActivePersistedWindow
} from './locationTaskShared';
import { evaluateArrivalHeartbeatExit } from './arrivalHeartbeat';

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

    if (activeWindows.length === 0 && heartbeatWindows.length === 0) {
      await stopLocationUpdatesIfNoActivePersistedWindow('no-active-travel-window');
      return;
    }

    await flushLocationEventQueue();

    for (const window of activeWindows) {
      const recordedAt = new Date(latestLocation.timestamp).toISOString();
      if (
        !shouldEmitLocationPing(
          window,
          state.lastLocationPingAtByWindowId,
          latestLocation.timestamp
        )
      ) {
        debugLogger.debug('LOCATION', 'Skipped throttled location ping', {
          trackingWindowId: window.id,
          scheduleId: window.scheduleId
        });
        continue;
      }

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
    }

    for (const window of heartbeatWindows) {
      const recordedAt = new Date(latestLocation.timestamp).toISOString();
      if (
        !shouldRunArrivalHeartbeat(
          window,
          state.lastArrivalHeartbeatAtByWindowId,
          latestLocation.timestamp
        )
      ) {
        continue;
      }

      await evaluateArrivalHeartbeatExit(window, latestLocation, recordedAt, platform);
    }
  });
}
