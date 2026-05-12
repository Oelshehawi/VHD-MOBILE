import { describe, expect, it } from '@jest/globals';

import {
  formatScheduleDateReadable,
  formatScheduleTime,
  getScheduleDateKey,
  getScheduleHour,
  getScheduleSortTime,
  scheduleMatchesDateKey
} from './scheduleTime';

describe('schedule service-day time helpers', () => {
  it('keeps local midnight on its service day', () => {
    const schedule = {
      scheduledStartAtUtc: '2026-05-12T07:00:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleDateKey(schedule)).toBe('2026-05-12');
    expect(scheduleMatchesDateKey(schedule, '2026-05-12')).toBe(true);
    expect(formatScheduleDateReadable(schedule)).toBe('Tuesday, May 12, 2026');
    expect(formatScheduleTime(schedule)).toBe('12:00 AM');
    expect(getScheduleHour(schedule)).toBe(0);
  });

  it('sorts local midnight after later evening visits on that day', () => {
    const midnight = {
      scheduledStartAtUtc: '2026-05-12T07:00:00.000Z',
      timeZone: 'America/Vancouver'
    };
    const lateEvening = {
      scheduledStartAtUtc: '2026-05-13T06:30:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleDateKey(lateEvening)).toBe('2026-05-12');
    expect(formatScheduleTime(lateEvening)).toBe('11:30 PM');
    expect(getScheduleSortTime(midnight)).toBeGreaterThan(getScheduleSortTime(lateEvening));
  });

  it('sorts all jobs before 3 AM after the previous evening route order', () => {
    const twoFiftyNine = {
      scheduledStartAtUtc: '2026-05-12T09:59:00.000Z',
      timeZone: 'America/Vancouver'
    };
    const lateEvening = {
      scheduledStartAtUtc: '2026-05-13T06:30:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleDateKey(twoFiftyNine)).toBe('2026-05-12');
    expect(formatScheduleTime(twoFiftyNine)).toBe('2:59 AM');
    expect(getScheduleSortTime(twoFiftyNine)).toBeGreaterThan(getScheduleSortTime(lateEvening));
  });

  it('starts ordinary route ordering again at 3 AM', () => {
    const threeAm = {
      scheduledStartAtUtc: '2026-05-12T10:00:00.000Z',
      timeZone: 'America/Vancouver'
    };
    const lateEvening = {
      scheduledStartAtUtc: '2026-05-13T06:30:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleDateKey(threeAm)).toBe('2026-05-12');
    expect(formatScheduleTime(threeAm)).toBe('3:00 AM');
    expect(getScheduleSortTime(threeAm)).toBeLessThan(getScheduleSortTime(lateEvening));
  });

  it('still formats ordinary schedule times in the schedule timezone', () => {
    const schedule = {
      scheduledStartAtUtc: '2026-05-12T16:30:00.000Z',
      timeZone: 'America/Vancouver'
    };

    expect(getScheduleDateKey(schedule)).toBe('2026-05-12');
    expect(formatScheduleTime(schedule)).toBe('9:30 AM');
    expect(getScheduleHour(schedule)).toBe(9);
  });
});
