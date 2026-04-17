import { router } from 'expo-router';

interface OpenReportParams {
  scheduleId: string;
  jobTitle?: string | null;
  startDateTime?: string | null;
  technicianId?: string | null;
}

export function openReport({
  scheduleId,
  jobTitle,
  startDateTime,
  technicianId
}: OpenReportParams) {
  router.push({
    pathname: '/report',
    params: {
      scheduleId,
      jobTitle: jobTitle ?? '',
      startDateTime: startDateTime ?? '',
      technicianId: technicianId ?? ''
    }
  });
}
