type ReportRequirementSource = {
  requiresReport?: boolean | number | string | null;
};

export function isScheduleReportRequired(schedule: ReportRequirementSource): boolean {
  const value = schedule.requiresReport;
  return !(value === false || value === 0 || value === '0' || value === 'false');
}
