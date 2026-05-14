import { describe, expect, it } from '@jest/globals';
import { hasRelevantLocationPermissionWindow } from '@/components/location/locationPermissionEligibility';
import type { TechnicianTrackingWindow } from '@/types';

function trackingWindow(
  overrides: Partial<TechnicianTrackingWindow> & { id: string; scheduleId: string }
): TechnicianTrackingWindow {
  const { id, scheduleId, ...rest } = overrides;
  return {
    id,
    technicianId: 'tech-a',
    scheduleId,
    serviceJobId: `job-${id}`,
    status: 'planned',
    scheduledStartAtUtc: '2026-05-14T17:00:00.000Z',
    timeZone: 'America/Vancouver',
    startsAtUtc: '2026-05-14T16:00:00.000Z',
    endsAtUtc: '2026-05-14T23:00:00.000Z',
    expectedDurationMinutes: 120,
    travelTimeMinutes: 30,
    depot: '',
    jobSite: '',
    locationUpdateMode: 'travel_only',
    pingIntervalSeconds: 600,
    distanceIntervalMeters: 750,
    updatedAt: '2026-05-14T12:00:00.000Z',
    ...rest
  };
}

describe('hasRelevantLocationPermissionWindow', () => {
  const now = new Date('2026-05-14T18:00:00.000Z');

  it('returns true for a current business-day incomplete window', () => {
    expect(
      hasRelevantLocationPermissionWindow({
        windows: [trackingWindow({ id: 'today', scheduleId: 'schedule-today' })],
        completedScheduleIds: new Set(),
        now
      })
    ).toBe(true);
  });

  it('excludes next-day synced windows', () => {
    expect(
      hasRelevantLocationPermissionWindow({
        windows: [
          trackingWindow({
            id: 'tomorrow',
            scheduleId: 'schedule-tomorrow',
            scheduledStartAtUtc: '2026-05-15T17:00:00.000Z',
            startsAtUtc: '2026-05-15T16:00:00.000Z',
            endsAtUtc: '2026-05-15T23:00:00.000Z'
          })
        ],
        completedScheduleIds: new Set(),
        now
      })
    ).toBe(false);
  });

  it('includes next-day pre-cutoff windows whose tracking starts tonight', () => {
    const lateNight = new Date('2026-05-15T06:30:00.000Z'); // 2026-05-14 23:30 Vancouver

    expect(
      hasRelevantLocationPermissionWindow({
        windows: [
          trackingWindow({
            id: 'midnight',
            scheduleId: 'schedule-midnight',
            scheduledStartAtUtc: '2026-05-15T07:00:00.000Z',
            startsAtUtc: '2026-05-15T06:00:00.000Z',
            endsAtUtc: '2026-05-15T11:45:00.000Z'
          })
        ],
        completedScheduleIds: new Set(),
        now: lateNight
      })
    ).toBe(true);
  });

  it('excludes locally completed schedules', () => {
    expect(
      hasRelevantLocationPermissionWindow({
        windows: [trackingWindow({ id: 'done', scheduleId: 'schedule-done' })],
        completedScheduleIds: new Set(['schedule-done']),
        now
      })
    ).toBe(false);
  });
});
