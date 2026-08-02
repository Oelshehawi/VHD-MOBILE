import { describe, expect, it, jest } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';

jest.mock('@clerk/clerk-expo', () => ({
  getClerkInstance: () => null
}));

import { ApiClient } from '@/services/ApiClient';
import type { FetchLike } from '@/services/network/types';
import type { MobileLocationEvent } from '@/types/locationTracking';

const event: MobileLocationEvent = {
  eventType: 'geofence_exit',
  regionType: 'job',
  recordedAt: '2026-08-02T12:00:00.000Z',
  source: 'geofence',
  platform: 'ios'
};

function response(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify({ error: `HTTP ${status}` })
  } as Response;
}

describe('ApiClient.postLocationEvent', () => {
  it('queues an unauthorized headless event for foreground re-authentication', async () => {
    const fetchImpl = jest.fn(async () => response(401)) as unknown as FetchLike;
    const client = new ApiClient('', {
      fetchImpl,
      tokenProvider: async () => null
    });

    await expect(client.postLocationEvent(event)).resolves.toEqual(
      expect.objectContaining({ success: false, statusCode: 401, retryable: true })
    );
  });

  it('does not retry a forbidden event with invalid ownership', async () => {
    const fetchImpl = jest.fn(async () => response(403)) as unknown as FetchLike;
    const client = new ApiClient('', {
      fetchImpl,
      tokenProvider: async () => null
    });

    await expect(client.postLocationEvent(event)).resolves.toEqual(
      expect.objectContaining({ success: false, statusCode: 403, retryable: false })
    );
  });
});
