import { jest } from '@jest/globals';

// Execute production outbox SQL against real SQLite, with only the Expo bridge
// replaced. Native device durability is covered by the release test matrix.
jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = jest.requireActual('node:sqlite') as typeof import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    runAsync: jest.fn(async (sql: string, ...params: (string | number | null)[]) => sqlite.prepare(sql).run(...params)),
    getFirstAsync: async (sql: string, ...params: (string | number | null)[]) => sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql: string, ...params: (string | number | null)[]) => sqlite.prepare(sql).all(...params),
    withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await work(db); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return { openDatabaseAsync: async () => db };
});

jest.mock('expo-crypto', () => ({ randomUUID: () => (jest.requireActual('node:crypto') as typeof import('node:crypto')).randomUUID() }));

export async function resetLocationTestDatabase() {
  const { getLocationDatabase } = require('../LocationOutbox') as typeof import('../LocationOutbox');
  const db = await getLocationDatabase();
  await db.execAsync('DELETE FROM location_outbox; DELETE FROM location_meta; DELETE FROM location_receipts; DELETE FROM location_closures; DELETE FROM location_throttle; DELETE FROM location_samples;');
}
