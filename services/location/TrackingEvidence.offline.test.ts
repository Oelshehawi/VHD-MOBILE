import { beforeEach, expect, it, jest } from '@jest/globals';
import './__testSupport__/mockNativeModules';
jest.mock('@/services/ApiClient', () => ({ getApiUrl: () => '' }));
jest.mock('@/services/background/BackgroundAuth', () => ({ getBackgroundToken: async () => null }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
import { resetLocationTestDatabase } from './__testSupport__/mockSqlite';
import { getLocationDatabase, persistLocationEvents } from './LocationOutbox';
import { getTrackingDecisions } from './TrackingEvidence';
import { readLocationTrackingState, writeLocationTrackingState } from './LocationTrackingState';

beforeEach(resetLocationTestDatabase);
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
