import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ROW_COMPARATOR, useQuery } from '@powersync/react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import type { TechnicianTrackingWindow } from '@/types';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { locationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { debugLogger } from '@/utils/DebugLogger';

const COORDINATOR_TICK_MS = 60 * 1000;

export function LocationTrackingInitializer() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isInitialized } = usePowerSyncStatus();
  const [tick, setTick] = useState(0);
  const hasCachedTokenRef = useRef(false);
  const hasStoppedForSignedOutRef = useRef(false);
  const hasStoppedForNonTechnicianRef = useRef(false);

  const isManager = user?.publicMetadata?.isManager === true;
  const isTechnician = user?.publicMetadata?.isTechnician === true && !isManager;
  const isReady = isLoaded && isUserLoaded && isSignedIn && isInitialized && isTechnician;
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

  const windows = useMemo(() => windowsQuery.data ?? [], [windowsQuery.data]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      hasCachedTokenRef.current = false;
      hasStoppedForNonTechnicianRef.current = false;
      if (hasStoppedForSignedOutRef.current) {
        return;
      }
      hasStoppedForSignedOutRef.current = true;
      void locationTrackingCoordinator.stop('signed-out');
      return;
    }

    hasStoppedForSignedOutRef.current = false;

    if (!isUserLoaded) {
      return;
    }

    if (!isTechnician) {
      hasCachedTokenRef.current = false;
      if (hasStoppedForNonTechnicianRef.current) {
        return;
      }
      hasStoppedForNonTechnicianRef.current = true;
      void locationTrackingCoordinator.stop('not-technician');
      return;
    }

    hasStoppedForNonTechnicianRef.current = false;

    if (!isInitialized) {
      return;
    }

    if (hasCachedTokenRef.current) {
      return;
    }

    hasCachedTokenRef.current = true;
    void getBackgroundToken();
  }, [isInitialized, isLoaded, isSignedIn, isTechnician, isUserLoaded]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const interval = setInterval(() => {
      setTick((value) => value + 1);
    }, COORDINATOR_TICK_MS);

    return () => clearInterval(interval);
  }, [isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void locationTrackingCoordinator.sync(windows).catch((error) => {
      debugLogger.error('LOCATION', 'Location tracking coordinator sync failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, [isReady, tick, windows]);

  return null;
}
