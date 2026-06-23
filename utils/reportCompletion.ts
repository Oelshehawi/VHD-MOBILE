import {
  getScheduleServiceDayUtcIso,
  isPostMidnightServiceTime
} from './scheduleTime';
import { formatVancouverDateAsUtcDateOnly } from './date';

type ReportScheduleSource = {
  scheduledStartAtUtc?: string | null;
  startDateTime?: string | null;
  timeZone?: string | null;
};

/**
 * Completion date stored on a report. For true post-midnight (00:00–02:59)
 * jobs this is the prior service-day date — the physical submission instant
 * lands on the next calendar day, but the visit belongs to the previous
 * service day. Normal jobs keep the submission-day (Vancouver) date.
 */
export function resolveReportDateCompleted(
  scheduleSource: ReportScheduleSource,
  completedAt: Date
): string {
  if (isPostMidnightServiceTime(scheduleSource)) {
    return (
      getScheduleServiceDayUtcIso(scheduleSource) ||
      formatVancouverDateAsUtcDateOnly(completedAt)
    );
  }
  return formatVancouverDateAsUtcDateOnly(completedAt);
}
