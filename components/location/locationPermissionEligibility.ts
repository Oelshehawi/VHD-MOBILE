import type { TechnicianTrackingWindow } from '@/types';
import { isWindowInCurrentTrackingGenerationRange } from '@/services/location/businessDay';

const SOON_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

export function hasRelevantLocationPermissionWindow(args: {
  windows: ReadonlyArray<TechnicianTrackingWindow>;
  completedScheduleIds: ReadonlySet<string>;
  now?: Date;
}): boolean {
  const now = args.now ?? new Date();
  const nowMs = now.getTime();
  const horizon = nowMs + SOON_LOOKAHEAD_MS;

  return args.windows.some((window) => {
    if (args.completedScheduleIds.has(window.scheduleId)) return false;
    if (!isWindowInCurrentTrackingGenerationRange(window, now)) return false;

    const startsAtMs = Date.parse(window.startsAtUtc);
    const endsAtMs = Date.parse(window.endsAtUtc);
    if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) return false;

    return endsAtMs >= nowMs && startsAtMs <= horizon;
  });
}
