import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import '@/services/location/__testSupport__/mockNativeModules';

import { LocationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import {
  clearLocationTrackingState,
  readLocationTrackingState
} from '@/services/location/LocationTrackingState';
import type { TechnicianTrackingWindow } from '@/types/locationTracking';

function trackingWindow(
  overrides: Partial<TechnicianTrackingWindow> & { id: string; scheduleId: string }
): TechnicianTrackingWindow {
  const { id, scheduleId, ...rest } = overrides;
  return {
    id,
    technicianId: 'tech-a',
    scheduleId,
    serviceJobId: `job-${id}`,
    status: 'planned',
    scheduledStartAtUtc: '2026-05-14T17:00:00.000Z',
    timeZone: 'America/Vancouver',
    startsAtUtc: '2026-05-14T16:30:00.000Z',
    endsAtUtc: '2026-05-14T23:00:00.000Z',
    expectedDurationMinutes: 120,
    travelTimeMinutes: 30,
    depot: JSON.stringify({ lat: 49.1, lng: -123.1, radiusMeters: 150 }),
    jobSite: JSON.stringify({ lat: 49.2, lng: -123.2, radiusMeters: 200 }),
    locationUpdateMode: 'travel_only',
    pingIntervalSeconds: 600,
    distanceIntervalMeters: 750,
    updatedAt: '2026-05-14T12:00:00.000Z',
    ...rest
  };
}

describe('LocationTrackingCoordinator', () => {
  afterEach(async () => {
    jest.useRealTimers();
    await clearLocationTrackingState();
  });

  it('excludes locally completed schedules from selection and persistence', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-14T18:00:00.000Z'));
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const coordinator = new LocationTrackingCoordinator();

    await coordinator.sync(
      [trackingWindow({ id: 'completed-window', scheduleId: 'completed-schedule' })],
      new Set(['completed-schedule'])
    );

    const state = await readLocationTrackingState();
    expect(state.windows).toEqual([]);
    expect(state.activeLocationWindowIds).toEqual([]);
  });

  it('registers a next-day midnight window while its tracking window is active tonight', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T06:30:00.000Z')); // 2026-05-14 23:30 Vancouver
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const coordinator = new LocationTrackingCoordinator();

    await coordinator.sync(
      [
        trackingWindow({
          id: 'midnight-window',
          scheduleId: 'schedule-midnight',
          scheduledStartAtUtc: '2026-05-15T07:00:00.000Z',
          startsAtUtc: '2026-05-15T06:00:00.000Z',
          endsAtUtc: '2026-05-15T11:45:00.000Z'
        })
      ],
      new Set()
    );

    const state = await readLocationTrackingState();
    expect(state.windows.map((window) => window.id)).toEqual(['midnight-window']);
    expect(state.activeLocationWindowIds).toEqual(['midnight-window']);
  });
});
