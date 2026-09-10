import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@powersync/react-native', () => ({
  UpdateType: { PUT: 'PUT', PATCH: 'PATCH', DELETE: 'DELETE' }
}));
jest.mock('@/services/background/clerkBootstrap', () => ({ getPersistentClerk: () => null }));
jest.mock('@/services/background/BackgroundAuth', () => ({
  cacheBackgroundToken: jest.fn(),
  refreshBackgroundToken: jest.fn(async () => null)
}));
jest.mock('../storage/CloudinaryStorageAdapter', () => ({ CloudinaryStorageAdapter: class {} }));
jest.mock('@/utils/DebugLogger', () => ({
  debugLogger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { BackendConnector } from './BackendConnector';
import type { ApiClient, SyncOperationResult } from '../ApiClient';

type Op = { table: string; id: string; op: string; opData?: Record<string, unknown> };

function outcome(outcome: SyncOperationResult['outcome'], table = 'reports'): SyncOperationResult {
  return {
    outcome,
    method: 'PUT',
    table,
    httpStatus: outcome === 'retryable_error' ? 503 : 200,
    error: outcome === 'business_reject' ? 'VALIDATION_ERROR' : undefined,
    message: outcome === 'business_reject' ? 'status is invalid' : undefined
  };
}

function setup(crud: Op[], result: SyncOperationResult) {
  const send = jest.fn(async () => result);
  const apiClient = { upsert: send, update: send, delete: send, batchUpsert: send, batchPatch: send };
  const execute = jest.fn(async (..._args: unknown[]) => ({}));
  const complete = jest.fn(async () => undefined);
  const database = {
    execute,
    getAll: jest.fn(async () => [] as unknown[]),
    getNextCrudTransaction: jest.fn(async () => ({ crud, complete }))
  };
  const connector = new BackendConnector(null, { apiClient: apiClient as unknown as ApiClient });
  return { connector, database, execute, complete, send };
}

describe('BackendConnector rejected writes', () => {
  it('quarantines a rejected report write before completing the transaction', async () => {
    const op = { table: 'reports', id: 'r1', op: 'PUT', opData: { status: 'bogus' } };
    const { connector, database, execute, complete } = setup([op], outcome('business_reject'));

    await connector.uploadData(database as never);

    expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sync_quarantine'), [
      'reports',
      'r1',
      'PUT',
      JSON.stringify({ status: 'bogus' }),
      200,
      'status is invalid',
      expect.any(String)
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(complete.mock.invocationCallOrder[0]);
  });

  it('quarantines every photo in a rejected batch', async () => {
    const ops = [
      { table: 'photos', id: 'p1', op: 'PUT', opData: { url: 'a' } },
      { table: 'photos', id: 'p2', op: 'PUT', opData: { url: 'b' } }
    ];
    const { connector, database, execute } = setup(ops, outcome('business_reject', 'photos'));

    await connector.uploadData(database as never);

    const rowIds = execute.mock.calls.map((call) => (call[1] as unknown[])[1]);
    expect(rowIds).toEqual(['p1', 'p2']);
  });

  it('keeps the transaction queued when the quarantine insert fails', async () => {
    const op = { table: 'reports', id: 'r1', op: 'PATCH', opData: { status: 'bogus' } };
    const { connector, database, execute, complete } = setup([op], outcome('business_reject'));
    execute.mockRejectedValueOnce(new Error('disk full'));

    await expect(connector.uploadData(database as never)).rejects.toThrow('disk full');
    expect(complete).not.toHaveBeenCalled();
  });

  it('still drops a rejected stale push token without quarantining it', async () => {
    const op = { table: 'expopushtokens', id: 't1', op: 'PUT', opData: { token: 'x' } };
    const { connector, database, execute, complete } = setup([op], outcome('business_reject', 'expopushtokens'));

    await connector.uploadData(database as never);

    expect(execute).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('re-sends quarantined writes and clears the ones the server accepts', async () => {
    const { connector, database, execute, send } = setup([], outcome('success'));
    database.getAll.mockResolvedValueOnce([
      { id: 'q1', tableName: 'reports', rowId: 'r1', op: 'PATCH', data: JSON.stringify({ status: 'completed' }) }
    ]);

    await expect(connector.retryQuarantinedWrites(database as never)).resolves.toEqual({
      resolved: 1,
      remaining: 0
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'reports', data: expect.objectContaining({ id: 'r1' }) })
    );
    expect(execute).toHaveBeenCalledWith('DELETE FROM sync_quarantine WHERE id = ?', ['q1']);
  });

  it('stops retrying quarantined writes while the server is unreachable', async () => {
    const { connector, database, execute, send } = setup([], outcome('retryable_error'));
    database.getAll.mockResolvedValueOnce([
      { id: 'q1', tableName: 'reports', rowId: 'r1', op: 'PATCH', data: '{}' },
      { id: 'q2', tableName: 'reports', rowId: 'r2', op: 'PATCH', data: '{}' }
    ]);

    await expect(connector.retryQuarantinedWrites(database as never)).resolves.toEqual({
      resolved: 0,
      remaining: 2
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });
});
