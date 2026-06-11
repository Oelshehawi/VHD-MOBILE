import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';

import * as Location from 'expo-location';
import {
  buildGeofenceRegions,
  processGeofenceEvent
} from '@/services/location/LocationGeofenceTask';
import { postOrQueueLocationEvent } from '@/services/location/LocationEventQueue';
import {
  readLocationTrackingState,
  writeLocationTrackingState
} from '@/services/location/LocationTrackingState';
import type { PersistedTrackingWindow } from '@/services/location/LocationTrackingState';
import type { ParsedTrackingWindow } from '@/types/locationTracking';

function parsedWindow(id: string): ParsedTrackingWindow {
  const hour = String(10 + Number(id.replace(/\D/g, '') || 0)).padStart(2, '0');

  return {
    id,
    technicianId: 'tech-a',
    scheduleId: `schedule-${id}`,
    serviceJobId: `job-${id}`,
    status: 'planned',
    scheduledStartAtUtc: `2026-05-14T${hour}:00:00.000Z`,
    timeZone: 'America/Vancouver',
    startsAtUtc: '2026-05-14T14:00:00.000Z',
    endsAtUtc: '2026-05-14T21:30:00.000Z',
    expectedDurationMinutes: 120,
    travelTimeMinutes: 30,
    depot: '',
    jobSite: '',
    locationUpdateMode: 'travel_only',
    pingIntervalSeconds: 600,
    distanceIntervalMeters: 750,
    updatedAt: '2026-05-14T12:00:00.000Z',
    depotTarget: { lat: 49.1, lng: -123.1, radiusMeters: 150 },
    jobSiteTarget: { lat: 49.2, lng: -123.2, radiusMeters: 200 }
  };
}

describe('buildGeofenceRegions', () => {
  it('registers a depot geofence only for the selected window and a job geofence for every current-day window', () => {
    const windows = [parsedWindow('w1'), parsedWindow('w2'), parsedWindow('w3')];

    const { regions, metadata } = buildGeofenceRegions(windows, new Set(['w2']));

    const depotWindowIds = metadata
      .filter((region) => region.regionType === 'depot')
      .map((region) => region.trackingWindowId);
    const jobWindowIds = metadata
      .filter((region) => region.regionType === 'job')
      .map((region) => region.trackingWindowId)
      .sort();

    expect(depotWindowIds).toEqual(['w2']);
    expect(jobWindowIds).toEqual(['w1', 'w2', 'w3']);
    expect(regions).toHaveLength(4);
  });

  it('registers only job geofences when no window is the selected travel window', () => {
    const windows = [parsedWindow('w1'), parsedWindow('w2')];

    const { metadata } = buildGeofenceRegions(windows, new Set());

    expect(metadata.every((region) => region.regionType === 'job')).toBe(true);
    expect(metadata).toHaveLength(2);
  });

  it('keeps the selected travel window inside the geofence cap', () => {
    const windows = Array.from({ length: 10 }, (_, index) => parsedWindow(`w${index + 1}`));

    const { metadata } = buildGeofenceRegions(windows, new Set(['w10']));

    expect(metadata).toHaveLength(9);
    expect(metadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trackingWindowId: 'w10', regionType: 'depot' }),
        expect.objectContaining({ trackingWindowId: 'w10', regionType: 'job' })
      ])
    );
    expect(metadata.some((region) => region.trackingWindowId === 'w9')).toBe(false);
  });
});

const minutesFromNow = (minutes: number): string =>
  new Date(Date.now() + minutes * 60_000).toISOString();

function activePersistedWindow(id: string): PersistedTrackingWindow {
  return {
    id,
    scheduleId: `schedule-${id}`,
    serviceJobId: `job-${id}`,
    startsAtUtc: minutesFromNow(-60),
    scheduledStartAtUtc: minutesFromNow(-30),
    endsAtUtc: minutesFromNow(300),
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
}

async function seedStateForGeofenceEvent(overrides?: {
  arrivedWindowIds?: string[];
  exitedWindowIds?: string[];
}): Promise<void> {
  await writeLocationTrackingState({
    windows: [activePersistedWindow('w1')],
    geofenceRegions: [
      {
        identifier: 'vhd:w1:job',
        trackingWindowId: 'w1',
        scheduleId: 'schedule-w1',
        regionType: 'job',
        lat: 49.2,
        lng: -123.2
      }
    ],
    geofenceTransitions: [],
    arrivedWindowIds: overrides?.arrivedWindowIds ?? [],
    exitedWindowIds: overrides?.exitedWindowIds ?? [],
    activeLocationWindowIds: ['w1'],
    lastLocationPingAtByWindowId: {},
    initialDepotCheckedWindowIds: []
  });
}

function jobRegionEvent(eventType: number) {
  return {
    eventType: eventType as Location.GeofencingEventType,
    region: { identifier: 'vhd:w1:job', latitude: 49.2, longitude: -123.2, radius: 200 }
  };
}

describe('processGeofenceEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attaches device GPS coords while keeping the region center as lat/lng', async () => {
    await seedStateForGeofenceEvent();

    await processGeofenceEvent(jobRegionEvent(1));

    expect(postOrQueueLocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'geofence_enter',
        regionType: 'job',
        lat: 49.2,
        lng: -123.2,
        deviceLat: 49.105,
        deviceLng: -123.105,
        deviceAccuracyMeters: 18
      })
    );
  });

  it('still emits the event when the device fix is unavailable', async () => {
    await seedStateForGeofenceEvent();
    jest
      .mocked(Location.getLastKnownPositionAsync)
      .mockRejectedValueOnce(new Error('no fix'));

    await processGeofenceEvent(jobRegionEvent(1));

    const emitted = jest.mocked(postOrQueueLocationEvent).mock.calls.at(-1)?.[0];
    expect(emitted).toMatchObject({ eventType: 'geofence_enter', lat: 49.2, lng: -123.2 });
    expect(emitted).not.toHaveProperty('deviceLat');
  });

  it('marks arrival, clears a previous exit, and switches to on-site cadence', async () => {
    await seedStateForGeofenceEvent({ arrivedWindowIds: [], exitedWindowIds: ['w1'] });

    await processGeofenceEvent(jobRegionEvent(1));

    const state = await readLocationTrackingState();
    expect(state.arrivedWindowIds).toContain('w1');
    expect(state.exitedWindowIds).not.toContain('w1');
    expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 180_000,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false
      })
    );
  });

  it('records an exit without stopping pings and re-arms travel cadence', async () => {
    await seedStateForGeofenceEvent({ arrivedWindowIds: ['w1'] });

    await processGeofenceEvent(jobRegionEvent(2));

    const state = await readLocationTrackingState();
    expect(state.exitedWindowIds).toContain('w1');
    expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        accuracy: Location.Accuracy.High,
        timeInterval: 120_000,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false
      })
    );
  });

  it('restarts timed pings when the OS relaunched the app without the updates task', async () => {
    await seedStateForGeofenceEvent();
    jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValueOnce(false);

    await processGeofenceEvent(jobRegionEvent(1));

    expect(Location.startLocationUpdatesAsync).toHaveBeenCalled();
  });
});
