import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetLocationTestDatabase } from './__testSupport__/mockSqlite';
import { getLocationDatabase, getLocationMeta, LOCATION_DEAD_LETTER_ATTEMPTS, setLocationMeta } from './LocationOutbox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationEventPostResult } from '@/services/ApiClient';
import type { MobileLocationEvent } from '@/types/locationTracking';

jest.mock('@clerk/clerk-expo', () => ({ getClerkInstance: () => null }));
jest.mock('@/services/location/LocationAccount', () => ({
  getLocationOwner: jest.fn(async () => ({ appUserId: 'app-user-1', fieldStaffId: 'tech-1' }))
}));
jest.mock('@/services/background/BackgroundAuth', () => ({
  getBackgroundToken: async () => 'token'
}));
jest.mock('@/utils/DebugLogger', () => ({
  debugLogger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/services/location/LocationTrackingRefreshRunner', () => ({
  refreshLocationTrackingAfterClosure: jest.fn()
}));

const mockPostLocationEvents =
  jest.fn<(events: MobileLocationEvent[]) => Promise<LocationEventPostResult[]>>();
jest.mock('@/services/ApiClient', () => ({
  ApiClient: class {
    postLocationEvents = mockPostLocationEvents;
  }
}));

import {
  enqueueLocationEvent,
  flushLocationEventQueue
} from '@/services/location/LocationEventQueue';
import {
  readLocationTrackingState,
  writeLocationTrackingState
} from '@/services/location/LocationTrackingState';
import { refreshLocationTrackingAfterClosure } from '@/services/location/LocationTrackingRefreshRunner';
const QUEUE_KEY = 'vhd_location_event_queue_v1';
const OWNER = 'app-user-1';

function event(overrides: Partial<MobileLocationEvent> = {}): MobileLocationEvent {
  return {
    trackingWindowId: 'w1',
    scheduleId: 's1',
    eventType: 'location_ping',
    recordedAt: '2026-08-02T15:00:00.000Z',
    source: 'background_location',
    platform: 'ios',
    ...overrides
  };
}

async function readQueue(): Promise<Array<{ event: MobileLocationEvent; attempts: number; last_error: string | null }>> {
  const db = await getLocationDatabase();
  const rows = await db.getAllAsync<{ payload: string; attempts: number; last_error: string | null }>(
    'SELECT payload, attempts, last_error FROM location_outbox ORDER BY recorded_at,id'
  );
  return rows.map(row => ({ event: JSON.parse(row.payload) as MobileLocationEvent, attempts: row.attempts, last_error: row.last_error }));
}

async function readDeadLetters(): Promise<Array<{ code: string }>> {
  const db = await getLocationDatabase();
  return db.getAllAsync<{ code: string }>('SELECT code FROM location_dead_letter');
}

async function setOutboxRow(recordedAt: string, fields: { attempts?: number; last_error?: string; next_attempt?: number }) {
  const db = await getLocationDatabase();
  await db.runAsync(
    'UPDATE location_outbox SET attempts = ?, last_error = ?, next_attempt = ? WHERE recorded_at = ?',
    fields.attempts ?? 0, fields.last_error ?? null, fields.next_attempt ?? 0, Date.parse(recordedAt)
  );
}

function allSucceed() {
  mockPostLocationEvents.mockImplementation(async (...args: unknown[]) =>
    (args[0] as MobileLocationEvent[]).map(() => ({ success: true, statusCode: 200 }))
  );
}

const internalError: LocationEventPostResult = {
  success: false, statusCode: 500, retryable: true, code: 'INTERNAL_ERROR', error: 'Unable to process request'
};

async function seedClosableWindow(exitedWindowIds: string[]) {
  await writeLocationTrackingState({
    windows: [
      {
        id: 'w1',
        scheduleId: 's1',
        serviceJobId: 'job-1',
        startsAtUtc: '2026-08-02T14:00:00.000Z',
        scheduledStartAtUtc: '2026-08-02T15:00:00.000Z',
        endsAtUtc: '2026-08-02T18:00:00.000Z',
        pingIntervalSeconds: 120
      }
    ],
    closedScheduleIds: [],
    geofenceRegions: [],
    geofenceTransitions: [],
    arrivedWindowIds: ['w1'],
    exitedWindowIds,
    activeLocationWindowIds: ['w1'],
    initialDepotCheckedWindowIds: []
  });
}

describe('LocationEventQueue', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-03T00:00:00Z'));
    await resetLocationTestDatabase();
    await AsyncStorage.removeItem(QUEUE_KEY);
    allSucceed();
  });

  it('posts a whole trail in one request', async () => {
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:00:00.000Z' }));
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:02:00.000Z' }));
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:04:00.000Z' }));

    await flushLocationEventQueue();

    expect(mockPostLocationEvents).toHaveBeenCalledTimes(1);
    expect(mockPostLocationEvents.mock.calls[0][0]).toHaveLength(3);
    expect(await readQueue()).toHaveLength(0);
  });

  it('keeps retryable failures queued and sets permanent rejections aside', async () => {
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:00:00.000Z' }));
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:02:00.000Z' }));
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:04:00.000Z' }));
    mockPostLocationEvents.mockImplementation(async () => [
      { success: true, statusCode: 200 },
      { success: false, statusCode: 503, retryable: true, code: 'TEMPORARILY_UNAVAILABLE', error: 'down' },
      { success: false, statusCode: 400, retryable: false, code: 'INVALID_EVENT', error: 'bad' }
    ]);

    await flushLocationEventQueue();

    const queue = await readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].event.recordedAt).toBe('2026-08-02T15:02:00.000Z');
    expect(await readDeadLetters()).toEqual([{ code: 'INVALID_EVENT' }]);
    expect(await getLocationMeta(`${OWNER}:error`)).toBe('TEMPORARILY_UNAVAILABLE');
    expect(await getLocationMeta(`${OWNER}:rejection`)).toBe('INVALID_EVENT');
  });

  it('flushes evidence in capture-time order', async () => {
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:00:00.000Z' }));
    await enqueueLocationEvent(
      event({ eventType: 'geofence_enter', regionType: 'job', source: 'geofence', recordedAt: '2026-08-02T14:59:00.000Z' })
    );
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:04:00.000Z' }));

    await flushLocationEventQueue();

    expect(mockPostLocationEvents).toHaveBeenCalledTimes(1);
    const posted = mockPostLocationEvents.mock.calls[0][0] as MobileLocationEvent[];
    expect(posted).toHaveLength(3);
    expect(posted[0].eventType).toBe('geofence_enter');
  });

  it('leaves a failed flush queued for the next attempt', async () => {
    await enqueueLocationEvent(event());
    mockPostLocationEvents.mockImplementation(async (...args: unknown[]) =>
      (args[0] as MobileLocationEvent[]).map(() => ({
        success: false,
        retryable: true,
        error: 'offline'
      }))
    );

    await flushLocationEventQueue();

    const queue = await readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(1);
  });

  it('does not let an event waiting on backoff hold back newer evidence', async () => {
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:00:00.000Z' }));
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:02:00.000Z' }));
    await setOutboxRow('2026-08-02T15:00:00.000Z', { attempts: 3, last_error: 'INTERNAL_ERROR', next_attempt: Date.now() + 60_000 });

    await flushLocationEventQueue();

    const posted = mockPostLocationEvents.mock.calls[0][0] as MobileLocationEvent[];
    expect(posted.map(item => item.recordedAt)).toEqual(['2026-08-02T15:02:00.000Z']);
    expect((await readQueue()).map(row => row.event.recordedAt)).toEqual(['2026-08-02T15:00:00.000Z']);
  });

  it('dead-letters an event after repeated server crashes and counts it as lost', async () => {
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:00:00.000Z' }));
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:02:00.000Z' }));
    await setOutboxRow('2026-08-02T15:00:00.000Z', { attempts: LOCATION_DEAD_LETTER_ATTEMPTS - 1, last_error: 'INTERNAL_ERROR' });
    mockPostLocationEvents.mockImplementation(async () => [internalError, { success: true, statusCode: 200 }]);

    await flushLocationEventQueue();

    expect(await readQueue()).toHaveLength(0);
    expect(await readDeadLetters()).toEqual([{ code: 'INTERNAL_ERROR' }]);
    expect(await getLocationMeta(`${OWNER}:dropped`)).toBe(1);
    // A single bad event is not a service problem.
    expect(await getLocationMeta(`${OWNER}:error`)).toBeNull();
  });

  it('keeps a crashing event queued without blocking the events after it', async () => {
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:00:00.000Z' }));
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:02:00.000Z' }));
    mockPostLocationEvents.mockImplementation(async () => [internalError, { success: true, statusCode: 200 }]);

    await flushLocationEventQueue();

    const queue = await readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ attempts: 1, last_error: 'INTERNAL_ERROR' });
    expect(await readDeadLetters()).toEqual([]);
  });

  it('does not count offline attempts toward the dead-letter limit', async () => {
    await enqueueLocationEvent(event());
    await setOutboxRow('2026-08-02T15:00:00.000Z', { attempts: 40, last_error: 'TRANSPORT_ERROR' });
    mockPostLocationEvents.mockImplementation(async () => [internalError]);

    await flushLocationEventQueue();

    const queue = await readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ attempts: 1, last_error: 'INTERNAL_ERROR' });
  });

  it('clears a stale rejection code after a clean upload', async () => {
    await setLocationMeta(`${OWNER}:rejection`, 'INVALID_EVENT');
    await enqueueLocationEvent(event());

    await flushLocationEventQueue();

    expect(await getLocationMeta(`${OWNER}:rejection`)).toBeNull();
    expect(await getLocationMeta(`${OWNER}:upload`)).toEqual(expect.any(String));
  });

  it('applies a schedule closure returned while flushing and refreshes native tracking', async () => {
    await seedClosableWindow(['w1']);
    await enqueueLocationEvent(
      event({ eventType: 'geofence_exit', regionType: 'job', source: 'geofence' })
    );
    mockPostLocationEvents.mockResolvedValueOnce([
      {
        success: true,
        statusCode: 200,
        scheduleId: 's1',
        jobDepartureConfirmed: true,
        scheduleTrackingClosed: true
      }
    ]);

    await flushLocationEventQueue();

    const state = await readLocationTrackingState();
    expect(state.windows).toEqual([]);
    expect(state.closedScheduleIds).toEqual(['s1']);
    expect(refreshLocationTrackingAfterClosure).toHaveBeenCalledTimes(1);
  });
});
