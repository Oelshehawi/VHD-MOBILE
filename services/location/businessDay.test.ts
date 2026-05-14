import { describe, expect, it } from '@jest/globals';
import {
  getServiceDayKey,
  isWindowInCurrentBusinessDay,
  isWindowInCurrentTrackingGenerationRange
} from '@/services/location/businessDay';

describe('businessDay', () => {
  it('keeps a midnight Vancouver job on its stored service date', () => {
    // 2026-05-14T07:00:00Z is 2026-05-14 00:00 in America/Vancouver (PDT, -7).
    expect(getServiceDayKey('2026-05-14T07:00:00.000Z')).toBe('2026-05-14');
  });

  it('treats a window scheduled today as part of the current business day', () => {
    const now = new Date('2026-05-14T20:00:00.000Z'); // 13:00 Vancouver
    expect(
      isWindowInCurrentBusinessDay(
        { scheduledStartAtUtc: '2026-05-14T16:00:00.000Z' },
        now
      )
    ).toBe(true);
  });

  it('excludes a next-day window that arrived through the 48h lookahead', () => {
    const now = new Date('2026-05-14T20:00:00.000Z'); // 2026-05-14 Vancouver
    expect(
      isWindowInCurrentBusinessDay(
        { scheduledStartAtUtc: '2026-05-15T16:00:00.000Z' },
        now
      )
    ).toBe(false);
  });

  it('keeps service-day membership strict for a next-day midnight job', () => {
    const now = new Date('2026-05-14T23:30:00.000Z'); // 2026-05-14 Vancouver
    expect(
      isWindowInCurrentBusinessDay(
        { scheduledStartAtUtc: '2026-05-15T07:00:00.000Z' },
        now
      )
    ).toBe(false);
  });

  it('allows tracking registration for next-day jobs before the service cutoff', () => {
    const now = new Date('2026-05-14T23:30:00.000Z'); // 2026-05-14 Vancouver

    expect(
      isWindowInCurrentTrackingGenerationRange(
        { scheduledStartAtUtc: '2026-05-15T07:00:00.000Z' },
        now
      )
    ).toBe(true);
    expect(
      isWindowInCurrentTrackingGenerationRange(
        { scheduledStartAtUtc: '2026-05-15T09:59:00.000Z' },
        now
      )
    ).toBe(true);
    expect(
      isWindowInCurrentTrackingGenerationRange(
        { scheduledStartAtUtc: '2026-05-15T10:00:00.000Z' },
        now
      )
    ).toBe(false);
  });

  it('ignores non-Vancouver window time zones for Field Status membership', () => {
    const now = new Date('2026-05-14T20:00:00.000Z'); // 2026-05-14 Vancouver
    const windowWithNonVancouverZone = {
      scheduledStartAtUtc: '2026-05-15T02:30:00.000Z',
      timeZone: 'America/Toronto'
    };

    expect(
      isWindowInCurrentBusinessDay(windowWithNonVancouverZone, now)
    ).toBe(true);
  });
});
