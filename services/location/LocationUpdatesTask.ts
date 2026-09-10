import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { MobileLocationEvent } from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';
import { flushLocationEventQueue } from './LocationEventQueue';
import { getLocationOwner } from './LocationAccount';
import { locationThrottleKey, persistLocationEvents, readCapturedBuckets, readThrottle, serializeLocationCapture } from './LocationOutbox';
import { windowsAtSampleTime } from './locationWindowHistory';
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
  getJobSiteDistanceMeters,
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
  await serializeLocationCapture(() => captureLocationUpdate(taskData));
  await flushLocationEventQueue();
  const { reportTrackingHealth } = require('./TrackingHealth') as typeof import('./TrackingHealth');
  await reportTrackingHealth();
}

async function captureLocationUpdate(taskData: LocationUpdatesTaskData | undefined): Promise<void> {
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
  const owner = await getLocationOwner();
  if (!owner || (state.ownerAppUserId && state.ownerAppUserId !== owner.appUserId)) return;
  const windows = [...(state.historicalWindows ?? []), ...state.windows].map(window => ({ ...window }));

  const now = Date.now();
  // Carried forward in memory across the walk so the batch downsamples against
  // its own emissions; persisted once at the end via the serialized writer.
  const lastLocationPingAtByWindowId = await readThrottle(owner.appUserId);
  const capturedBuckets = await readCapturedBuckets(owner.appUserId);
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
    const sampleWindows = windowsAtSampleTime(windows, recordedAtMs);
    const selectedWindow = getActivePersistedPingWindows(sampleWindows, [], new Date(recordedAtMs))[0];
    if (!selectedWindow) continue;
    const presenceWindows = getActivePersistedPresenceWindows(sampleWindows, selectedWindow.id, new Date(recordedAtMs));
    // Only a fresh, accurate inside fix can extend local capture. This is not
    // an arrival decision; the backend still confirms all visit transitions.
    for (const window of presenceWindows) {
      const distance = getJobSiteDistanceMeters(window, location);
      const accuracy = location.coords.accuracy;
      if (!state.closedScheduleIds.includes(window.scheduleId) && distance !== null &&
        accuracy != null && accuracy >= 0 && accuracy <= 150 &&
        distance + accuracy <= (window.jobSiteRadiusMeters ?? 0)) {
        window.endsAtUtc = new Date(Math.max(Date.parse(window.endsAtUtc), Math.min(
          recordedAtMs + 30 * 60000, Date.parse(window.scheduledStartAtUtc) + 14 * 3600000))).toISOString();
      }
    }
    const throttle = Object.fromEntries(presenceWindows.map(window => {
      const last = lastLocationPingAtByWindowId[locationThrottleKey(window.id, window.definitionVersion)];
      return [window.id, last && Date.parse(last) <= recordedAtMs ? last : ''];
    }));
    const dueWindows = selectDueWindows({
      presenceWindows,
      selectedWindow,
      arrivedWindowIds: [],
      exitedWindowIds: [],
      lastLocationPingAtByWindowId: throttle,
      recordedAtMs
    }).filter(window => !capturedBuckets.has(`${locationThrottleKey(window.id, window.definitionVersion)}:${Math.floor(recordedAtMs / 60000)}`));

    if (dueWindows.length === 0) {
      throttled += 1;
      continue;
    }

    for (const window of dueWindows) {
      const key = locationThrottleKey(window.id, window.definitionVersion);
      lastLocationPingAtByWindowId[key] = recordedAt;
      capturedBuckets.add(`${key}:${Math.floor(recordedAtMs / 60000)}`);
    }
    pings.push({ location, recordedAt, windows: dueWindows });
  }

  if (pings.length === 0) {
    debugLogger.debug('LOCATION', 'Skipped location batch with no emittable fix', {
      batchSize: locations.length,
      throttled,
      skippedNonFiniteCoords,
      skippedStaleFix
    });
    await stopLocationUpdatesIfNoActivePersistedWindow('no-emittable-fix');
    return;
  }

  const retained = pings;

  const events: MobileLocationEvent[] = retained.flatMap((ping) =>
    ping.windows.map((window) => ({
      trackingWindowId: window.id,
      windowDefinitionVersion: window.definitionVersion,
      scheduleId: window.scheduleId,
      eventType: 'location_ping' as const,
      lat: ping.location.coords.latitude,
      lng: ping.location.coords.longitude,
      accuracyMeters: ping.location.coords.accuracy != null && ping.location.coords.accuracy >= 0 ? ping.location.coords.accuracy : undefined,
      speedMetersPerSecond: ping.location.coords.speed ?? undefined,
      headingDegrees: normalizeLocationHeading(ping.location.coords.heading),
      recordedAt: ping.recordedAt,
      source: 'background_location' as const,
      platform
    }))
  );

  // Save the entire downsampled trail before the independently chunked upload.
  await persistLocationEvents(owner.appUserId, events);

  // Only the pings we actually posted may advance the throttle marker.
  const persistedLastPingAt: Record<string, string> = {};
  for (const ping of retained) {
    for (const window of ping.windows) {
      persistedLastPingAt[window.id] = ping.recordedAt;
    }
  }

  await updateLocationTrackingState((current) => ({
    ...current,
    windows: current.windows.map(window => {
      const extended = windows.find(item => item.id === window.id && item.definitionVersion === window.definitionVersion && Date.parse(item.endsAtUtc) > Date.parse(window.endsAtUtc));
      return extended && !current.closedScheduleIds.includes(window.scheduleId) ? { ...window, endsAtUtc: extended.endsAtUtc } : window;
    }),
    lastLocationPingAtByWindowId: {
      ...current.lastLocationPingAtByWindowId,
      ...persistedLastPingAt
    }
  }));

  if (locations.length > 1) {
    debugLogger.info('LOCATION', 'Processed buffered location batch', {
      batchSize: locations.length,
      emittedPings: retained.length,
      throttled,
      skippedNonFiniteCoords,
      skippedStaleFix
    });
  }
  await stopLocationUpdatesIfNoActivePersistedWindow('captured-buffered-trail');
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
