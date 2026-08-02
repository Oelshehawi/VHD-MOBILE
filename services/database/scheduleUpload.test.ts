import { describe, expect, it } from '@jest/globals';

import { getMobileScheduleUploadData } from './scheduleUpload';

describe('mobile schedule upload ownership', () => {
  it('allows only technician notes and actual service duration', () => {
    expect(
      getMobileScheduleUploadData({
        technicianNotes: 'Roof access is through the rear stairwell.',
        actualServiceDurationMinutes: 135,
        scheduledStartAtUtc: '2026-12-10T17:00:00.000Z',
        timeZone: 'Etc/GMT+7',
        arrivalWindowEndOffsetMinutes: 120,
        startDateTime: '2026-12-10T09:00:00.000Z'
      })
    ).toEqual({
      technicianNotes: 'Roof access is through the rear stairwell.',
      actualServiceDurationMinutes: 135
    });
  });

  it('drops a schedule mutation containing only backend-owned fields', () => {
    expect(
      getMobileScheduleUploadData({
        scheduledStartAtUtc: '2026-12-10T17:00:00.000Z',
        timeZone: 'America/Vancouver'
      })
    ).toEqual({});
  });
});
