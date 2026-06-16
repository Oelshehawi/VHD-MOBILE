import { describe, expect, it } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';

import {
  MAX_FUTURE_RECORDED_AT_SKEW_MS,
  MAX_RECORDED_AT_STALENESS_MS,
  getActivePersistedPingWindows,
  getPingIntervalSecondsForState,
  hasFiniteFixCoords,
  isPersistedWindowPingActive,
  isWindowOnSite,
  normalizeLocationHeading,
  normalizeRecordedAt,
  shouldEmitLocationPing
} from '@/services/location/locationTaskShared';
import type { PersistedTrackingWindow } from '@/services/location/LocationTrackingState';
import type * as Location from 'expo-location';

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
    pingIntervalSeconds: 120,
    onSitePingIntervalSeconds: 180,
    distanceIntervalMeters: 0,
    ...overrides
  };
}

describe('getActivePersistedPingWindows', () => {
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

    const active = getActivePersistedPingWindows(windows, []);

    expect(active.map((window) => window.id)).toEqual(['late']);
  });

  it('keeps an arrived window selected so on-site pings continue', () => {
    const windows = [persistedWindow({ id: 'w1' })];

    expect(getActivePersistedPingWindows(windows, ['w1']).map((w) => w.id)).toEqual(['w1']);
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

    expect(getActivePersistedPingWindows(windows, ['late']).map((w) => w.id)).toEqual(['late']);
  });

  it('excludes windows whose time range is not open', () => {
    const windows = [
      persistedWindow({
        id: 'future',
        startsAtUtc: minutesFromNow(60),
        scheduledStartAtUtc: minutesFromNow(90),
        endsAtUtc: minutesFromNow(300)
      })
    ];

    expect(getActivePersistedPingWindows(windows, [])).toEqual([]);
  });
});

describe('isPersistedWindowPingActive', () => {
  it('is purely time-driven: arrived/exited state never stops pinging', () => {
    const window = persistedWindow({ id: 'w1' });
    expect(isPersistedWindowPingActive(window)).toBe(true);

    const ended = persistedWindow({
      id: 'w2',
      startsAtUtc: minutesFromNow(-300),
      endsAtUtc: minutesFromNow(-30)
    });
    expect(isPersistedWindowPingActive(ended)).toBe(false);
  });
});

describe('isWindowOnSite', () => {
  it('is on-site only while arrived and not exited', () => {
    expect(isWindowOnSite('w1', ['w1'], [])).toBe(true);
    expect(isWindowOnSite('w1', ['w1'], ['w1'])).toBe(false);
    expect(isWindowOnSite('w1', [], [])).toBe(false);
  });
});

describe('getPingIntervalSecondsForState', () => {
  it('uses the on-site cadence while on site and the travel cadence otherwise', () => {
    const window = persistedWindow({
      id: 'w1',
      pingIntervalSeconds: 120,
      onSitePingIntervalSeconds: 180
    });

    expect(getPingIntervalSecondsForState(window, false)).toBe(120);
    expect(getPingIntervalSecondsForState(window, true)).toBe(180);
  });

  it('clamps travel cadence to 300s and falls back to 180s on-site default', () => {
    const window = persistedWindow({
      id: 'w1',
      pingIntervalSeconds: 600,
      onSitePingIntervalSeconds: null
    });

    expect(getPingIntervalSecondsForState(window, false)).toBe(300);
    expect(getPingIntervalSecondsForState(window, true)).toBe(180);
  });
});

describe('shouldEmitLocationPing', () => {
  it('throttles by the supplied per-state interval', () => {
    const window = persistedWindow({ id: 'w1' });
    const nowMs = Date.now();
    const lastPingAt = { w1: new Date(nowMs - 150_000).toISOString() };

    expect(shouldEmitLocationPing(window, lastPingAt, nowMs, 120)).toBe(true);
    expect(shouldEmitLocationPing(window, lastPingAt, nowMs, 180)).toBe(false);
    expect(shouldEmitLocationPing(window, {}, nowMs, 180)).toBe(true);
  });
});

describe('normalizeRecordedAt', () => {
  const now = Date.parse('2026-06-15T12:00:00.000Z');

  it('passes through a recent fix timestamp unchanged', () => {
    const fixMs = now - 5_000;
    expect(normalizeRecordedAt(fixMs, now)).toBe(new Date(fixMs).toISOString());
  });

  it('accepts ISO string candidates', () => {
    const iso = new Date(now - 5_000).toISOString();
    expect(normalizeRecordedAt(iso, now)).toBe(iso);
  });

  it('clamps a future fix (forward clock skew) to now', () => {
    const fixMs = now + MAX_FUTURE_RECORDED_AT_SKEW_MS + 60_000;
    expect(normalizeRecordedAt(fixMs, now)).toBe(new Date(now).toISOString());
  });

  it('keeps a future fix within the small skew threshold', () => {
    const fixMs = now + 30_000;
    expect(normalizeRecordedAt(fixMs, now)).toBe(new Date(fixMs).toISOString());
  });

  it('drops an unusably stale cached fix', () => {
    const fixMs = now - MAX_RECORDED_AT_STALENESS_MS - 60_000;
    expect(normalizeRecordedAt(fixMs, now)).toBeNull();
  });

  it('falls back to now for an unparseable timestamp', () => {
    expect(normalizeRecordedAt(Number.NaN, now)).toBe(new Date(now).toISOString());
    expect(normalizeRecordedAt('not-a-date', now)).toBe(new Date(now).toISOString());
  });
});

describe('hasFiniteFixCoords', () => {
  const fix = (latitude: number, longitude: number): Location.LocationObject =>
    ({ coords: { latitude, longitude } } as Location.LocationObject);

  it('is true for finite coordinates', () => {
    expect(hasFiniteFixCoords(fix(49.28, -123.12))).toBe(true);
  });

  it('is false when a coordinate is NaN', () => {
    expect(hasFiniteFixCoords(fix(Number.NaN, -123.12))).toBe(false);
    expect(hasFiniteFixCoords(fix(49.28, Number.NaN))).toBe(false);
  });
});

describe('normalizeLocationHeading', () => {
  it('keeps valid headings including range edges', () => {
    expect(normalizeLocationHeading(0)).toBe(0);
    expect(normalizeLocationHeading(90)).toBe(90);
    expect(normalizeLocationHeading(360)).toBe(360);
  });

  it('drops unavailable iOS sentinel and invalid headings', () => {
    expect(normalizeLocationHeading(-1)).toBeUndefined();
    expect(normalizeLocationHeading(361)).toBeUndefined();
    expect(normalizeLocationHeading(null)).toBeUndefined();
    expect(normalizeLocationHeading(Number.NaN)).toBeUndefined();
  });
});
