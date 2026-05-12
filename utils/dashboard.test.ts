import { describe, expect, it } from '@jest/globals';

import { getRemainingTodaySchedules } from './dashboard';
import type { Schedule } from '@/types';

function buildSchedule(overrides: Partial<Schedule>): Schedule {
  return {
    id: overrides.id ?? 'schedule-1',
    invoiceRef: '',
    jobTitle: overrides.jobTitle ?? 'Test Job',
    location: '',
    startDateTime: overrides.startDateTime ?? '',
    scheduledStartAtUtc: overrides.scheduledStartAtUtc,
    timeZone: overrides.timeZone ?? 'America/Vancouver',
    assignedTechnicians: [],
    confirmed: true,
    hours: overrides.hours ?? 2,
    shifts: [],
    deadRun: false,
    actualServiceDurationMinutes: overrides.actualServiceDurationMinutes
  };
}

describe('dashboard schedule helpers', () => {
  it('moves past a completed morning job to the next upcoming visit', () => {
    const now = new Date('2026-05-12T19:45:00.000Z'); // 12:45 PM Vancouver
    const schedules = [
      buildSchedule({
        id: 'kinton-ramen',
        jobTitle: 'Kinton Ramen',
        scheduledStartAtUtc: '2026-05-12T16:00:00.000Z',
        hours: 4,
        actualServiceDurationMinutes: 120
      }),
      buildSchedule({
        id: 'one-pm-job',
        jobTitle: '1 PM Job',
        scheduledStartAtUtc: '2026-05-12T20:00:00.000Z',
        hours: 2
      })
    ];

    expect(getRemainingTodaySchedules(schedules, now).map((schedule) => schedule.id)).toEqual([
      'one-pm-job'
    ]);
  });

  it('uses updated scheduled hours when no actual duration has been recorded', () => {
    const now = new Date('2026-05-12T19:45:00.000Z'); // 12:45 PM Vancouver
    const schedules = [
      buildSchedule({
        id: 'kinton-ramen',
        scheduledStartAtUtc: '2026-05-12T16:00:00.000Z',
        hours: 2
      }),
      buildSchedule({
        id: 'one-pm-job',
        scheduledStartAtUtc: '2026-05-12T20:00:00.000Z',
        hours: 2
      })
    ];

    expect(getRemainingTodaySchedules(schedules, now).map((schedule) => schedule.id)).toEqual([
      'one-pm-job'
    ]);
  });
});
