import { useMemo } from 'react';
import { DEFAULT_ROW_COMPARATOR, useQuery } from '@powersync/react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { hasRelevantLocationPermissionWindow } from '@/components/location/locationPermissionEligibility';
import type { TechnicianTrackingWindow } from '@/types';
import { isFieldTrackerMetadata, isManagerMetadata } from '@/utils/userRoles';
import { getMobileStaffIdentity } from '@/utils/staffIdentity';

export interface UpcomingTrackingWindow {
  isReady: boolean;
  isFieldTracker: boolean;
  hasUpcomingWindow: boolean;
}

// Shared "is this a field tracker with a relevant upcoming window" computation
// consumed by both LocationPermissionGate and BatteryOptimizationGate. Keeps the
// two PowerSync queries and the eligibility check in one place.
export function useUpcomingTrackingWindow(): UpcomingTrackingWindow {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isInitialized } = usePowerSyncStatus();

  const isManager = isManagerMetadata(user?.publicMetadata);
  const isFieldTracker = isFieldTrackerMetadata(user?.publicMetadata) && !isManager;
  const fieldStaffId = getMobileStaffIdentity(user?.publicMetadata)?.fieldStaffId;
  const isReady =
    isLoaded && isUserLoaded && isSignedIn && isInitialized && isFieldTracker && !!fieldStaffId;

  const windowsQuery = useQuery<TechnicianTrackingWindow>(
    isReady
      ? `SELECT * FROM techniciantrackingwindows
         WHERE technicianId = ?
           AND status IN ('planned', 'active')
         ORDER BY startsAtUtc ASC`
      : `SELECT * FROM techniciantrackingwindows WHERE 0`,
    [fieldStaffId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const hasUpcomingWindow = useMemo(() => {
    if (!isReady) return false;
    return hasRelevantLocationPermissionWindow({
      windows: windowsQuery.data ?? []
    });
  }, [isReady, windowsQuery.data]);

  return { isReady, isFieldTracker, hasUpcomingWindow };
}
