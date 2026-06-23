import { describe, expect, it } from '@jest/globals';

import { calculateActualServiceDurationMinutes } from './scheduleTime';
import { resolveReportDateCompleted } from './reportCompletion';

describe('resolveReportDateCompleted', () => {
  it('uses the prior service-day date for a true post-midnight job', () => {
    // True instant: June 26 00:00 Vancouver — belongs to the June 25 service day.
    const scheduleSource = {
      scheduledStartAtUtc: '2026-06-26T07:00:00.000Z',
      timeZone: 'America/Vancouver'
    };
    // Submitted at ~02:00 Vancouver (the physical calendar date is June 26).
    const completedAt = new Date('2026-06-26T09:00:00.000Z');

    expect(resolveReportDateCompleted(scheduleSource, completedAt)).toBe(
      '2026-06-25T00:00:00.000Z'
    );
    // Duration is measured from the true scheduled start (no double-shift).
    expect(calculateActualServiceDurationMinutes(scheduleSource, completedAt)).toBe(120);
  });

  it('keeps the submission-day date for an ordinary daytime job', () => {
    const scheduleSource = {
      scheduledStartAtUtc: '2026-06-25T16:00:00.000Z', // 09:00 Vancouver
      timeZone: 'America/Vancouver'
    };
    const completedAt = new Date('2026-06-25T18:00:00.000Z'); // 11:00 Vancouver

    expect(resolveReportDateCompleted(scheduleSource, completedAt)).toBe(
      '2026-06-25T00:00:00.000Z'
    );
  });
});
