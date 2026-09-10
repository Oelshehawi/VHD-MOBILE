import { fetch as expoFetch } from 'expo/fetch';
import { ApiClient, type LocationEventPostResult } from '@/services/ApiClient';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { parsePowerSyncTokenPayload } from '@/utils/powerSyncToken';
import { debugLogger } from '@/utils/DebugLogger';
import type { FetchLike } from '@/services/network/types';
import type { MobileLocationEvent } from '@/types/locationTracking';
import { markScheduleTrackingClosed } from './LocationTrackingState';
import { getLocationOwner } from './LocationAccount';
import { getLocationDatabase, mutateLocationOutbox, persistLocationEvents, pruneLocationOutbox, setLocationMeta, type OutboxRow } from './LocationOutbox';

export interface LocationEventDeliveryResult extends LocationEventPostResult { posted: boolean; queued: boolean; }
let flushInFlight: Promise<void> | null = null;

export function locationRetryDelay(attempt: number, retryAfterMs = 0, random = Math.random()): number {
  return Math.max(retryAfterMs, Math.min(300000, 5000 * 2 ** Math.min(attempt, 6)) * (0.5 + random * 0.5));
}

export async function enqueueLocationEvent(event: MobileLocationEvent, _lastError?: string): Promise<void> {
  const owner = await getLocationOwner();
  if (!owner) throw new Error('Location owner unavailable; event not acknowledged');
  await persistLocationEvents(owner.appUserId, [event]);
}

export async function postOrQueueLocationEvent(event: MobileLocationEvent): Promise<LocationEventDeliveryResult> {
  return (await postOrQueueLocationEvents([event]))[0];
}

export async function postOrQueueLocationEvents(events: MobileLocationEvent[]): Promise<LocationEventDeliveryResult[]> {
  if (!events.length) return [];
  const owner = await getLocationOwner();
  if (!owner) throw new Error('Location owner unavailable; event not acknowledged');
  const saved = await persistLocationEvents(owner.appUserId, events);
  await flushLocationEventQueue();
  const db = await getLocationDatabase();
  const results: LocationEventDeliveryResult[] = [];
  for (const event of saved) {
    const pending = await db.getFirstAsync('SELECT id FROM location_outbox WHERE owner = ? AND id = ?', owner.appUserId, event.eventId!);
    const receipt = await db.getFirstAsync<{ result: string }>('SELECT result FROM location_receipts WHERE owner = ? AND id = ?', owner.appUserId, event.eventId!);
    const result = receipt ? JSON.parse(receipt.result) as LocationEventPostResult : { success: false, retryable: Boolean(pending), code: pending ? 'QUEUED' : 'RETENTION_LIMIT' };
    results.push({ ...result, eventId: event.eventId, posted: result.success, queued: Boolean(pending) });
  }
  return results;
}

export async function flushLocationEventQueue(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = flushInternal().catch(error => {
    debugLogger.warn('LOCATION', 'Location outbox flush failed; saved events retained', {
      error: error instanceof Error ? error.message : String(error)
    });
  }).finally(() => { flushInFlight = null; });
  return flushInFlight;
}

async function flushInternal(): Promise<void> {
  const owner = await getLocationOwner();
  if (!owner) return;
  const db = await getLocationDatabase();
  await mutateLocationOutbox(tx => pruneLocationOutbox(tx, owner.appUserId));
  await applyDurableLocationClosures(owner.appUserId);
  const tokenProvider = async () => {
    const current = await getLocationOwner();
    if (current?.appUserId !== owner.appUserId) return null;
    const token = await getBackgroundToken();
    return token && parsePowerSyncTokenPayload(token)?.app_user_id === owner.appUserId ? token : null;
  };
  const client = new ApiClient('', { fetchImpl: expoFetch as unknown as FetchLike, tokenProvider });
  const deadline = Date.now() + 20000;
  const closed = new Set<string>();
  for (let pass = 0; pass < 4 && Date.now() < deadline; pass += 1) {
    const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM location_outbox WHERE owner = ? ORDER BY recorded_at, id LIMIT 25', owner.appUserId);
    if (!rows.length || rows[0].next_attempt > Date.now()) break;
    const firstDeferred = rows.findIndex(row => row.next_attempt > Date.now());
    const batch = firstDeferred < 0 ? rows : rows.slice(0, firstDeferred);
    const events = batch.map(row => JSON.parse(row.payload) as MobileLocationEvent);
    const results = await client.postLocationEvents(events);
    let failed = false;
    await mutateLocationOutbox(async tx => {
      for (const [index, row] of batch.entries()) {
        const result = results[index] ?? { success: false, retryable: true, code: 'INVALID_ACK' };
        if (result.success || result.retryable === false) {
          await tx.runAsync('INSERT OR REPLACE INTO location_receipts(owner,id,result,received_at) VALUES (?,?,?,?)',
            owner.appUserId, row.id, JSON.stringify(result), Date.now());
          await tx.runAsync('DELETE FROM location_outbox WHERE owner = ? AND id = ?', owner.appUserId, row.id);
          if (result.success) {
            await tx.runAsync('INSERT OR REPLACE INTO location_meta(key,value) VALUES (?,?)', `${owner.appUserId}:upload`, JSON.stringify(new Date().toISOString()));
            if (result.scheduleTrackingClosed && result.scheduleId) {
              closed.add(result.scheduleId);
              await tx.runAsync('INSERT OR IGNORE INTO location_closures(owner,schedule_id,closed_at) VALUES (?,?,?)',
                owner.appUserId, result.scheduleId, Date.now());
            }
          } else {
            await tx.runAsync('INSERT OR REPLACE INTO location_meta(key,value) VALUES (?,?)', `${owner.appUserId}:rejection`, JSON.stringify(result.code ?? 'EVENT_REJECTED'));
          }
        } else {
          failed = true;
          await tx.runAsync('UPDATE location_outbox SET attempts = attempts + 1, next_attempt = ?, last_error = ? WHERE owner = ? AND id = ?',
            Date.now() + locationRetryDelay(row.attempts, result.retryAfterMs), result.code ?? 'UPLOAD_FAILED', owner.appUserId, row.id);
          await tx.runAsync('INSERT OR REPLACE INTO location_meta(key,value) VALUES (?,?)', `${owner.appUserId}:error`, JSON.stringify(result.code ?? 'UPLOAD_FAILED'));
        }
      }
    });
    if (failed) break;
    await setLocationMeta(`${owner.appUserId}:error`, null);
  }
  if ((await getLocationOwner())?.appUserId !== owner.appUserId) return;
  for (const scheduleId of closed) await markScheduleTrackingClosed(scheduleId);
  if (closed.size) {
    const { refreshLocationTrackingAfterClosure } = require('./LocationTrackingRefreshRunner') as typeof import('./LocationTrackingRefreshRunner');
    // Do not await a coordinator that may itself be waiting for this flush.
    void refreshLocationTrackingAfterClosure();
  }
}

export async function applyDurableLocationClosures(owner: string): Promise<void> {
  const db = await getLocationDatabase();
  const rows = await db.getAllAsync<{ schedule_id: string; closed_at: number }>('SELECT schedule_id,closed_at FROM location_closures WHERE owner = ?', owner);
  for (const row of rows) await markScheduleTrackingClosed(row.schedule_id, row.closed_at);
}
