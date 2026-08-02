const MOBILE_WRITABLE_SCHEDULE_FIELDS = [
  'technicianNotes',
  'actualServiceDurationMinutes'
] as const;

/**
 * Mobile owns only technician notes and the observed duration captured by the
 * report workflow. Schedule timing, timezone, and arrival-window fields remain
 * backend/web owned even if they are present in the local PowerSync row.
 */
export function getMobileScheduleUploadData(
  data: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!data) return {};

  const uploadData: Record<string, unknown> = {};
  for (const field of MOBILE_WRITABLE_SCHEDULE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      uploadData[field] = data[field];
    }
  }
  return uploadData;
}
