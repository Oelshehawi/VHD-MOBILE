import { describe, expect, it } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';

import { buildGeofenceRegions } from '@/services/location/LocationGeofenceTask';
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
