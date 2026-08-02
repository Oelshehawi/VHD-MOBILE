import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@clerk/clerk-expo', () => ({ getClerkInstance: () => null }));
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

const mockPostLocationEvents = jest.fn();
jest.mock('@/services/ApiClient', () => ({
  ApiClient: class {
    postLocationEvents = mockPostLocationEvents;
  }
}));

import {
  enqueueLocationEvent,
  flushLocationEventQueue,
  postOrQueueLocationEvents
} from '@/services/location/LocationEventQueue';
import type { MobileLocationEvent } from '@/types/locationTracking';

const QUEUE_KEY = 'vhd_location_event_queue_v1';

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

async function readQueue(): Promise<Array<{ event: MobileLocationEvent }>> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

describe('LocationEventQueue batching', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.removeItem(QUEUE_KEY);
    mockPostLocationEvents.mockImplementation(async (...args: unknown[]) =>
      (args[0] as MobileLocationEvent[]).map(() => ({ success: true, statusCode: 200 }))
    );
  });

  it('posts a whole trail in one request', async () => {
    const events = [
      event({ recordedAt: '2026-08-02T15:00:00.000Z' }),
      event({ recordedAt: '2026-08-02T15:02:00.000Z' }),
      event({ recordedAt: '2026-08-02T15:04:00.000Z' })
    ];

    await postOrQueueLocationEvents(events);

    expect(mockPostLocationEvents).toHaveBeenCalledTimes(1);
    expect(mockPostLocationEvents.mock.calls[0][0]).toHaveLength(3);
  });

  it('queues only the events that failed retryably', async () => {
    mockPostLocationEvents.mockImplementation(async () => [
      { success: true, statusCode: 200 },
      { success: false, statusCode: 500, retryable: true, error: 'boom' },
      { success: false, statusCode: 400, retryable: false, error: 'bad' }
    ]);

    await postOrQueueLocationEvents([
      event({ recordedAt: '2026-08-02T15:00:00.000Z' }),
      event({ recordedAt: '2026-08-02T15:02:00.000Z' }),
      event({ recordedAt: '2026-08-02T15:04:00.000Z' })
    ]);

    const queue = await readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].event.recordedAt).toBe('2026-08-02T15:02:00.000Z');
  });

  it('flushes geofence evidence ahead of routine pings', async () => {
    await enqueueLocationEvent(event({ recordedAt: '2026-08-02T15:00:00.000Z' }));
    await enqueueLocationEvent(
      event({ eventType: 'geofence_enter', regionType: 'job', source: 'geofence' })
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
  });
});
