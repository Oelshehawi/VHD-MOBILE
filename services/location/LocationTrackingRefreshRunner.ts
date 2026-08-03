import type { TechnicianTrackingWindow } from '@/types';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { locationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { debugLogger } from '@/utils/DebugLogger';
import { system as powerSyncSystem } from '@/services/database/System';
import { isFieldTrackerMetadata, isManagerMetadata } from '@/utils/userRoles';
import { getMobileStaffIdentity } from '@/utils/staffIdentity';

export type LocationRefreshTrigger =
  | 'foreground'
  | 'background-task'
  | 'app-resume'
  | 'mount'
  | 'geofence-wake';

export const ACTIVE_TRACKING_WINDOWS_SQL = `SELECT * FROM techniciantrackingwindows
         WHERE technicianId = ?
           AND status IN ('planned', 'active')
         ORDER BY startsAtUtc ASC`;

let inFlight: Promise<void> | null = null;
let pendingTrigger: LocationRefreshTrigger | null = null;

async function resolveTechnicianId(): Promise<string | null> {
  try {
    const { getClerkInstance } = await import('@clerk/clerk-expo');
    const clerk = getClerkInstance({
      publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    });
    const fieldStaffId = getMobileStaffIdentity(clerk?.user?.publicMetadata)?.fieldStaffId;
    const isManager = isManagerMetadata(clerk?.user?.publicMetadata);
    const isFieldTracker = isFieldTrackerMetadata(clerk?.user?.publicMetadata) && !isManager;
    if (!fieldStaffId || !isFieldTracker) {
      return null;
    }
    return fieldStaffId;
  } catch {
    return null;
  }
}

async function readActiveTrackingWindows(
  technicianId: string
): Promise<TechnicianTrackingWindow[] | null> {
  const db = powerSyncSystem.powersync;
  if (!db || typeof db.getAll !== 'function') {
    return null;
  }

  try {
    return await db.getAll<TechnicianTrackingWindow>(ACTIVE_TRACKING_WINDOWS_SQL, [technicianId]);
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to read tracking windows for refresh', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function refreshLocationTracking(trigger: LocationRefreshTrigger): Promise<void> {
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const technicianId = await resolveTechnicianId();
      if (!technicianId) {
        debugLogger.debug('LOCATION', 'Skipping location tracking refresh; no technician', {
          trigger
        });
        return;
      }

      await getBackgroundToken();

      const windows = await readActiveTrackingWindows(technicianId);
      if (windows === null) {
        debugLogger.debug('LOCATION', 'Skipping location tracking refresh; PowerSync not ready', {
          trigger
        });
        return;
      }

      await locationTrackingCoordinator.sync(windows);

      debugLogger.info('LOCATION', 'Location tracking refresh completed', {
        trigger,
        windowCount: windows.length
      });
    } catch (error) {
      debugLogger.error('LOCATION', 'Location tracking refresh failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }

  const nextTrigger = pendingTrigger;
  pendingTrigger = null;
  if (nextTrigger) {
    await refreshLocationTracking(nextTrigger);
  }
}

export async function refreshLocationTrackingAfterClosure(): Promise<void> {
  if (inFlight) {
    // A location upload can confirm closure while this refresh is inside the
    // coordinator. Awaiting the same promise from that call stack deadlocks;
    // queue one follow-up pass and let the active refresh finish first.
    pendingTrigger = 'background-task';
    return;
  }

  await refreshLocationTracking('background-task');
}
