import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import * as Location from 'expo-location';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { DEFAULT_ROW_COMPARATOR, useQuery } from '@powersync/react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { locationTrackingCoordinator } from '@/services/location/LocationTrackingCoordinator';
import { refreshLocationTracking } from '@/services/location/LocationTrackingRefreshRunner';
import { useLocationPermissionState } from '@/components/location/useLocationPermissionState';
import { getLocationPermissionCopy } from '@/components/location/locationPermissionCopy';
import { hasRelevantLocationPermissionWindow } from '@/components/location/locationPermissionEligibility';
import type { TechnicianTrackingWindow } from '@/types';
import { debugLogger } from '@/utils/DebugLogger';

export function LocationPermissionGate() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isInitialized } = usePowerSyncStatus();
  const permissionState = useLocationPermissionState();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const dismissedKindRef = useRef<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const copy = getLocationPermissionCopy(Platform.OS);

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

  const openPermissionSheet = useCallback(() => {
    if (!permissionState) return;
    dismissedKindRef.current = null;
    sheetRef.current?.expand();
  }, [permissionState]);

  const showOpenSettings =
    permissionState !== null &&
    ((permissionState.kind === 'foreground-denied' && !permissionState.canAskAgain) ||
      (permissionState.kind === 'background-denied' && !permissionState.canAskAgain) ||
      permissionState.kind === 'services-disabled');

  const permissionSheet = permissionState ? (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={[420]}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView className='px-6 pb-8 pt-2'>
        <Text className='text-lg font-bold text-[#14110F] dark:text-white'>
          {copy.title}
        </Text>
        <Text className='mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300'>
          {copy.rationale}
        </Text>
        {copy.requiredSettings ? (
          <View className='mt-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/40'>
            <Text className='text-sm font-semibold text-red-900 dark:text-red-100'>
              {copy.requiredSettings.heading}
            </Text>
            <Text className='mt-1 text-sm leading-5 text-red-800 dark:text-red-200'>
              {copy.requiredSettings.detail}
            </Text>
          </View>
        ) : null}
        {permissionState.kind === 'services-disabled' && (
          <Text className='mt-3 text-sm font-medium text-amber-700 dark:text-amber-300'>
            Location Services appear to be turned off. Enable them in Settings to continue.
          </Text>
        )}
        {copy.settingsNote ? (
          <Text className='mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400'>
            {copy.settingsNote}
          </Text>
        ) : null}

        <View className='mt-6 gap-3'>
          {!showOpenSettings ? (
            <Pressable
              onPress={handleAllow}
              disabled={isWorking}
              className='items-center rounded-xl bg-[#14110F] px-4 py-4 dark:bg-amber-400'
            >
              <Text className='font-bold text-[#F7F5F1] dark:text-[#14110F]'>
                {isWorking ? 'Requesting…' : copy.requestLabel}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleOpenSettings}
            disabled={isWorking}
            className='items-center rounded-xl bg-red-700 px-4 py-4 dark:bg-red-500'
          >
            <Text className='font-bold text-white'>{copy.openSettingsLabel}</Text>
          </Pressable>
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
  ) : null;

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

  return (
    <>
      <Pressable
        onPress={openPermissionSheet}
        className='absolute left-3 right-3 z-50 rounded-xl border border-red-300 bg-red-600 px-4 py-3 shadow-lg dark:border-red-800 dark:bg-red-700'
        style={{ top: Math.max(insets.top + 8, 14) }}
      >
        <Text className='text-sm font-bold text-white'>Location tracking needs attention</Text>
        <Text className='mt-0.5 text-xs leading-4 text-red-50'>
          {copy.banner(permissionState.kind)}
        </Text>
      </Pressable>
      {permissionSheet}
    </>
  );
}
