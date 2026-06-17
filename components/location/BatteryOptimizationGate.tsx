import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, useColorScheme, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useLocationPermissionState } from '@/components/location/useLocationPermissionState';
import { useUpcomingTrackingWindow } from '@/components/location/useUpcomingTrackingWindow';
import { batteryHintCopy } from '@/components/location/batteryHintCopy';
import { shouldShowBatteryHint } from '@/components/location/batteryHintEligibility';
import {
  getBatteryHintAcknowledged,
  setBatteryHintAcknowledged
} from '@/services/location/batteryHint';
import { debugLogger } from '@/utils/DebugLogger';

// Android-only, one-time nudge guiding field workers to mark VHD's battery usage
// "Unrestricted" so OEM power management cannot suppress geofence delivery. Shows
// once after location is fully granted, then persists an acknowledgement. See
// batteryHintEligibility / batteryHintCopy for the (testable) logic and wording.
export function BatteryOptimizationGate() {
  const isAndroid = Platform.OS === 'android';
  const { isReady, isFieldTracker, hasUpcomingWindow } = useUpcomingTrackingWindow();
  const permissionState = useLocationPermissionState();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const sessionDismissedRef = useRef(false);
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const sheetBackgroundColor = isDark ? '#16140F' : '#FFFFFF';

  useEffect(() => {
    let cancelled = false;
    void getBatteryHintAcknowledged().then((value) => {
      if (!cancelled) setAcknowledged(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const permissionGranted = permissionState?.kind === 'granted';
  const eligible =
    acknowledged !== null &&
    shouldShowBatteryHint({
      isAndroid,
      isFieldTracker: isReady && isFieldTracker,
      permissionGranted,
      hasUpcomingWindow,
      acknowledged
    });
  const shouldShow = eligible && !sessionDismissedRef.current;

  useEffect(() => {
    if (!shouldShow) {
      sheetRef.current?.close();
      return;
    }
    sheetRef.current?.expand();
  }, [shouldShow]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior='close' />
    ),
    []
  );

  const handleOpenSettings = useCallback(async () => {
    if (isWorking) return;
    setIsWorking(true);
    try {
      await Linking.openSettings();
      // We cannot verify the OEM battery setting, so assume the user completed it
      // once they've been deep-linked to app settings, and don't nudge again.
      await setBatteryHintAcknowledged();
      setAcknowledged(true);
    } catch (error) {
      debugLogger.warn('LOCATION', 'Failed to open settings from battery hint gate', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsWorking(false);
      sheetRef.current?.close();
    }
  }, [isWorking]);

  const handleNotNow = useCallback(() => {
    // Session-only dismiss (no persist): re-evaluated on next launch.
    sessionDismissedRef.current = true;
    sheetRef.current?.close();
  }, []);

  const openHintSheet = useCallback(() => {
    sessionDismissedRef.current = false;
    sheetRef.current?.expand();
  }, []);

  if (!isAndroid || !shouldShow) {
    return null;
  }

  return (
    <>
      <Pressable
        onPress={openHintSheet}
        className='absolute left-3 right-3 z-50 rounded-xl border border-amber-300 bg-amber-500 px-4 py-3 shadow-lg dark:border-amber-700 dark:bg-amber-600'
        style={{ top: Math.max(insets.top + 8, 14) }}
      >
        <Text className='text-sm font-bold text-[#14110F] dark:text-white'>
          Keep job tracking running
        </Text>
        <Text className='mt-0.5 text-xs leading-4 text-[#14110F]/80 dark:text-amber-50'>
          {batteryHintCopy.banner}
        </Text>
      </Pressable>
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={[460]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: sheetBackgroundColor }}
        handleIndicatorStyle={{ backgroundColor: isDark ? '#A8A29E' : '#78716C' }}
      >
        <BottomSheetView className='bg-white px-6 pb-8 pt-2 dark:bg-[#16140F]'>
          <Text className='text-lg font-bold text-[#14110F] dark:text-white'>
            {batteryHintCopy.title}
          </Text>
          <Text className='mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300'>
            {batteryHintCopy.body}
          </Text>
          <View className='mt-4 gap-2'>
            {batteryHintCopy.steps.map((step, index) => (
              <View key={step} className='flex-row gap-2'>
                <Text className='text-sm font-semibold text-amber-700 dark:text-amber-300'>
                  {index + 1}.
                </Text>
                <Text className='flex-1 text-sm leading-5 text-gray-700 dark:text-gray-200'>
                  {step}
                </Text>
              </View>
            ))}
          </View>

          <View className='mt-6 gap-3'>
            <Pressable
              onPress={handleOpenSettings}
              disabled={isWorking}
              className='items-center rounded-xl bg-[#14110F] px-4 py-4 dark:bg-amber-400'
            >
              <Text className='font-bold text-[#F7F5F1] dark:text-[#14110F]'>
                {batteryHintCopy.openLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleNotNow}
              disabled={isWorking}
              className='items-center rounded-xl border border-black/15 bg-white px-4 py-4 dark:border-white/20 dark:bg-[#16140F]'
            >
              <Text className='font-semibold text-[#14110F] dark:text-white'>
                {batteryHintCopy.dismissLabel}
              </Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheet>
    </>
  );
}
