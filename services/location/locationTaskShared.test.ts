import { describe, expect, it } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';

import { getActivePersistedTravelWindows } from '@/services/location/locationTaskShared';
import type { PersistedTrackingWindow } from '@/services/location/LocationTrackingState';

const minutesFromNow = (minutes: number): string =>
  new Date(Date.now() + minutes * 60_000).toISOString();

function persistedWindow(
  overrides: Partial<PersistedTrackingWindow> & { id: string }
): PersistedTrackingWindow {
  return {
    scheduleId: `schedule-${overrides.id}`,
    serviceJobId: `job-${overrides.id}`,
    startsAtUtc: minutesFromNow(-60),
    scheduledStartAtUtc: minutesFromNow(-30),
    endsAtUtc: minutesFromNow(300),
    pingIntervalSeconds: 600,
    distanceIntervalMeters: 750,
    ...overrides
  };
}

describe('getActivePersistedTravelWindows', () => {
  it('selects the latest started active window, matching the coordinator rule', () => {
    const windows = [
      persistedWindow({
        id: 'early',
        startsAtUtc: minutesFromNow(-120),
        scheduledStartAtUtc: minutesFromNow(-90)
      }),
      persistedWindow({
        id: 'late',
        startsAtUtc: minutesFromNow(-60),
        scheduledStartAtUtc: minutesFromNow(-30)
      })
    ];

    const active = getActivePersistedTravelWindows(windows, [], []);

    expect(active.map((window) => window.id)).toEqual(['late']);
  });

  it('excludes arrived windows from the active selection', () => {
    const windows = [persistedWindow({ id: 'w1' })];

    expect(getActivePersistedTravelWindows(windows, ['w1'], [])).toEqual([]);
  });

  it('does not reselect an earlier overlapping window after a later job arrival', () => {
    const windows = [
      persistedWindow({
        id: 'early',
        startsAtUtc: minutesFromNow(-240),
        scheduledStartAtUtc: minutesFromNow(-180),
        endsAtUtc: minutesFromNow(180)
      }),
      persistedWindow({
        id: 'late',
        startsAtUtc: minutesFromNow(-90),
        scheduledStartAtUtc: minutesFromNow(-30),
        endsAtUtc: minutesFromNow(240)
      })
    ];

    expect(getActivePersistedTravelWindows(windows, ['late'], [])).toEqual([]);
  });

  it('excludes windows whose travel interval is not open', () => {
    const windows = [
      persistedWindow({
        id: 'future',
        startsAtUtc: minutesFromNow(60),
        scheduledStartAtUtc: minutesFromNow(90),
        endsAtUtc: minutesFromNow(300)
      })
    ];

    expect(getActivePersistedTravelWindows(windows, [], [])).toEqual([]);
  });
});
