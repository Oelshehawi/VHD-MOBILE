import { useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { locationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { refreshLocationTracking } from '@/services/location/LocationTrackingRefreshRunner';
import { debugLogger } from '@/utils/DebugLogger';
import { isFieldTrackerMetadata, isManagerMetadata } from '@/utils/userRoles';
import { getMobileStaffIdentity } from '@/utils/staffIdentity';
import { forgetLocationOwner, rememberLocationOwner } from '@/services/location/LocationAccount';
import { clearBackgroundToken } from '@/services/background/BackgroundAuth';
import { readLocationTrackingState } from '@/services/location/LocationTrackingState';

const COORDINATOR_TICK_MS = 60 * 1000;

export function LocationTrackingInitializer() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isInitialized } = usePowerSyncStatus();
  const [tick, setTick] = useState(0);
  const hasCachedTokenRef = useRef(false);
  const hasStoppedForSignedOutRef = useRef(false);
  const hasStoppedForNonFieldTrackerRef = useRef(false);

  const isManager = isManagerMetadata(user?.publicMetadata);
  const isFieldTracker = isFieldTrackerMetadata(user?.publicMetadata) && !isManager;
  const isReady = isLoaded && isUserLoaded && isSignedIn && isFieldTracker;

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      hasCachedTokenRef.current = false;
      hasStoppedForNonFieldTrackerRef.current = false;
      if (hasStoppedForSignedOutRef.current) {
        return;
      }
      hasStoppedForSignedOutRef.current = true;
      void forgetLocationOwner().then(() => clearBackgroundToken()).then(() => locationTrackingCoordinator.stop('signed-out'));
      return;
    }

    hasStoppedForSignedOutRef.current = false;

    if (!isUserLoaded) {
      return;
    }

    if (!isFieldTracker) {
      hasCachedTokenRef.current = false;
      if (hasStoppedForNonFieldTrackerRef.current) {
        return;
      }
      hasStoppedForNonFieldTrackerRef.current = true;
      void forgetLocationOwner().then(() => clearBackgroundToken()).then(() => locationTrackingCoordinator.stop('not-field-tracker'));
      return;
    }

    hasStoppedForNonFieldTrackerRef.current = false;

    if (!isInitialized) {
      return;
    }

    if (hasCachedTokenRef.current) {
      return;
    }

    hasCachedTokenRef.current = true;
    void getBackgroundToken();
  }, [isInitialized, isLoaded, isSignedIn, isFieldTracker, isUserLoaded]);

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

    const identity = getMobileStaffIdentity(user?.publicMetadata);
    if (!identity?.fieldStaffId) return;
    let cancelled = false;
    void (async () => {
      const state = await readLocationTrackingState();
      if (state.ownerAppUserId && state.ownerAppUserId !== identity.appUserId) await locationTrackingCoordinator.stop('account-changed');
      if (cancelled) return;
      await rememberLocationOwner({ appUserId: identity.appUserId, fieldStaffId: identity.fieldStaffId! });
      await refreshLocationTracking(tick === 0 ? 'mount' : 'foreground');
    })().catch((error) => {
      debugLogger.error('LOCATION', 'Location tracking refresh failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
    return () => { cancelled = true; };
  }, [isReady, isInitialized, tick, user?.publicMetadata]);

  return null;
}
