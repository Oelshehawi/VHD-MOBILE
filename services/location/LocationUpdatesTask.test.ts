import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';

import type * as Location from 'expo-location';
import {
  MAX_RECONSTRUCTED_PINGS_PER_INVOCATION,
  processLocationUpdate
} from '@/services/location/LocationUpdatesTask';
import { postOrQueueLocationEvents } from '@/services/location/LocationEventQueue';
import {
  readLocationTrackingState,
  writeLocationTrackingState
} from '@/services/location/LocationTrackingState';
import type { PersistedTrackingWindow } from '@/services/location/LocationTrackingState';
import type { MobileLocationEvent } from '@/types/locationTracking';

const postMock = postOrQueueLocationEvents as unknown as jest.Mock;

const JOB_SITE = { lat: 49.05, lng: -122.335 };
// Anchored to the real clock: the task compares window times against
// `new Date()`, which no Date.now stub can reach.
const T0 = Date.now();

function persistedWindow(
  overrides: Partial<PersistedTrackingWindow> & { id: string }
): PersistedTrackingWindow {
  return {
    scheduleId: `schedule-${overrides.id}`,
    serviceJobId: `job-${overrides.id}`,
    startsAtUtc: new Date(T0 - 4 * 60 * 60_000).toISOString(),
    scheduledStartAtUtc: new Date(T0 - 3 * 60 * 60_000).toISOString(),
    endsAtUtc: new Date(T0 + 4 * 60 * 60_000).toISOString(),
    pingIntervalSeconds: 120,
    onSitePingIntervalSeconds: 90,
    jobSiteLat: JOB_SITE.lat,
    jobSiteLng: JOB_SITE.lng,
    jobSiteRadiusMeters: 175,
    ...overrides
  };
}

function fix(offsetSeconds: number, overrides: Partial<Location.LocationObject['coords']> = {}) {
  return {
    coords: {
      latitude: JOB_SITE.lat,
      longitude: JOB_SITE.lng,
      altitude: null,
      accuracy: 12,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      ...overrides
    },
    timestamp: T0 + offsetSeconds * 1000
  } as Location.LocationObject;
}

function postedEvents(): MobileLocationEvent[] {
  return postMock.mock.calls.flatMap((call) => call[0] as MobileLocationEvent[]);
}

async function seedState(windows: PersistedTrackingWindow[]): Promise<void> {
  await writeLocationTrackingState({
    windows,
    closedScheduleIds: [],
    geofenceRegions: [],
    geofenceTransitions: [],
    arrivedWindowIds: [],
    exitedWindowIds: [],
    activeLocationWindowIds: windows.map((window) => window.id),
    lastLocationPingAtByWindowId: {},
    initialDepotCheckedWindowIds: []
  });
}

describe('processLocationUpdate', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    postMock.mockImplementation(async (...args: unknown[]) =>
      (args[0] as MobileLocationEvent[]).map(() => true)
    );
    await seedState([persistedWindow({ id: 'w1' })]);
  });

  it('emits the whole buffered trail, not just the newest fix', async () => {
    // iOS hands back everything it collected while the app was suspended.
    // Taking only the newest fix threw away the samples that prove when the
    // technician arrived.
    const locations = [-600, -480, -360, -240, -120, 0].map((offset) => fix(offset));

    await processLocationUpdate({ locations });

    const events = postedEvents();
    expect(events).toHaveLength(6);
    expect(events.map((event) => event.recordedAt)).toEqual(
      locations.map((location) => new Date(location.timestamp).toISOString())
    );
  });

  it('downsamples a dense trail back to the configured cadence', async () => {
    // 30-second raw spacing over 10 minutes against a 120s cadence.
    const locations = Array.from({ length: 21 }, (_, index) => fix(-600 + index * 30));

    await processLocationUpdate({ locations });

    const recordedAts = postedEvents().map((event) => Date.parse(event.recordedAt));
    expect(recordedAts.length).toBe(6);
    for (let index = 1; index < recordedAts.length; index += 1) {
      expect(recordedAts[index] - recordedAts[index - 1]).toBeGreaterThanOrEqual(120_000);
    }
  });

  it('sorts an out-of-order batch ascending', async () => {
    // The presence engine ignores samples older than the newest it accepted,
    // so a descending batch would leave only the first fix usable.
    const locations = [fix(0), fix(-480), fix(-240)];

    await processLocationUpdate({ locations });

    const recordedAts = postedEvents().map((event) => Date.parse(event.recordedAt));
    expect(recordedAts).toEqual([...recordedAts].sort((a, b) => a - b));
  });

  it('carries the throttle forward across invocations', async () => {
    await processLocationUpdate({ locations: [fix(-600), fix(-480)] });
    postMock.mockClear();

    // -420 is only 60s after the last emitted fix, so it stays throttled.
    await processLocationUpdate({ locations: [fix(-420)] });
    expect(postedEvents()).toHaveLength(0);

    await processLocationUpdate({ locations: [fix(-300)] });
    expect(postedEvents()).toHaveLength(1);
  });

  it('persists only the last emitted ping timestamp per window', async () => {
    await processLocationUpdate({ locations: [fix(-600), fix(-480), fix(-360)] });

    const state = await readLocationTrackingState();
    expect(state.lastLocationPingAtByWindowId.w1).toBe(new Date(T0 - 360_000).toISOString());
  });

  it('caps a pathological batch and keeps the newest fixes', async () => {
    const count = MAX_RECONSTRUCTED_PINGS_PER_INVOCATION + 15;
    const locations = Array.from({ length: count }, (_, index) => fix(-(count - index) * 130));

    await processLocationUpdate({ locations });

    const events = postedEvents();
    expect(events).toHaveLength(MAX_RECONSTRUCTED_PINGS_PER_INVOCATION);
    expect(events[events.length - 1].recordedAt).toBe(
      new Date(locations[locations.length - 1].timestamp).toISOString()
    );
    // The dropped tail must not advance the throttle past what was posted.
    const state = await readLocationTrackingState();
    expect(state.lastLocationPingAtByWindowId.w1).toBe(events[events.length - 1].recordedAt);
  });

  it('skips fixes with non-finite coords without advancing the throttle', async () => {
    await processLocationUpdate({
      locations: [fix(-600, { latitude: Number.NaN }), fix(-590)]
    });

    const events = postedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].recordedAt).toBe(new Date(T0 - 590_000).toISOString());
  });

  it('keeps a fix buffered for well over an hour', async () => {
    await processLocationUpdate({ locations: [fix(-100 * 60)] });

    const events = postedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].recordedAt).toBe(new Date(T0 - 100 * 60_000).toISOString());
  });

  it('posts every live window for each emitted fix', async () => {
    await seedState([
      persistedWindow({
        id: 'earlier',
        startsAtUtc: new Date(T0 - 5 * 60 * 60_000).toISOString(),
        scheduledStartAtUtc: new Date(T0 - 5 * 60 * 60_000).toISOString()
      }),
      persistedWindow({ id: 'selected' })
    ]);

    await processLocationUpdate({ locations: [fix(-240), fix(0)] });

    const events = postedEvents();
    expect(events).toHaveLength(4);
    // The selected window's event stays last so it remains the dashboard context.
    expect(events[events.length - 1].trackingWindowId).toBe('selected');
  });

  it('does nothing when there is no live window', async () => {
    await seedState([]);

    await processLocationUpdate({ locations: [fix(0)] });

    expect(postedEvents()).toHaveLength(0);
  });

  it('ignores an empty batch', async () => {
    await processLocationUpdate({ locations: [] });
    await processLocationUpdate(undefined);

    expect(postedEvents()).toHaveLength(0);
  });
});
