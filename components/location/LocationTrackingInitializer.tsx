import { useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { locationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { refreshLocationTracking } from '@/services/location/LocationTrackingRefreshRunner';
import { debugLogger } from '@/utils/DebugLogger';

const COORDINATOR_TICK_MS = 60 * 1000;

export function LocationTrackingInitializer() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isInitialized } = usePowerSyncStatus();
  const [tick, setTick] = useState(0);
  const hasCachedTokenRef = useRef(false);
  const hasStoppedForSignedOutRef = useRef(false);
  const hasStoppedForNonTechnicianRef = useRef(false);

  const isManager = user?.publicMetadata?.isManager === true;
  const isTechnician = user?.publicMetadata?.isTechnician === true && !isManager;
  const isReady = isLoaded && isUserLoaded && isSignedIn && isInitialized && isTechnician;

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

    void refreshLocationTracking(tick === 0 ? 'mount' : 'foreground').catch((error) => {
      debugLogger.error('LOCATION', 'Location tracking refresh failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, [isReady, tick]);

  return null;
}
