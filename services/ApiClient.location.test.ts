import { describe, expect, it, jest } from '@jest/globals';
import '@/services/location/__testSupport__/mockNativeModules';

jest.mock('@clerk/clerk-expo', () => ({
  getClerkInstance: () => null
}));
jest.mock('@/services/background/BackgroundAuth', () => ({
  refreshBackgroundToken: jest.fn(async () => null)
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

function response(
  status: number,
  body: Record<string, unknown> = { error: `HTTP ${status}` }
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  } as Response;
}

describe('ApiClient.postLocationEvent', () => {
  it('keeps an event queued without sending it when no token is available', async () => {
    const fetchImpl = jest.fn(async () => response(200)) as unknown as FetchLike;
    const client = new ApiClient('', {
      fetchImpl,
      tokenProvider: async () => null
    });

    await expect(client.postLocationEvent(event)).resolves.toEqual(
      expect.objectContaining({ success: false, code: 'AUTH_UNAVAILABLE', retryable: true })
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps an unauthorized headless event retryable for re-authentication', async () => {
    const fetchImpl = jest.fn(async () => response(401)) as unknown as FetchLike;
    const client = new ApiClient('', {
      fetchImpl,
      tokenProvider: async () => 'token'
    });

    await expect(client.postLocationEvent(event)).resolves.toEqual(
      expect.objectContaining({ success: false, statusCode: 401, retryable: true })
    );
  });

  it('does not retry a forbidden event with invalid ownership', async () => {
    const fetchImpl = jest.fn(async () => response(403)) as unknown as FetchLike;
    const client = new ApiClient('', {
      fetchImpl,
      tokenProvider: async () => 'token'
    });

    await expect(client.postLocationEvent(event)).resolves.toEqual(
      expect.objectContaining({ success: false, statusCode: 403, retryable: false })
    );
  });

  it('returns server-confirmed schedule closure metadata', async () => {
    const fetchImpl = jest.fn(async () =>
      response(200, {
        success: true,
        stored: true,
        scheduleId: 'schedule-1',
        jobDepartureConfirmed: true,
        scheduleTrackingClosed: true
      })
    ) as unknown as FetchLike;
    const client = new ApiClient('', {
      fetchImpl,
      tokenProvider: async () => 'token'
    });

    await expect(client.postLocationEvent({ ...event, scheduleId: 'schedule-1' })).resolves.toEqual(
      expect.objectContaining({
        success: true,
        scheduleId: 'schedule-1',
        jobDepartureConfirmed: true,
        scheduleTrackingClosed: true
      })
    );
  });
});
