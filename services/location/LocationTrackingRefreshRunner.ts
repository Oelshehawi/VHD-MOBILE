import type { TechnicianTrackingWindow } from '@/types';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { locationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { debugLogger } from '@/utils/DebugLogger';
import { system as powerSyncSystem } from '@/services/database/System';
import { isManagerMetadata, isTechnicianMetadata } from '@/utils/userRoles';

export type LocationRefreshTrigger =
  | 'foreground'
  | 'background-task'
  | 'app-resume'
  | 'mount';

export const ACTIVE_TRACKING_WINDOWS_SQL = `SELECT * FROM techniciantrackingwindows
         WHERE technicianId = ?
           AND status IN ('planned', 'active')
         ORDER BY startsAtUtc ASC`;

export const COMPLETED_SCHEDULE_IDS_SQL = `SELECT id FROM schedules
         WHERE actualServiceDurationMinutes IS NOT NULL`;

let inFlight: Promise<void> | null = null;

async function resolveTechnicianId(): Promise<string | null> {
  try {
    const { getClerkInstance } = await import('@clerk/clerk-expo');
    const clerk = getClerkInstance({
      publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    });
    const userId = clerk?.user?.id ?? null;
    const isManager = isManagerMetadata(clerk?.user?.publicMetadata);
    const isTechnician = isTechnicianMetadata(clerk?.user?.publicMetadata) && !isManager;
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

async function readCompletedScheduleIds(): Promise<ReadonlySet<string> | null> {
  const db = powerSyncSystem.powersync;
  if (!db || typeof db.getAll !== 'function') {
    return null;
  }

  try {
    const rows = await db.getAll<{ id?: string | null }>(COMPLETED_SCHEDULE_IDS_SQL);
    return new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id)));
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to read completed schedules for refresh', {
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

      const completedScheduleIds = await readCompletedScheduleIds();
      if (completedScheduleIds === null) {
        debugLogger.debug('LOCATION', 'Skipping location tracking refresh; schedules not ready', {
          trigger
        });
        return;
      }

      await locationTrackingCoordinator.sync(windows, completedScheduleIds);

      debugLogger.info('LOCATION', 'Location tracking refresh completed', {
        trigger,
        windowCount: windows.length,
        completedScheduleCount: completedScheduleIds.size
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
