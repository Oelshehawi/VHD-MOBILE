import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';

import * as Location from 'expo-location';
import { emitInitialDepotEnterEvents } from '@/services/location/InitialGeofenceState';
import {
  clearLocationTrackingState,
  toPersistedWindows,
  updateLocationTrackingState
} from '@/services/location/LocationTrackingState';
import type { ParsedTrackingWindow } from '@/types/locationTracking';

const getCurrentPositionAsync =
  Location.getCurrentPositionAsync as unknown as ReturnType<typeof jest.fn>;

function parsedWindow(id: string): ParsedTrackingWindow {
  return {
    id,
    technicianId: 'tech-a',
    scheduleId: `schedule-${id}`,
    serviceJobId: `job-${id}`,
    status: 'planned',
    scheduledStartAtUtc: '2026-05-14T15:00:00.000Z',
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

// A position far from the depot so no event is posted; we only assert the
// number of GPS fixes.
const farFromDepot = {
  coords: {
    latitude: 0,
    longitude: 0,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null
  },
  timestamp: Date.now()
};

describe('emitInitialDepotEnterEvents', () => {
  beforeEach(async () => {
    await clearLocationTrackingState();
    getCurrentPositionAsync.mockReset();
    getCurrentPositionAsync.mockResolvedValue(farFromDepot);
  });

  afterEach(async () => {
    await clearLocationTrackingState();
  });

  it('runs the initial depot GPS fix only once per selected window', async () => {
    const window = parsedWindow('w1');
    await updateLocationTrackingState((state) => ({
      ...state,
      windows: toPersistedWindows([window])
    }));

    await emitInitialDepotEnterEvents({ activeWindows: [window], platform: 'ios' });
    await emitInitialDepotEnterEvents({ activeWindows: [window], platform: 'ios' });

    expect(getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });
});
