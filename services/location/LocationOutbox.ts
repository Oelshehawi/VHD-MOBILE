import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MobileLocationEvent } from '@/types/locationTracking';

export const LOCATION_RETENTION_MS = 13 * 86400000;
export const LOCATION_OUTBOX_LIMIT = 100000;
let database: Promise<SQLite.SQLiteDatabase> | null = null;
let tail: Promise<unknown> = Promise.resolve();
let writeTail: Promise<void> = Promise.resolve();

export function mutateLocationOutbox(work: (db: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  const run = writeTail.then(async () => {
    const db = await getLocationDatabase();
    await db.withExclusiveTransactionAsync(work);
  });
  writeTail = run.catch(() => undefined);
  return run;
}

export function serializeLocationCapture<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  tail = result.then(() => undefined, () => undefined);
  return result;
}

export async function getLocationDatabase() {
  if (!database) database = (async () => {
    const db = await SQLite.openDatabaseAsync('vhd-location-outbox.db');
    await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS location_outbox (
        owner TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
        recorded_at INTEGER NOT NULL, queued_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
        last_error TEXT, PRIMARY KEY(owner, id));
      CREATE INDEX IF NOT EXISTS location_outbox_order ON location_outbox(owner, recorded_at, id);
      CREATE TABLE IF NOT EXISTS location_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS location_receipts (
        owner TEXT NOT NULL, id TEXT NOT NULL, result TEXT NOT NULL, received_at INTEGER NOT NULL,
        PRIMARY KEY(owner, id));
      CREATE TABLE IF NOT EXISTS location_closures (
        owner TEXT NOT NULL, schedule_id TEXT NOT NULL, closed_at INTEGER NOT NULL,
        PRIMARY KEY(owner, schedule_id));
      CREATE TABLE IF NOT EXISTS location_throttle (
        owner TEXT NOT NULL, window_id TEXT NOT NULL, recorded_at INTEGER NOT NULL,
        PRIMARY KEY(owner, window_id));
      CREATE TABLE IF NOT EXISTS location_samples (
        owner TEXT NOT NULL, window_id TEXT NOT NULL, bucket INTEGER NOT NULL,
        PRIMARY KEY(owner, window_id, bucket));`);
    return db;
  })().catch(error => { database = null; throw error; });
  return database;
}

export async function getLocationMeta<T>(key: string): Promise<T | null> {
  const db = await getLocationDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM location_meta WHERE key = ?', key);
  return row ? JSON.parse(row.value) as T : null;
}

export async function setLocationMeta(key: string, value: unknown): Promise<void> {
  await mutateLocationOutbox(async db => {
    await db.runAsync('INSERT OR REPLACE INTO location_meta(key, value) VALUES (?, ?)', key, JSON.stringify(value));
  });
}

export async function getInstallationId(): Promise<string> {
  await mutateLocationOutbox(async db => {
    await db.runAsync('INSERT OR IGNORE INTO location_meta(key, value) VALUES (?, ?)', 'installation', JSON.stringify(Crypto.randomUUID()));
  });
  return (await getLocationMeta<string>('installation'))!;
}

export interface OutboxRow {
  owner: string; id: string; payload: string; recorded_at: number; queued_at: number;
  attempts: number; next_attempt: number; last_error: string | null;
}

export async function persistLocationEvents(owner: string, events: MobileLocationEvent[]): Promise<MobileLocationEvent[]> {
  const installationId = await getInstallationId();
  const prepared = events.map(event => ({ ...event, eventId: event.eventId ?? Crypto.randomUUID(), installationId }));
  await mutateLocationOutbox(async tx => {
    await pruneLocationOutbox(tx, owner);
    for (const event of prepared) {
      await tx.runAsync('INSERT OR IGNORE INTO location_outbox(owner,id,payload,recorded_at,queued_at) VALUES (?,?,?,?,?)',
        owner, event.eventId, JSON.stringify(event), Date.parse(event.recordedAt), Date.now());
      if (event.eventType === 'location_ping' && event.trackingWindowId) {
        await tx.runAsync('INSERT OR IGNORE INTO location_samples(owner,window_id,bucket) VALUES (?,?,?)',
          owner, locationThrottleKey(event.trackingWindowId, event.windowDefinitionVersion), Math.floor(Date.parse(event.recordedAt) / 60000));
        await tx.runAsync(`INSERT INTO location_throttle(owner,window_id,recorded_at) VALUES (?,?,?)
          ON CONFLICT(owner,window_id) DO UPDATE SET recorded_at = MAX(recorded_at,excluded.recorded_at)`,
          owner, locationThrottleKey(event.trackingWindowId, event.windowDefinitionVersion), Date.parse(event.recordedAt));
      }
    }
    const overflow = await tx.runAsync(`DELETE FROM location_outbox WHERE rowid IN (
      SELECT rowid FROM location_outbox WHERE owner = ? ORDER BY recorded_at DESC LIMIT -1 OFFSET ?)`, owner, LOCATION_OUTBOX_LIMIT);
    const lost = overflow.changes;
    if (lost) {
      const row = await tx.getFirstAsync<{ value: string }>('SELECT value FROM location_meta WHERE key = ?', `${owner}:dropped`);
      await tx.runAsync('INSERT OR REPLACE INTO location_meta(key,value) VALUES (?,?)', `${owner}:dropped`, JSON.stringify(Number(row?.value ?? 0) + lost));
    }
    const latest = [...prepared].filter(event => event.eventType === 'location_ping').sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt))[0];
    const capture = await tx.getFirstAsync<{ value: string }>('SELECT value FROM location_meta WHERE key = ?', `${owner}:capture`);
    if (latest && (!capture || Date.parse(JSON.parse(capture.value).recordedAt) <= Date.parse(latest.recordedAt))) {
      await tx.runAsync('INSERT OR REPLACE INTO location_meta(key,value) VALUES (?,?)', `${owner}:capture`,
        JSON.stringify({ recordedAt: latest.recordedAt, accuracyMeters: latest.accuracyMeters ?? null }));
    }
  });
  return prepared;
}

export async function readThrottle(owner: string): Promise<Record<string, string>> {
  const db = await getLocationDatabase();
  const rows = await db.getAllAsync<{ window_id: string; recorded_at: number }>('SELECT window_id,recorded_at FROM location_throttle WHERE owner = ?', owner);
  return Object.fromEntries(rows.map(row => [row.window_id, new Date(row.recorded_at).toISOString()]));
}

export async function readCapturedBuckets(owner: string): Promise<Set<string>> {
  const db = await getLocationDatabase();
  const rows = await db.getAllAsync<{ window_id: string; bucket: number }>('SELECT window_id,bucket FROM location_samples WHERE owner = ? AND bucket >= ?', owner, Math.floor((Date.now() - LOCATION_RETENTION_MS) / 60000));
  return new Set(rows.map(row => `${row.window_id}:${row.bucket}`));
}

export function locationThrottleKey(windowId: string, version?: number): string {
  return `${windowId}:${version ?? 1}`;
}

export async function pruneLocationOutbox(db: SQLite.SQLiteDatabase, owner: string): Promise<void> {
  const cutoff = Date.now() - LOCATION_RETENTION_MS;
  const expired = await db.runAsync('DELETE FROM location_outbox WHERE owner = ? AND recorded_at < ?', owner, cutoff);
  if (expired.changes) {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM location_meta WHERE key = ?', `${owner}:dropped`);
    await db.runAsync('INSERT OR REPLACE INTO location_meta(key,value) VALUES (?,?)', `${owner}:dropped`, JSON.stringify(Number(row?.value ?? 0) + expired.changes));
  }
  await db.runAsync('DELETE FROM location_receipts WHERE received_at < ?', cutoff);
  await db.runAsync('DELETE FROM location_closures WHERE closed_at < ?', cutoff);
  await db.runAsync('DELETE FROM location_throttle WHERE recorded_at < ?', cutoff);
  await db.runAsync('DELETE FROM location_samples WHERE bucket < ?', Math.floor(cutoff / 60000));
}

export async function migrateLegacyLocationQueue(owner: string, ownedWindows: ReadonlyMap<string, string>): Promise<void> {
  if (await getLocationMeta<boolean>('legacyQueueMigrated')) return;
  const raw = await AsyncStorage.getItem('vhd_location_event_queue_v1');
  if (raw) {
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error('Invalid legacy location queue');
    const assignable = items.filter(item => item?.event && typeof item.id === 'string' &&
      ownedWindows.has(item.event.trackingWindowId) &&
      (!item.event.scheduleId || ownedWindows.get(item.event.trackingWindowId) === item.event.scheduleId));
    // Legacy entries have no account identity. Preserve unassignable entries for
    // diagnostics, but never upload them as the currently signed-in technician.
    await setLocationMeta('legacyQueueQuarantine', items.filter(item => !assignable.includes(item)));
    const events = assignable.map(item => ({ ...item.event, eventId: item.id } as MobileLocationEvent));
    await persistLocationEvents(owner, events);
  }
  await setLocationMeta('legacyQueueMigrated', true);
  await AsyncStorage.removeItem('vhd_location_event_queue_v1');
}

export async function getOutboxHealth(owner: string) {
  const db = await getLocationDatabase();
  const row = await db.getFirstAsync<{ depth: number; oldest: number | null }>('SELECT COUNT(*) AS depth, MIN(recorded_at) AS oldest FROM location_outbox WHERE owner = ?', owner);
  return { queueDepth: row?.depth ?? 0, oldestQueuedAt: row?.oldest ? new Date(row.oldest).toISOString() : null,
    droppedEvents: await getLocationMeta<number>(`${owner}:dropped`) ?? 0 };
}
