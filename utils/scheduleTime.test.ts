import { describe, expect, it } from '@jest/globals';

import {
  calculateActualServiceDurationMinutes,
  formatScheduleArrivalTime,
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
  it('uses permanent UTC-7 for winter 2026 B.C. schedule displays', () => {
    expect(
      formatScheduleTime({
        scheduledStartAtUtc: '2026-12-10T16:00:00.000Z',
        timeZone: 'America/Vancouver'
      })
    ).toBe('9:00 AM');
    expect(
      formatScheduleTime({
        scheduledStartAtUtc: '2026-12-10T17:00:00.000Z',
        timeZone: 'America/Vancouver'
      })
    ).toBe('10:00 AM');
  });

  it('preserves historical Vancouver offsets before the final transition', () => {
    expect(
      formatScheduleTime({
        scheduledStartAtUtc: '2026-01-10T17:00:00.000Z',
        timeZone: 'America/Vancouver'
      })
    ).toBe('9:00 AM');
    expect(
      formatScheduleTime({
        scheduledStartAtUtc: '2026-03-08T09:59:59.000Z',
        timeZone: 'America/Vancouver'
      })
    ).toBe('1:59 AM');
    expect(
      formatScheduleTime({
        scheduledStartAtUtc: '2026-03-08T10:00:00.000Z',
        timeZone: 'America/Vancouver'
      })
    ).toBe('3:00 AM');
  });

  it('does not change schedule displays in other IANA timezones', () => {
    expect(
      formatScheduleTime({
        scheduledStartAtUtc: '2026-12-10T16:00:00.000Z',
        timeZone: 'America/Toronto'
      })
    ).toBe('11:00 AM');
  });

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

  it('displays an optional forward arrival range and preserves exact-time fallback', () => {
    const exact = {
      scheduledStartAtUtc: '2026-06-26T03:00:00.000Z', // 20:00 Vancouver June 25
      timeZone: 'America/Vancouver'
    };
    const ranged = {
      ...exact,
      arrivalWindowEndOffsetMinutes: 120
    };

    expect(formatScheduleArrivalTime(exact)).toBe('8:00 PM');
    expect(formatScheduleArrivalTime(ranged)).toBe('8:00 PM - 10:00 PM');
    expect(formatScheduleTime(ranged)).toBe('8:00 PM');
  });

  it('labels an arrival range that crosses local midnight', () => {
    expect(
      formatScheduleArrivalTime({
        scheduledStartAtUtc: '2026-06-26T06:00:00.000Z', // 23:00 Vancouver June 25
        timeZone: 'America/Vancouver',
        arrivalWindowEndOffsetMinutes: 120
      })
    ).toBe('11:00 PM - Fri 1:00 AM');
  });

  it('resolves arrival-window start and end zones independently at the transition', () => {
    expect(
      formatScheduleArrivalTime({
        scheduledStartAtUtc: '2026-03-08T09:30:00.000Z',
        timeZone: 'America/Vancouver',
        arrivalWindowEndOffsetMinutes: 60
      })
    ).toBe('1:30 AM - 3:30 AM');
  });

  it('uses permanent B.C. time for a winter arrival range across midnight', () => {
    expect(
      formatScheduleArrivalTime({
        scheduledStartAtUtc: '2026-12-11T06:30:00.000Z',
        timeZone: 'America/Vancouver',
        arrivalWindowEndOffsetMinutes: 120
      })
    ).toBe('11:30 PM - Fri 1:30 AM');
  });

  it('groups and sorts winter service-day visits using backend semantics', () => {
    const twoFiftyNine = {
      scheduledStartAtUtc: '2026-12-10T09:59:00.000Z',
      timeZone: 'America/Vancouver'
    };
    const threeAm = {
      scheduledStartAtUtc: '2026-12-10T10:00:00.000Z',
      timeZone: 'America/Vancouver'
    };
    const priorEvening = {
      scheduledStartAtUtc: '2026-12-10T06:30:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleServiceDayKey(twoFiftyNine)).toBe('2026-12-09');
    expect(getScheduleServiceDayKey(threeAm)).toBe('2026-12-10');
    expect(getScheduleSortTime(twoFiftyNine)).toBeGreaterThan(
      getScheduleSortTime(priorEvening)
    );
  });

  it('ignores invalid ranges and keeps grouping and sorting tied to the start', () => {
    const exact = {
      scheduledStartAtUtc: '2026-06-26T03:00:00.000Z',
      timeZone: 'America/Vancouver'
    };
    const ranged = {
      ...exact,
      arrivalWindowEndOffsetMinutes: 360
    };
    const invalid = {
      ...exact,
      arrivalWindowEndOffsetMinutes: 16
    };

    expect(formatScheduleArrivalTime(invalid)).toBe('8:00 PM');
    expect(getScheduleServiceDayKey(ranged)).toBe(getScheduleServiceDayKey(exact));
    expect(getScheduleSortTime(ranged)).toBe(getScheduleSortTime(exact));
  });
});
