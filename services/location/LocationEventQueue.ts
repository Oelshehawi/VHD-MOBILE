import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import { ApiClient } from '@/services/ApiClient';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import type { FetchLike } from '@/services/network/types';
import type { MobileLocationEvent } from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';

const LOCATION_EVENT_QUEUE_KEY = 'vhd_location_event_queue_v1';
const MAX_QUEUE_ITEMS = 500;
const MAX_FLUSH_ITEMS = 25;
const MAX_RETRY_ATTEMPTS = 10;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CRITICAL_QUEUE_AGE_MS = 13 * 24 * 60 * 60 * 1000;

interface QueuedLocationEvent {
  id: string;
  event: MobileLocationEvent;
  firstQueuedAt: string;
  lastAttemptAt?: string;
  attemptCount: number;
  lastError?: string;
}

let flushInFlight: Promise<void> | null = null;
let queueMutationTail: Promise<void> = Promise.resolve();

function isCriticalEvent(event: MobileLocationEvent): boolean {
  return event.eventType === 'geofence_enter' || event.eventType === 'geofence_exit';
}

function runQueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const run = queueMutationTail.then(mutation, mutation);
  queueMutationTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

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

function trimQueue(queue: QueuedLocationEvent[]): QueuedLocationEvent[] {
  if (queue.length <= MAX_QUEUE_ITEMS) {
    return queue;
  }

  const critical = queue.filter((item) => isCriticalEvent(item.event)).slice(-MAX_QUEUE_ITEMS);
  const criticalIds = new Set(critical.map((item) => item.id));
  const routineSlots = Math.max(0, MAX_QUEUE_ITEMS - critical.length);
  const routine =
    routineSlots > 0
      ? queue
          .filter((item) => !criticalIds.has(item.id) && !isCriticalEvent(item.event))
          .slice(-routineSlots)
      : [];
  const retainedIds = new Set([...critical, ...routine].map((item) => item.id));

  return queue.filter((item) => retainedIds.has(item.id));
}

async function writeQueue(queue: QueuedLocationEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_EVENT_QUEUE_KEY, JSON.stringify(trimQueue(queue)));
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
  await runQueueMutation(async () => {
    const queue = await readQueue();
    queue.push({
      id: createQueueId(event),
      event,
      firstQueuedAt: new Date().toISOString(),
      attemptCount: 0,
      lastError
    });

    const trimmed = trimQueue(queue);
    await writeQueue(trimmed);
    debugLogger.info('LOCATION', 'Queued location event for retry', {
      eventType: event.eventType,
      trackingWindowId: event.trackingWindowId,
      scheduleId: event.scheduleId,
      queueDepth: trimmed.length,
      lastError
    });
  });
}

export async function postOrQueueLocationEvent(event: MobileLocationEvent): Promise<boolean> {
  const [posted] = await postOrQueueLocationEvents([event]);
  return posted === true;
}

/**
 * Posts a whole batch in one request, queueing only the events that failed
 * retryably. Returns one boolean per input event, aligned by index.
 */
export async function postOrQueueLocationEvents(
  events: MobileLocationEvent[]
): Promise<boolean[]> {
  if (events.length === 0) {
    return [];
  }

  const apiClient = createApiClient();
  const results = await apiClient.postLocationEvents(events);
  const posted: boolean[] = [];

  for (const [index, event] of events.entries()) {
    const result = results[index];

    if (result?.success) {
      debugLogger.debug('LOCATION', 'Posted location event', {
        eventType: event.eventType,
        trackingWindowId: event.trackingWindowId,
        scheduleId: event.scheduleId
      });
      posted.push(true);
      continue;
    }

    if (result?.retryable === false) {
      debugLogger.warn('LOCATION', 'Dropping non-retryable location event', {
        eventType: event.eventType,
        trackingWindowId: event.trackingWindowId,
        scheduleId: event.scheduleId,
        statusCode: result.statusCode,
        error: result.error
      });
      posted.push(false);
      continue;
    }

    await enqueueLocationEvent(event, result?.error);
    posted.push(false);
  }

  return posted;
}

export async function flushLocationEventQueue(): Promise<void> {
  if (flushInFlight) {
    return flushInFlight;
  }

  flushInFlight = runQueueMutation(flushLocationEventQueueInternal).finally(() => {
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
  const nowMs = Date.now();
  const isExpired = (item: QueuedLocationEvent): boolean => {
    const queuedAtMs = Date.parse(item.firstQueuedAt);
    const maxAgeMs = isCriticalEvent(item.event)
      ? MAX_CRITICAL_QUEUE_AGE_MS
      : MAX_QUEUE_AGE_MS;
    return Number.isFinite(queuedAtMs) && nowMs - queuedAtMs > maxAgeMs;
  };
  const fresh = queue.filter((item) => !isExpired(item));
  const droppedExpired = queue.length - fresh.length;
  if (droppedExpired > 0) {
    debugLogger.warn('LOCATION', 'Dropping expired queued location events', {
      droppedExpired
    });
  }
  // Exact geofence evidence flushes ahead of routine pings when the queue is
  // deep; the server re-sorts the request by recordedAt before ingesting, so
  // presence ordering is unaffected by this transmission order.
  const prioritized = [
    ...fresh.filter((item) => isCriticalEvent(item.event)),
    ...fresh.filter((item) => !isCriticalEvent(item.event))
  ];
  const batch = prioritized.slice(0, MAX_FLUSH_ITEMS);
  const deferred = prioritized.slice(MAX_FLUSH_ITEMS);

  let droppedNonRetryable = 0;
  let droppedExhausted = 0;

  const results = await apiClient.postLocationEvents(batch.map((item) => item.event));

  for (const [index, item] of batch.entries()) {
    const result = results[index] ?? {
      success: false,
      retryable: true,
      error: 'Missing batch result'
    };
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
    if (!isCriticalEvent(item.event) && nextAttemptCount >= MAX_RETRY_ATTEMPTS) {
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
    droppedExpired,
    remaining: retained.length + deferred.length
  });
}
