import { describe, expect, it, jest } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';
jest.mock('@clerk/clerk-expo', () => ({ getClerkInstance: () => null }));
jest.mock('@/services/background/BackgroundAuth', () => ({ refreshBackgroundToken: jest.fn(async () => null) }));
import { ApiClient } from './ApiClient';
import type { FetchLike } from './network/types';

describe('invoice API contract', () => {
  it('sends the persistent identity and preserves HTTP 207 recipient results', async () => {
    const result = { success: true, outcome: 'partial', recipientResults: [{ status: 'failed' }] };
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 207, json: async () => result }) as Response);
    const api = new ApiClient('', { fetchImpl: fetchImpl as FetchLike, tokenProvider: async () => 'token' });
    expect(await api.sendInvoice('visit', 'tech', 'request-id')).toEqual(result);
    const options = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(options.body as string)).toEqual({ scheduleId: 'visit', technicianId: 'tech', requestId: 'request-id', contractVersion: 2 });
  });
  it('reports a lost response without promising an automatic phone retry', async () => {
    const api = new ApiClient('', { fetchImpl: (async () => { throw new TypeError('Network request failed'); }) as FetchLike, tokenProvider: async () => 'token' });
    const result = await api.sendInvoice('visit', 'tech', 'request-id');
    expect(result.outcome).toBe('needs_review');
    expect(result.error).toContain('Check the send status');
  });
});
