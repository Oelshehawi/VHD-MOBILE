import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { MobileLocationEvent } from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { flushLocationEventQueue, postOrQueueLocationEvents } from './LocationEventQueue';
import {
  readLocationTrackingState,
  updateLocationTrackingState
} from './LocationTrackingState';
import type { PersistedTrackingWindow } from './LocationTrackingState';
import {
  LOCATION_UPDATES_TASK_NAME,
  MAX_TRAIL_RECORDED_AT_STALENESS_MS,
  getActivePersistedPresenceWindows,
  getActivePersistedPingWindows,
  getEventPlatform,
  getPingIntervalSecondsForState,
  hasFiniteFixCoords,
  isWindowOnSite,
  normalizeLocationHeading,
  normalizeRecordedAt,
  shouldEmitLocationPing,
  stopLocationUpdatesIfNoActivePersistedWindow
} from './locationTaskShared';

export type LocationUpdatesTaskData = {
  locations: Location.LocationObject[];
};

// A single OS invocation can hand over a long buffered trail (iOS delivers
// everything it collected while the app was suspended). Bound how many
// reconstructed pings one invocation posts so a pathological batch cannot
// storm the API; the newest fixes are the ones kept.
export const MAX_RECONSTRUCTED_PINGS_PER_INVOCATION = 60;

type ReconstructedPing = {
  location: Location.LocationObject;
  recordedAt: string;
  windows: PersistedTrackingWindow[];
};

/**
 * Selects, from one buffered fix, the live windows that are due for a ping at
 * that fix's own timestamp. Mirrors the single-fix rule: when any overlapping
 * window is due, the selected window rides along so its event stays the
 * technician's latest dashboard context.
 */
function selectDueWindows(args: {
  presenceWindows: PersistedTrackingWindow[];
  selectedWindow: PersistedTrackingWindow;
  arrivedWindowIds: string[];
  exitedWindowIds: string[];
  lastLocationPingAtByWindowId: Record<string, string>;
  recordedAtMs: number;
}): PersistedTrackingWindow[] {
  const due = args.presenceWindows.filter((window) => {
    const onSite = isWindowOnSite(
      window.id,
      args.arrivedWindowIds,
      args.exitedWindowIds
    );
    return shouldEmitLocationPing(
      window,
      args.lastLocationPingAtByWindowId,
      args.recordedAtMs,
      getPingIntervalSecondsForState(window, onSite)
    );
  });

  if (due.length === 0) {
    return due;
  }

  return due.some((window) => window.id === args.selectedWindow.id)
    ? due
    : [...due, args.selectedWindow];
}

/**
 * Body of the OS background location task. Exported for tests.
 *
 * Walks the entire delivered batch in ascending timestamp order rather than
 * taking only the newest fix: after a suspension the OS hands back the trail it
 * buffered while the app was asleep, and those samples are what let the server
 * presence engine back-date the true arrival. Each fix runs the normal
 * per-window throttle against its *own* timestamp, so a dense trail is
 * downsampled back to the configured cadence instead of being discarded.
 */
export async function processLocationUpdate(
  taskData: LocationUpdatesTaskData | undefined
): Promise<void> {
  const locations = (taskData?.locations ?? [])
    .filter((location): location is Location.LocationObject => Boolean(location?.coords))
    // The presence engine drops out-of-order samples (presence.job.lastSampleAt),
    // so ordering here is what makes a backfilled trail usable at all.
    .sort((left, right) => left.timestamp - right.timestamp);

  if (locations.length === 0) {
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

  const selectedWindow = pingWindows[0];
  const presenceWindows = getActivePersistedPresenceWindows(state.windows, selectedWindow.id);

  const now = Date.now();
  // Carried forward in memory across the walk so the batch downsamples against
  // its own emissions; persisted once at the end via the serialized writer.
  const lastLocationPingAtByWindowId = { ...state.lastLocationPingAtByWindowId };
  const pings: ReconstructedPing[] = [];
  let skippedNonFiniteCoords = 0;
  let skippedStaleFix = 0;
  let throttled = 0;

  for (const location of locations) {
    // Guard the two backend 400 conditions before queueing a doomed ping. On
    // skip we deliberately do NOT advance lastLocationPingAtByWindowId so the
    // next usable fix is not throttled away.
    if (!hasFiniteFixCoords(location)) {
      skippedNonFiniteCoords += 1;
      continue;
    }

    const recordedAt = normalizeRecordedAt(
      location.timestamp,
      now,
      MAX_TRAIL_RECORDED_AT_STALENESS_MS
    );
    if (!recordedAt) {
      skippedStaleFix += 1;
      continue;
    }

    const recordedAtMs = Date.parse(recordedAt);
    const dueWindows = selectDueWindows({
      presenceWindows,
      selectedWindow,
      arrivedWindowIds: state.arrivedWindowIds,
      exitedWindowIds: state.exitedWindowIds,
      lastLocationPingAtByWindowId,
      recordedAtMs
    });

    if (dueWindows.length === 0) {
      throttled += 1;
      continue;
    }

    for (const window of dueWindows) {
      lastLocationPingAtByWindowId[window.id] = recordedAt;
    }
    pings.push({ location, recordedAt, windows: dueWindows });
  }

  if (pings.length === 0) {
    debugLogger.debug('LOCATION', 'Skipped location batch with no emittable fix', {
      trackingWindowId: selectedWindow.id,
      scheduleId: selectedWindow.scheduleId,
      batchSize: locations.length,
      throttled,
      skippedNonFiniteCoords,
      skippedStaleFix
    });
    return;
  }

  // Over the cap, keep the newest pings: current position matters more than the
  // oldest tail of an unusually long trail.
  const droppedOverCap = Math.max(0, pings.length - MAX_RECONSTRUCTED_PINGS_PER_INVOCATION);
  const retained = droppedOverCap > 0 ? pings.slice(droppedOverCap) : pings;

  await flushLocationEventQueue();

  const events: MobileLocationEvent[] = retained.flatMap((ping) =>
    ping.windows.map((window) => ({
      trackingWindowId: window.id,
      scheduleId: window.scheduleId,
      eventType: 'location_ping' as const,
      lat: ping.location.coords.latitude,
      lng: ping.location.coords.longitude,
      accuracyMeters: ping.location.coords.accuracy ?? undefined,
      speedMetersPerSecond: ping.location.coords.speed ?? undefined,
      headingDegrees: normalizeLocationHeading(ping.location.coords.heading),
      recordedAt: ping.recordedAt,
      source: 'background_location' as const,
      platform
    }))
  );

  // One request for the whole reconstructed trail: a backfill flush over a weak
  // connection is exactly where serial round trips lose events.
  await postOrQueueLocationEvents(events);

  // Only the pings we actually posted may advance the throttle marker.
  const persistedLastPingAt: Record<string, string> = {};
  for (const ping of retained) {
    for (const window of ping.windows) {
      persistedLastPingAt[window.id] = ping.recordedAt;
    }
  }

  await updateLocationTrackingState((current) => ({
    ...current,
    lastLocationPingAtByWindowId: {
      ...current.lastLocationPingAtByWindowId,
      ...persistedLastPingAt
    }
  }));

  if (locations.length > 1) {
    debugLogger.info('LOCATION', 'Processed buffered location batch', {
      trackingWindowId: selectedWindow.id,
      scheduleId: selectedWindow.scheduleId,
      batchSize: locations.length,
      emittedPings: retained.length,
      throttled,
      skippedNonFiniteCoords,
      skippedStaleFix,
      droppedOverCap
    });
  }
}

if (!TaskManager.isTaskDefined(LOCATION_UPDATES_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_UPDATES_TASK_NAME, async ({ data, error }) => {
    if (error) {
      debugLogger.error('LOCATION', 'Background location update task error', {
        error: error.message
      });
      return;
    }

    await processLocationUpdate(data as LocationUpdatesTaskData | undefined);
  });
}
