import { useMemo } from 'react';
import { DEFAULT_ROW_COMPARATOR, useQuery } from '@powersync/react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { hasRelevantLocationPermissionWindow } from '@/components/location/locationPermissionEligibility';
import type { TechnicianTrackingWindow } from '@/types';
import { isFieldTrackerMetadata, isManagerMetadata } from '@/utils/userRoles';

export interface UpcomingTrackingWindow {
  isReady: boolean;
  isFieldTracker: boolean;
  hasUpcomingWindow: boolean;
}

// Shared "is this a field tracker with a relevant upcoming window" computation
// consumed by both LocationPermissionGate and BatteryOptimizationGate. Keeps the
// two PowerSync queries and the eligibility check in one place.
export function useUpcomingTrackingWindow(): UpcomingTrackingWindow {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isInitialized } = usePowerSyncStatus();

  const isManager = isManagerMetadata(user?.publicMetadata);
  const isFieldTracker = isFieldTrackerMetadata(user?.publicMetadata) && !isManager;
  const isReady = isLoaded && isUserLoaded && isSignedIn && isInitialized && isFieldTracker;

  const windowsQuery = useQuery<TechnicianTrackingWindow>(
    isReady
      ? `SELECT * FROM techniciantrackingwindows
         WHERE technicianId = ?
           AND status IN ('planned', 'active')
         ORDER BY startsAtUtc ASC`
      : `SELECT * FROM techniciantrackingwindows WHERE 0`,
    [userId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const completedSchedulesQuery = useQuery<{ id?: string | null }>(
    isReady
      ? `SELECT id FROM schedules
         WHERE actualServiceDurationMinutes IS NOT NULL`
      : `SELECT id FROM schedules WHERE 0`,
    [],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const hasUpcomingWindow = useMemo(() => {
    if (!isReady) return false;
    const completedScheduleIds = new Set(
      (completedSchedulesQuery.data ?? [])
        .map((schedule) => schedule.id)
        .filter((id): id is string => Boolean(id))
    );
    return hasRelevantLocationPermissionWindow({
      windows: windowsQuery.data ?? [],
      completedScheduleIds
    });
  }, [completedSchedulesQuery.data, isReady, windowsQuery.data]);

  return { isReady, isFieldTracker, hasUpcomingWindow };
}
