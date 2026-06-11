import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import '@/services/location/__testSupport__/mockNativeModules';

import * as Location from 'expo-location';
import { LocationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { STANDING_DEPOT_REGION_IDENTIFIER } from '@/services/location/LocationGeofenceTask';
import {
  clearLocationTrackingState,
  readLocationTrackingState,
  writeLocationTrackingState
} from '@/services/location/LocationTrackingState';
import type { PersistedTrackingWindow } from '@/services/location/LocationTrackingState';
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

  it('keeps a standing depot wake region from persisted windows after wind-down', async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-14T18:00:00.000Z'));
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const coordinator = new LocationTrackingCoordinator();

    const yesterdayWindow: PersistedTrackingWindow = {
      id: 'yesterday-window',
      scheduleId: 'schedule-yesterday',
      serviceJobId: 'job-yesterday',
      startsAtUtc: '2026-05-13T16:30:00.000Z',
      scheduledStartAtUtc: '2026-05-13T17:00:00.000Z',
      endsAtUtc: '2026-05-13T23:00:00.000Z',
      pingIntervalSeconds: 120,
      onSitePingIntervalSeconds: 180,
      distanceIntervalMeters: 0,
      depotLat: 49.1,
      depotLng: -123.1,
      depotRadiusMeters: 150,
      jobSiteLat: 49.2,
      jobSiteLng: -123.2,
      jobSiteRadiusMeters: 200
    };
    await writeLocationTrackingState({
      windows: [yesterdayWindow],
      geofenceRegions: [],
      geofenceTransitions: [],
      arrivedWindowIds: [],
      exitedWindowIds: [],
      activeLocationWindowIds: [],
      lastLocationPingAtByWindowId: {},
      initialDepotCheckedWindowIds: []
    });

    await coordinator.sync([], new Set());

    const state = await readLocationTrackingState();
    expect(state.windows).toEqual([]);
    expect(state.geofenceRegions).toEqual([
      expect.objectContaining({
        identifier: STANDING_DEPOT_REGION_IDENTIFIER,
        regionType: 'depot',
        purpose: 'wake',
        lat: 49.1,
        lng: -123.1
      })
    ]);
    expect(Location.startGeofencingAsync).toHaveBeenCalledWith(expect.any(String), [
      expect.objectContaining({
        identifier: STANDING_DEPOT_REGION_IDENTIFIER,
        latitude: 49.1,
        longitude: -123.1,
        radius: 150
      })
    ]);
    expect(Location.stopGeofencingAsync).not.toHaveBeenCalled();
  });

  it('registers upcoming job-site wake regions while idle', async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 2026-05-14 11:00 Vancouver; the synced window is for the next business day.
    jest.setSystemTime(new Date('2026-05-14T18:00:00.000Z'));
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const coordinator = new LocationTrackingCoordinator();

    await coordinator.sync(
      [
        trackingWindow({
          id: 'tomorrow-window',
          scheduleId: 'schedule-tomorrow',
          scheduledStartAtUtc: '2026-05-15T17:00:00.000Z',
          startsAtUtc: '2026-05-15T16:30:00.000Z',
          endsAtUtc: '2026-05-15T23:00:00.000Z'
        })
      ],
      new Set()
    );

    const state = await readLocationTrackingState();
    expect(state.windows).toEqual([]);
    expect(state.activeLocationWindowIds).toEqual([]);
    expect(state.geofenceRegions.map((region) => region.identifier).sort()).toEqual([
      STANDING_DEPOT_REGION_IDENTIFIER,
      'vhd:tomorrow-window:job'
    ]);
    expect(state.geofenceRegions.every((region) => region.purpose === 'wake')).toBe(true);
  });
});
