import { describe, expect, it } from '@jest/globals';
import {
  getServiceDayKey,
  isWindowInCurrentBusinessDay,
  isWindowInCurrentTrackingGenerationRange
} from '@/services/location/businessDay';

describe('businessDay (true-instant storage)', () => {
  it('maps a true next-day midnight instant to the prior service day', () => {
    // 2026-06-26T07:00:00Z is 2026-06-26 00:00 in America/Vancouver (PDT, -7),
    // which belongs to the June 25 service day.
    expect(getServiceDayKey('2026-06-26T07:00:00.000Z')).toBe('2026-06-25');
  });

  it('keeps a 03:00 instant on its own date', () => {
    expect(getServiceDayKey('2026-06-26T10:00:00.000Z')).toBe('2026-06-26');
  });

  it('treats a window scheduled today as part of the current business day', () => {
    const now = new Date('2026-06-25T20:00:00.000Z'); // 13:00 Vancouver
    expect(
      isWindowInCurrentBusinessDay(
        { scheduledStartAtUtc: '2026-06-25T16:00:00.000Z' },
        now
      )
    ).toBe(true);
  });

  it('excludes a next-day window that arrived through the 48h lookahead', () => {
    const now = new Date('2026-06-25T20:00:00.000Z'); // 2026-06-25 Vancouver
    expect(
      isWindowInCurrentBusinessDay(
        { scheduledStartAtUtc: '2026-06-26T16:00:00.000Z' }, // 09:00 June 26
        now
      )
    ).toBe(false);
  });

  it('keeps a true next-day midnight window in the current business day', () => {
    // now is 16:30 Vancouver — still in the June 25 service day.
    const now = new Date('2026-06-25T23:30:00.000Z');
    expect(
      isWindowInCurrentBusinessDay(
        { scheduledStartAtUtc: '2026-06-26T07:00:00.000Z' }, // June 26 00:00 Vancouver
        now
      )
    ).toBe(true);
  });

  it('allows tracking registration for next-day jobs before the service cutoff', () => {
    const now = new Date('2026-06-25T23:30:00.000Z'); // 16:30 Vancouver

    expect(
      isWindowInCurrentTrackingGenerationRange(
        { scheduledStartAtUtc: '2026-06-26T07:00:00.000Z' }, // 00:00 Vancouver
        now
      )
    ).toBe(true);
    expect(
      isWindowInCurrentTrackingGenerationRange(
        { scheduledStartAtUtc: '2026-06-26T09:59:00.000Z' }, // 02:59 Vancouver
        now
      )
    ).toBe(true);
    expect(
      isWindowInCurrentTrackingGenerationRange(
        { scheduledStartAtUtc: '2026-06-26T10:00:00.000Z' }, // 03:00 Vancouver
        now
      )
    ).toBe(false);
  });

  it('ignores non-Vancouver window time zones for Field Status membership', () => {
    const now = new Date('2026-06-25T20:00:00.000Z'); // 2026-06-25 Vancouver
    const windowWithNonVancouverZone = {
      scheduledStartAtUtc: '2026-06-26T02:30:00.000Z', // June 25 19:30 Vancouver
      timeZone: 'America/Toronto'
    };

    expect(
      isWindowInCurrentBusinessDay(windowWithNonVancouverZone, now)
    ).toBe(true);
  });
});
