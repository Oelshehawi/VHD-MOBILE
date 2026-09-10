import type { ReportStatus } from '@/types/report';

export type ReportSaveIntent = 'draft' | 'submit';

export function resolveReportStatusForSave(
  intent: ReportSaveIntent
): Extract<ReportStatus, 'draft' | 'completed'> {
  return intent === 'submit' ? 'completed' : 'draft';
}
