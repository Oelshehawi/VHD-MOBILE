import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import { ApiClient } from '@/services/ApiClient';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import type { FetchLike } from '@/services/network/types';
import type { MobileLocationEvent } from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';

const LOCATION_EVENT_QUEUE_KEY = 'vhd_location_event_queue_v1';
const MAX_QUEUE_ITEMS = 200;
const MAX_FLUSH_ITEMS = 25;
const MAX_RETRY_ATTEMPTS = 10;

interface QueuedLocationEvent {
  id: string;
  event: MobileLocationEvent;
  firstQueuedAt: string;
  lastAttemptAt?: string;
  attemptCount: number;
  lastError?: string;
}

let flushInFlight: Promise<void> | null = null;

function createQueueId(event: MobileLocationEvent): string {
  return [
    'loc',
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
    event.eventType
  ].join('-');
}

function createApiClient(): ApiClient {
  return new ApiClient('', {
    fetchImpl: expoFetch as unknown as FetchLike,
    tokenProvider: getBackgroundToken
  });
}

function normalizeQueue(value: unknown): QueuedLocationEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is QueuedLocationEvent => {
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'string' &&
      typeof item.firstQueuedAt === 'string' &&
      typeof item.attemptCount === 'number' &&
      typeof item.event === 'object' &&
      item.event !== null
    );
  });
}

async function readQueue(): Promise<QueuedLocationEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_EVENT_QUEUE_KEY);
    return raw ? normalizeQueue(JSON.parse(raw)) : [];
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to read location event queue', {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

async function writeQueue(queue: QueuedLocationEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_EVENT_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)));
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to write location event queue', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function enqueueLocationEvent(
  event: MobileLocationEvent,
  lastError?: string
): Promise<void> {
  const queue = await readQueue();
  queue.push({
    id: createQueueId(event),
    event,
    firstQueuedAt: new Date().toISOString(),
    attemptCount: 0,
    lastError
  });

  await writeQueue(queue);
  debugLogger.info('LOCATION', 'Queued location event for retry', {
    eventType: event.eventType,
    trackingWindowId: event.trackingWindowId,
    scheduleId: event.scheduleId,
    queueDepth: Math.min(queue.length, MAX_QUEUE_ITEMS),
    lastError
  });
}

export async function postOrQueueLocationEvent(event: MobileLocationEvent): Promise<boolean> {
  const apiClient = createApiClient();
  const result = await apiClient.postLocationEvent(event);

  if (result.success) {
    debugLogger.debug('LOCATION', 'Posted location event', {
      eventType: event.eventType,
      trackingWindowId: event.trackingWindowId,
      scheduleId: event.scheduleId
    });
    return true;
  }

  if (result.retryable === false) {
    debugLogger.warn('LOCATION', 'Dropping non-retryable location event', {
      eventType: event.eventType,
      trackingWindowId: event.trackingWindowId,
      scheduleId: event.scheduleId,
      statusCode: result.statusCode,
      error: result.error
    });
    return false;
  }

  await enqueueLocationEvent(event, result.error);
  return false;
}

export async function flushLocationEventQueue(): Promise<void> {
  if (flushInFlight) {
    return flushInFlight;
  }

  flushInFlight = flushLocationEventQueueInternal().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}

async function flushLocationEventQueueInternal(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return;
  }

  const apiClient = createApiClient();
  const retained: QueuedLocationEvent[] = [];
  const batch = queue.slice(0, MAX_FLUSH_ITEMS);
  const deferred = queue.slice(MAX_FLUSH_ITEMS);

  let droppedNonRetryable = 0;
  let droppedExhausted = 0;

  for (const item of batch) {
    const result = await apiClient.postLocationEvent(item.event);
    if (result.success) {
      continue;
    }

    if (result.retryable === false) {
      droppedNonRetryable += 1;
      debugLogger.warn('LOCATION', 'Dropping non-retryable queued location event', {
        eventType: item.event.eventType,
        statusCode: result.statusCode,
        error: result.error
      });
      continue;
    }

    const nextAttemptCount = item.attemptCount + 1;
    if (nextAttemptCount >= MAX_RETRY_ATTEMPTS) {
      droppedExhausted += 1;
      debugLogger.warn('LOCATION', 'Dropping location event after max retries', {
        eventType: item.event.eventType,
        attemptCount: nextAttemptCount,
        lastError: result.error
      });
      continue;
    }

    retained.push({
      ...item,
      attemptCount: nextAttemptCount,
      lastAttemptAt: new Date().toISOString(),
      lastError: result.error
    });
  }

  await writeQueue([...retained, ...deferred]);

  debugLogger.info('LOCATION', 'Location event queue flush completed', {
    attempted: batch.length,
    succeeded: batch.length - retained.length - droppedNonRetryable - droppedExhausted,
    failed: retained.length,
    droppedNonRetryable,
    droppedExhausted,
    remaining: retained.length + deferred.length
  });
}
