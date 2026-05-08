import type { TechnicianTrackingWindow } from '@/types';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { locationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { debugLogger } from '@/utils/DebugLogger';
import { system as powerSyncSystem } from '@/services/database/System';

export type LocationRefreshTrigger =
  | 'foreground'
  | 'background-task'
  | 'app-resume'
  | 'mount';

export const ACTIVE_TRACKING_WINDOWS_SQL = `SELECT * FROM techniciantrackingwindows
         WHERE technicianId = ?
           AND status IN ('planned', 'active')
         ORDER BY startsAtUtc ASC`;

let inFlight: Promise<void> | null = null;

async function resolveTechnicianId(): Promise<string | null> {
  try {
    const { getClerkInstance } = await import('@clerk/clerk-expo');
    const clerk = getClerkInstance({
      publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    });
    const userId = clerk?.user?.id ?? null;
    const isManager = clerk?.user?.publicMetadata?.isManager === true;
    const isTechnician = clerk?.user?.publicMetadata?.isTechnician === true && !isManager;
    if (!userId || !isTechnician) {
      return null;
    }
    return userId;
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
}
