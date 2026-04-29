import { router } from 'expo-router';

interface OpenReportParams {
  scheduleId: string;
  jobTitle?: string | null;
  scheduledStartAtUtc?: string | null;
  timeZone?: string | null;
  technicianId?: string | null;
}

export function openReport({
  scheduleId,
  jobTitle,
  scheduledStartAtUtc,
  timeZone,
  technicianId
}: OpenReportParams) {
  router.push({
    pathname: '/report',
    params: {
      scheduleId,
      jobTitle: jobTitle ?? '',
      scheduledStartAtUtc: scheduledStartAtUtc ?? '',
      timeZone: timeZone ?? '',
      technicianId: technicianId ?? ''
    }
  });
}
