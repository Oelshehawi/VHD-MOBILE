import { fetch as expoFetch } from 'expo/fetch';
import { ApiClient } from '@/services/ApiClient';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { parsePowerSyncTokenPayload } from '@/utils/powerSyncToken';
import { debugLogger } from '@/utils/DebugLogger';
import type { FetchLike } from '@/services/network/types';
import type { MobileLocationEvent } from '@/types/locationTracking';
import { markScheduleTrackingClosed } from './LocationTrackingState';
import { getLocationOwner } from './LocationAccount';
import { getLocationDatabase, LOCATION_DEAD_LETTER_ATTEMPTS, mutateLocationOutbox, persistLocationEvents, pruneLocationOutbox, type OutboxRow } from './LocationOutbox';

let flushInFlight: Promise<void> | null = null;

// The server's per-event code for an event that crashed ingest. Unlike an
// outage, auth, or transport failure, it keeps failing for that event alone.
const POISON_CODE = 'INTERNAL_ERROR';

export function locationRetryDelay(attempt: number, retryAfterMs = 0, random = Math.random()): number {
  return Math.max(retryAfterMs, Math.min(300000, 5000 * 2 ** Math.min(attempt, 6)) * (0.5 + random * 0.5));
}

export async function enqueueLocationEvent(event: MobileLocationEvent): Promise<void> {
  const owner = await getLocationOwner();
  if (!owner) throw new Error('Location owner unavailable; event not acknowledged');
  await persistLocationEvents(owner.appUserId, [event]);
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
  const metaKey = (name: string) => `${owner.appUserId}:${name}`;
  for (let pass = 0; pass < 4 && Date.now() < deadline; pass += 1) {
    // Rows waiting on their own backoff do not hold back newer evidence; the
    // server replays each window's full history in capture-time order.
    const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM location_outbox WHERE owner = ? AND next_attempt <= ? ORDER BY recorded_at, id LIMIT 25', owner.appUserId, Date.now());
    if (!rows.length) break;
    const events = rows.map(row => JSON.parse(row.payload) as MobileLocationEvent);
    const results = await client.postLocationEvents(events);
    let blockedBy: string | null = null;
    await mutateLocationOutbox(async tx => {
      const setMeta = (name: string, value: unknown) =>
        tx.runAsync('INSERT OR REPLACE INTO location_meta(key,value) VALUES (?,?)', metaKey(name), JSON.stringify(value));
      let delivered = false;
      let rejected = false;
      for (const [index, row] of rows.entries()) {
        const result = results[index] ?? { success: false, retryable: true, code: 'INVALID_ACK' };
        if (result.success) {
          delivered = true;
          await tx.runAsync('DELETE FROM location_outbox WHERE owner = ? AND id = ?', owner.appUserId, row.id);
          if (result.scheduleTrackingClosed && result.scheduleId) {
            closed.add(result.scheduleId);
            await tx.runAsync('INSERT OR IGNORE INTO location_closures(owner,schedule_id,closed_at) VALUES (?,?,?)',
              owner.appUserId, result.scheduleId, Date.now());
          }
          continue;
        }
        const code = result.code ?? (result.retryable === false ? 'EVENT_REJECTED' : 'UPLOAD_FAILED');
        // Count consecutive failures with the same code, so an event that sat
        // offline for a day is not dead-lettered by its first server error.
        const attempts = row.last_error === code ? row.attempts + 1 : 1;
        const poisoned = code === POISON_CODE && attempts >= LOCATION_DEAD_LETTER_ATTEMPTS;
        if (result.retryable === false || poisoned) {
          rejected = true;
          await tx.runAsync('INSERT OR REPLACE INTO location_dead_letter(owner,id,payload,recorded_at,failed_at,code) VALUES (?,?,?,?,?,?)',
            owner.appUserId, row.id, row.payload, row.recorded_at, Date.now(), code);
          await tx.runAsync('DELETE FROM location_outbox WHERE owner = ? AND id = ?', owner.appUserId, row.id);
          await setMeta('rejection', code);
          if (poisoned) {
            const dropped = await tx.getFirstAsync<{ value: string }>('SELECT value FROM location_meta WHERE key = ?', metaKey('dropped'));
            await setMeta('dropped', Number(dropped?.value ?? 0) + 1);
          }
          continue;
        }
        if (code !== POISON_CODE) blockedBy = code;
        await tx.runAsync('UPDATE location_outbox SET attempts = ?, next_attempt = ?, last_error = ? WHERE owner = ? AND id = ?',
          attempts, Date.now() + locationRetryDelay(attempts - 1, result.retryAfterMs), code, owner.appUserId, row.id);
      }
      if (delivered) await setMeta('upload', new Date().toISOString());
      if (blockedBy) await setMeta('error', blockedBy);
      else await tx.runAsync('DELETE FROM location_meta WHERE key = ?', metaKey('error'));
      if (delivered && !rejected) await tx.runAsync('DELETE FROM location_meta WHERE key = ?', metaKey('rejection'));
    });
    // An outage, auth, or transport failure affects every event; stop until
    // the backoff expires instead of spending the wake on doomed requests.
    if (blockedBy) break;
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
