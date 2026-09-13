import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetLocationTestDatabase } from './__testSupport__/mockSqlite';
import { getLocationDatabase, getLocationMeta, LOCATION_RETENTION_MS, mutateLocationOutbox, recoverLocationCursorFailures, setLocationMeta } from './LocationOutbox';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const now = Date.parse('2026-09-13T18:00:00Z');
const owner = 'owner-1';
const marker = `${owner}:locationCursorRecoveryV1`;

async function seed(id: string, overrides: { owner?: string; code?: string; at?: number } = {}) {
  const db = await getLocationDatabase();
  await db.runAsync('INSERT INTO location_dead_letter(owner,id,payload,recorded_at,failed_at,code) VALUES (?,?,?,?,?,?)',
    overrides.owner ?? owner, id, JSON.stringify({ eventId: id, recordedAt: new Date(overrides.at ?? now - 60000).toISOString() }),
    overrides.at ?? now - 60000, now, overrides.code ?? 'INTERNAL_ERROR');
}

const recover = (account = owner) => mutateLocationOutbox(tx => recoverLocationCursorFailures(tx, account));

describe('location cursor failure recovery', () => {
  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await resetLocationTestDatabase();
  });

  it('restores eligible payloads once per account and preserves permanent and expired rejections', async () => {
    await seed('recoverable');
    await seed('invalid', { code: 'INVALID_EVENT' });
    await seed('expired', { at: now - LOCATION_RETENTION_MS - 1 });
    await seed('other', { owner: 'owner-2' });
    await setLocationMeta(`${owner}:dropped`, 3);
    await recover();
    const db = await getLocationDatabase();
    expect(await db.getAllAsync('SELECT id,attempts,next_attempt,last_error,payload FROM location_outbox')).toEqual([
      { id: 'recoverable', attempts: 0, next_attempt: 0, last_error: null,
        payload: JSON.stringify({ eventId: 'recoverable', recordedAt: new Date(now - 60000).toISOString() }) }
    ]);
    expect(await getLocationMeta(`${owner}:dropped`)).toBe(2);
    expect(await getLocationMeta(marker)).toBe(true);
    // A later flush/restart must not recover failures created after this migration.
    await seed('later');
    await recover();
    expect(await db.getAllAsync('SELECT id FROM location_outbox')).toHaveLength(1);
    expect(await db.getAllAsync('SELECT id FROM location_dead_letter ORDER BY id')).toEqual([
      { id: 'expired' }, { id: 'invalid' }, { id: 'later' }, { id: 'other' }
    ]);
    await recover('owner-2');
    expect(await db.getAllAsync('SELECT id FROM location_outbox WHERE owner = ?', 'owner-2')).toEqual([{ id: 'other' }]);
  });

  it('preserves an existing queued copy and never makes dropped counts negative', async () => {
    await seed('duplicate');
    const db = await getLocationDatabase();
    await db.runAsync('INSERT INTO location_outbox(owner,id,payload,recorded_at,queued_at,attempts,next_attempt,last_error) VALUES (?,?,?,?,?,?,?,?)',
      owner, 'duplicate', 'original', now - 60000, now - 30000, 2, now + 5000, 'TRANSPORT_ERROR');
    await recover();
    expect(await db.getAllAsync('SELECT payload,attempts,next_attempt FROM location_outbox')).toEqual([
      { payload: 'original', attempts: 2, next_attempt: now + 5000 }
    ]);
    expect(await db.getAllAsync('SELECT id FROM location_dead_letter')).toEqual([]);
    expect(await getLocationMeta(`${owner}:dropped`)).toBe(0);
  });

  it('rolls back recovery and its marker on interruption, then safely retries', async () => {
    await seed('retained');
    await setLocationMeta(`${owner}:dropped`, 1);
    await expect(mutateLocationOutbox(async tx => {
      await recoverLocationCursorFailures(tx, owner);
      throw new Error('interrupted before commit');
    })).rejects.toThrow('interrupted');
    const db = await getLocationDatabase();
    expect(await getLocationMeta(marker)).toBeNull();
    expect(await getLocationMeta(`${owner}:dropped`)).toBe(1);
    expect(await db.getAllAsync('SELECT id FROM location_outbox')).toEqual([]);
    expect(await db.getAllAsync('SELECT id FROM location_dead_letter')).toEqual([{ id: 'retained' }]);
    await recover();
    expect(await getLocationMeta(marker)).toBe(true);
    expect(await db.getAllAsync('SELECT id FROM location_outbox')).toEqual([{ id: 'retained' }]);
  });
});
