import { describe, expect, it } from '@jest/globals';

import {
  calculateActualServiceDurationMinutes,
  formatScheduleDateReadable,
  formatScheduleTime,
  getScheduleHour,
  getScheduleLocalDateKey,
  getScheduleServiceDayKey,
  getScheduleServiceDayUtcIso,
  getServiceDayKeyForInstant,
  getScheduleSortTime,
  isPostMidnightServiceTime,
  scheduleMatchesDateKey
} from './scheduleTime';

describe('schedule service-day time helpers (true-instant storage)', () => {
  it('groups a true next-day midnight job under the prior service day', () => {
    // 2026-06-26T07:00:00Z is 2026-06-26 00:00 in America/Vancouver (PDT, -7).
    const midnight = {
      scheduledStartAtUtc: '2026-06-26T07:00:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleLocalDateKey(midnight)).toBe('2026-06-26');
    expect(getScheduleServiceDayKey(midnight)).toBe('2026-06-25');
    expect(scheduleMatchesDateKey(midnight, '2026-06-25')).toBe(true);
    expect(formatScheduleDateReadable(midnight)).toBe('Thursday, Jun 25, 2026');
    expect(formatScheduleTime(midnight)).toBe('12:00 AM');
    expect(getScheduleHour(midnight)).toBe(0);
    expect(isPostMidnightServiceTime(midnight)).toBe(true);
    expect(getScheduleServiceDayUtcIso(midnight)).toBe('2026-06-25T00:00:00.000Z');
  });

  it('sorts a true midnight job after the same service day 11:30 PM visit', () => {
    const midnight = {
      scheduledStartAtUtc: '2026-06-26T07:00:00.000Z',
      timeZone: 'America/Vancouver'
    };
    // 2026-06-26T06:30:00Z is 2026-06-25 23:30 Vancouver — same service day.
    const lateEvening = {
      scheduledStartAtUtc: '2026-06-26T06:30:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleServiceDayKey(lateEvening)).toBe('2026-06-25');
    expect(formatScheduleTime(lateEvening)).toBe('11:30 PM');
    expect(getScheduleSortTime(midnight)).toBeGreaterThan(getScheduleSortTime(lateEvening));
  });

  it('keeps every minute before 3 AM on the prior service day', () => {
    const twoFiftyNine = {
      scheduledStartAtUtc: '2026-06-26T09:59:00.000Z', // 02:59 Vancouver
      timeZone: 'America/Vancouver'
    };
    const threeAm = {
      scheduledStartAtUtc: '2026-06-26T10:00:00.000Z', // 03:00 Vancouver
      timeZone: 'America/Vancouver'
    };

    expect(formatScheduleTime(twoFiftyNine)).toBe('2:59 AM');
    expect(getScheduleServiceDayKey(twoFiftyNine)).toBe('2026-06-25');
    expect(isPostMidnightServiceTime(twoFiftyNine)).toBe(true);

    expect(formatScheduleTime(threeAm)).toBe('3:00 AM');
    expect(getScheduleServiceDayKey(threeAm)).toBe('2026-06-26');
    expect(isPostMidnightServiceTime(threeAm)).toBe(false);
  });

  it('measures duration from the true start without double-shift', () => {
    const midnight = {
      scheduledStartAtUtc: '2026-06-26T07:00:00.000Z', // 00:00 Vancouver
      timeZone: 'America/Vancouver'
    };

    // Completed at 02:00 Vancouver (2026-06-26T09:00:00Z) → 120 minutes.
    expect(
      calculateActualServiceDurationMinutes(midnight, new Date('2026-06-26T09:00:00.000Z'))
    ).toBe(120);
  });

  it('clamps duration to zero (never negative) when completion precedes start', () => {
    const midnight = {
      scheduledStartAtUtc: '2026-06-26T07:00:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(
      calculateActualServiceDurationMinutes(midnight, new Date('2026-06-26T06:30:00.000Z'))
    ).toBe(0);
  });

  it('leaves ordinary daytime jobs unchanged', () => {
    const schedule = {
      scheduledStartAtUtc: '2026-06-25T16:30:00.000Z', // 09:30 Vancouver
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleLocalDateKey(schedule)).toBe('2026-06-25');
    expect(getScheduleServiceDayKey(schedule)).toBe('2026-06-25');
    expect(formatScheduleTime(schedule)).toBe('9:30 AM');
    expect(getScheduleHour(schedule)).toBe(9);
    expect(isPostMidnightServiceTime(schedule)).toBe(false);
    expect(
      calculateActualServiceDurationMinutes(schedule, new Date('2026-06-25T18:30:00.000Z'))
    ).toBe(120);
  });

  it('resolves current app today to the active service day before 3 AM', () => {
    expect(getServiceDayKeyForInstant(new Date('2026-06-26T07:30:00.000Z'))).toBe(
      '2026-06-25'
    );
    expect(getServiceDayKeyForInstant(new Date('2026-06-26T09:59:00.000Z'))).toBe(
      '2026-06-25'
    );
    expect(getServiceDayKeyForInstant(new Date('2026-06-26T10:00:00.000Z'))).toBe(
      '2026-06-26'
    );
  });
});
