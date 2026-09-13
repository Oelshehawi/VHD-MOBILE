import type { TrackingHealthSnapshot } from '@/services/location/TrackingHealth';

export function trackingAttention(health: TrackingHealthSnapshot | null, now = Date.now()): string | null {
  if (!health) return null;
  switch (health.permissionKind) {
    case 'foreground-denied': return 'Location permission is off.';
    case 'background-denied': return 'Background location permission is off.';
    case 'services-disabled': return 'Location Services are off.';
    case 'precision-reduced': return 'Precise Location is off.';
    case 'unavailable': return 'Location settings could not be checked.';
  }
  // Runtime 2.0.0 has no native iOS precision diagnostic. An unknown value is
  // informational and must not create a permanent warning for otherwise-granted
  // location permissions.
  if (health.backgroundRefresh === 'denied' || health.backgroundRefresh === 'restricted') return 'Background App Refresh is restricted.';
  if (health.batteryRestricted) return 'Battery settings restrict background activity.';
  if (health.lastErrorCode === 'AUTH_UNAVAILABLE' || health.lastErrorCode === 'HTTP_401') return 'Location uploads are waiting for sign-in recovery.';
  if (health.queueDepth && health.oldestQueuedAt && now - Date.parse(health.oldestQueuedAt) > 120000) return `${health.queueDepth} location events are waiting for upload.`;
  if (health.activeWindowCount && !health.locationUpdatesRunning) return 'Scheduled location updates are not running.';
  if (health.activeWindowCount && (!health.lastCaptureAt || now - Date.parse(health.lastCaptureAt) > 300000)) return 'No recent GPS sample. The cause is not yet confirmed.';
  if (health.activeWindowCount && (health.lastAccuracyMeters ?? 0) > 150) return 'GPS accuracy is currently low.';
  return null;
}

export const TRACKING_REMINDER_INTERVAL_MS = 15 * 60000;
export function shouldRemindTracking(args: { foreground: boolean; needsAttention: boolean; lastShownAt: number; now: number }): boolean {
  return args.foreground && args.needsAttention && args.now - args.lastShownAt >= TRACKING_REMINDER_INTERVAL_MS;
}
