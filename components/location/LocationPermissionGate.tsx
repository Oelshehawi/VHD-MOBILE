import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import * as Location from 'expo-location';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { DEFAULT_ROW_COMPARATOR, useQuery } from '@powersync/react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Text } from '@/components/ui/text';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { locationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { refreshLocationTracking } from '@/services/location/LocationTrackingRefreshRunner';
import { useLocationPermissionState } from '@/components/location/useLocationPermissionState';
import type { TechnicianTrackingWindow } from '@/types';
import { debugLogger } from '@/utils/DebugLogger';

const SOON_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const RATIONALE_COPY =
  'VHD records depot and jobsite arrival/leave times during your scheduled travel windows. Choose "Allow all the time" so this works when the app is in the background.';

export function LocationPermissionGate() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isInitialized } = usePowerSyncStatus();
  const permissionState = useLocationPermissionState();
  const sheetRef = useRef<BottomSheet>(null);
  const dismissedKindRef = useRef<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

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

  const hasUpcomingWindow = useMemo(() => {
    if (!isReady) return false;
    const now = Date.now();
    const horizon = now + SOON_LOOKAHEAD_MS;
    return (windowsQuery.data ?? []).some((window) => {
      const startsAtMs = Date.parse(window.startsAtUtc);
      const endsAtMs = Date.parse(window.endsAtUtc);
      if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) return false;
      return endsAtMs >= now && startsAtMs <= horizon;
    });
  }, [isReady, windowsQuery.data]);

  const needsAttention =
    permissionState !== null &&
    permissionState.kind !== 'granted' &&
    permissionState.kind !== 'unavailable';

  const shouldShow = isReady && hasUpcomingWindow && needsAttention;

  useEffect(() => {
    if (!shouldShow || !permissionState) {
      sheetRef.current?.close();
      return;
    }
    if (dismissedKindRef.current === permissionState.kind) {
      return;
    }
    sheetRef.current?.expand();
  }, [shouldShow, permissionState]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior='close' />
    ),
    []
  );

  const handleAllow = useCallback(async () => {
    if (isWorking) return;
    setIsWorking(true);
    try {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.granted) {
        await Location.requestBackgroundPermissionsAsync();
      }
      await locationTrackingCoordinator.checkLocationPermissionStatus();
      await refreshLocationTracking('foreground');
    } catch (error) {
      debugLogger.warn('LOCATION', 'Permission gate Allow flow failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsWorking(false);
      sheetRef.current?.close();
    }
  }, [isWorking]);

  const handleOpenSettings = useCallback(async () => {
    if (isWorking) return;
    setIsWorking(true);
    try {
      await Linking.openSettings();
    } catch (error) {
      debugLogger.warn('LOCATION', 'Failed to open settings from permission gate', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsWorking(false);
      sheetRef.current?.close();
    }
  }, [isWorking]);

  const handleNotNow = useCallback(() => {
    if (permissionState) {
      dismissedKindRef.current = permissionState.kind;
    }
    sheetRef.current?.close();
  }, [permissionState]);

  if (!shouldShow || !permissionState) {
    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['1%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView>
          <View />
        </BottomSheetView>
      </BottomSheet>
    );
  }

  const showOpenSettings =
    (permissionState.kind === 'foreground-denied' && !permissionState.canAskAgain) ||
    (permissionState.kind === 'background-denied' && !permissionState.canAskAgain) ||
    permissionState.kind === 'services-disabled';

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={[360]}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView className='px-6 pb-8 pt-2'>
        <Text className='text-lg font-bold text-[#14110F] dark:text-white'>
          Allow location for tracking
        </Text>
        <Text className='mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300'>
          {RATIONALE_COPY}
        </Text>
        {permissionState.kind === 'services-disabled' && (
          <Text className='mt-2 text-sm font-medium text-amber-700 dark:text-amber-300'>
            Location services appear to be turned off. Enable them in Settings to continue.
          </Text>
        )}

        <View className='mt-6 gap-3'>
          {showOpenSettings ? (
            <Pressable
              onPress={handleOpenSettings}
              disabled={isWorking}
              className='items-center rounded-xl bg-[#14110F] px-4 py-4 dark:bg-amber-400'
            >
              <Text className='font-bold text-[#F7F5F1] dark:text-[#14110F]'>Open Settings</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleAllow}
              disabled={isWorking}
              className='items-center rounded-xl bg-[#14110F] px-4 py-4 dark:bg-amber-400'
            >
              <Text className='font-bold text-[#F7F5F1] dark:text-[#14110F]'>
                {isWorking ? 'Requesting…' : 'Allow location'}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleNotNow}
            disabled={isWorking}
            className='items-center rounded-xl border border-black/15 bg-white px-4 py-4 dark:border-white/20 dark:bg-[#16140F]'
          >
            <Text className='font-semibold text-[#14110F] dark:text-white'>Not now</Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
