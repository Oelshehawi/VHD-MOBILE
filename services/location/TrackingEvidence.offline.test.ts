import { beforeEach, expect, it, jest } from '@jest/globals';
import './__testSupport__/mockNativeModules';
jest.mock('@/services/ApiClient', () => ({ getApiUrl: () => '' }));
jest.mock('@/services/background/BackgroundAuth', () => ({ getBackgroundToken: async () => null }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
import { resetLocationTestDatabase } from './__testSupport__/mockSqlite';
import { getLocationDatabase, persistLocationEvents } from './LocationOutbox';
import { getTrackingDecisions, applyJobCaptureDecisions } from './TrackingEvidence';
import { processLocationUpdate } from './LocationUpdatesTask';
import * as Location from 'expo-location';
import { readLocationTrackingState, writeLocationTrackingState } from './LocationTrackingState';

beforeEach(async () => {
  resetLocationTestDatabase();
  await writeLocationTrackingState({ ...await readLocationTrackingState(), windows: [], historicalWindows: [],
    geofenceRegions: [], activeLocationWindowIds: [], locationUpdatesStartedAt: undefined });
  jest.clearAllMocks();
});
it('keeps a brief stop eligible offline and closes only after a later work visit', async () => {
  const base = Date.now() - 15 * 60000;
  const at = (minute: number) => new Date(base + minute * 60000).toISOString();
  const window = { id: 'w', scheduleId: 's', serviceJobId: 'j', captureProtocolVersion: 2,
    definitionVersion: 1, startsAtUtc: at(-30), scheduledStartAtUtc: at(0), endsAtUtc: at(2880),
    expectedCaptureEndsAtUtc: at(120), pingIntervalSeconds: 60,
    jobSiteLat: 49, jobSiteLng: -123, jobSiteRadiusMeters: 175,
    depotLat: 49.02, depotLng: -123, depotRadiusMeters: 150 };
  await writeLocationTrackingState({ ...await readLocationTrackingState(), windows: [window] });
  const capture = async (points: number[][]) => persistLocationEvents('app-user-1', points.map(([minute, lat]) => ({
    captureProtocolVersion: 2, trackingWindowId: 'w', windowDefinitionVersion: 1,
    eventType: 'location_ping', source: 'background_location', platform: 'ios', recordedAt: at(minute), lat, lng: -123, accuracyMeters: 5,
  })));
  await capture([[-1, 49.01], [0, 49], [0.1, 49], [0.4, 49.01], [3.4, 49.01]]);
  expect((await getTrackingDecisions())?.retiredWindowIds).not.toContain('w');
  await applyJobCaptureDecisions();
  expect((await readLocationTrackingState()).windows.map(w => w.id)).toContain('w');
  await capture([[4, 49], [5, 49], [6, 49], [7, 49.01], [10, 49.01]]);
  expect((await getTrackingDecisions())?.captureClosures).toEqual([expect.objectContaining({ windowId: 'w', reason: 'job_exit', closedAt: at(10) })]);
});

it('keeps local evidence after upload acknowledgement and reconciles a depot return offline', async () => {
  const base = Date.now() - 600000;
  const at = (m: number) => new Date(base + m * 60000).toISOString();
  await writeLocationTrackingState({ ...await readLocationTrackingState(), windows: [{ id: 'w', scheduleId: 's', serviceJobId: 'j', captureProtocolVersion: 2,
    definitionVersion: 1, startsAtUtc: at(-30), scheduledStartAtUtc: at(0), endsAtUtc: at(48 * 60), pingIntervalSeconds: 60,
    jobSiteLat: 49, jobSiteLng: -123, jobSiteRadiusMeters: 175, depotLat: 49.02, depotLng: -123, depotRadiusMeters: 150 }] });
  for (const [m, lat] of [[0, 49.01], [1, 49], [2, 49], [3, 49.01], [4, 49.01], [6, 49.02], [7, 49.02]]) {
    await persistLocationEvents('app-user-1', [{ captureProtocolVersion: 2, trackingWindowId: 'w', eventType: 'location_ping',
      source: 'background_location', platform: 'ios', recordedAt: at(m), lat, lng: -123, accuracyMeters: 5 }]);
  }
  const db = await getLocationDatabase();
  await db.runAsync('DELETE FROM location_outbox WHERE owner = ?', 'app-user-1');
  expect((await getTrackingDecisions())?.retiredWindowIds).toContain('w');
  expect((await db.getAllAsync('SELECT * FROM location_evidence WHERE owner = ?', 'app-user-1')).length).toBe(7);
});

it('stops GPS and completed-job geofences offline, discarding the private tail of a buffered batch', async () => {
  const base = Date.now() - 10 * 60000;
  const at = (m: number) => new Date(base + m * 60000).toISOString();
  const window = { id: 'w', scheduleId: 's', serviceJobId: 'j', captureProtocolVersion: 2,
    definitionVersion: 1, startsAtUtc: at(-30), scheduledStartAtUtc: at(0), endsAtUtc: at(48 * 60),
    expectedCaptureEndsAtUtc: at(120), pingIntervalSeconds: 60, onSitePingIntervalSeconds: 60,
    jobSiteLat: 49, jobSiteLng: -123, jobSiteRadiusMeters: 175,
    depotLat: 49.02, depotLng: -123, depotRadiusMeters: 150 };
  await writeLocationTrackingState({ ...await readLocationTrackingState(), windows: [window],
    activeLocationWindowIds: ['w'], locationUpdatesStartedAt: at(0),
    geofenceRegions: [{ identifier: 'vhd:w:job', trackingWindowId: 'w', scheduleId: 's', regionType: 'job', lat: 49, lng: -123, radiusMeters: 175 }] });
  (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true as never);
  (Location.hasStartedGeofencingAsync as jest.Mock).mockResolvedValue(true as never);
  await processLocationUpdate({ locations: [[0,49.01], [1,49], [2,49], [3,49.01], [6,49.01], [7,49.02], [8,49.02]].map(([m,lat]) => ({
    timestamp: Date.parse(at(m)), coords: { latitude: lat, longitude: -123, accuracy: 5,
      altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  })) });
  const state = await readLocationTrackingState();
  expect(state.windows).toEqual([]);
  expect(state.activeLocationWindowIds).toEqual([]);
  expect(state.geofenceRegions).toEqual([]);
  expect(Location.stopLocationUpdatesAsync).toHaveBeenCalled();
  expect(Location.stopGeofencingAsync).toHaveBeenCalled();
  const rows = await (await getLocationDatabase()).getAllAsync<{payload:string}>('SELECT payload FROM location_evidence WHERE owner = ?', 'app-user-1');
  const events = rows.map(r => JSON.parse(r.payload));
  expect(events.some(e => e.recordedAt === at(6))).toBe(true);
  expect(events.some(e => Date.parse(e.recordedAt) > Date.parse(at(6)))).toBe(false);
  // An old PowerSync row cannot restart the same completed definition.
  await writeLocationTrackingState({ ...state, windows: [window] });
  await applyJobCaptureDecisions();
  expect((await readLocationTrackingState()).windows).toEqual([]);
});

it('keeps an overlapping job active and does not retire a rescheduled definition', async () => {
  const base = Date.now() - 8 * 60000;
  const at = (m: number) => new Date(base + m * 60000).toISOString();
  const first = { id: 'w', scheduleId: 's', serviceJobId: 'j', captureProtocolVersion: 2,
    definitionVersion: 1, startsAtUtc: at(-30), scheduledStartAtUtc: at(0), endsAtUtc: at(48 * 60),
    expectedCaptureEndsAtUtc: at(120), pingIntervalSeconds: 60,
    jobSiteLat: 49, jobSiteLng: -123, jobSiteRadiusMeters: 175,
    depotLat: 49.02, depotLng: -123, depotRadiusMeters: 150 };
  const second = { ...first, id: 'w2', scheduleId: 's2', jobSiteLat: 49.001 };
  await writeLocationTrackingState({ ...await readLocationTrackingState(), windows: [first, second] });
  await persistLocationEvents('app-user-1', [[0,49.01], [1,49.0008], [2,49.0008], [3,49.0025], [6,49.0025]].map(([m,lat]) => ({
    captureProtocolVersion: 2, windowDefinitionVersion: 1, trackingWindowId: 'w', eventType: 'location_ping',
    source: 'background_location', platform: 'ios', recordedAt: at(m), lat, lng: -123, accuracyMeters: 5,
  })));
  await applyJobCaptureDecisions();
  expect((await readLocationTrackingState()).windows.map(w => w.id)).toEqual(['w2']);
  expect((await readLocationTrackingState()).activeLocationWindowIds).toEqual(['w2']);
  await writeLocationTrackingState({ ...await readLocationTrackingState(), windows: [
    { ...first, definitionVersion: 2, definitionUpdatedAt: at(5), scheduledStartAtUtc: at(10) }, second,
  ] });
  expect((await getTrackingDecisions())?.retiredWindowIds).not.toContain('w');
});
