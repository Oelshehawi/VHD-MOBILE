import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Text } from '@/components/ui/text';
import { isFieldTrackerMetadata, isManagerMetadata } from '@/utils/userRoles';
import { reportTrackingHealth, subscribeTrackingHealth, type TrackingHealthSnapshot } from '@/services/location/TrackingHealth';
import { refreshLocationTracking } from '@/services/location/LocationTrackingRefreshRunner';
import { getLocationMeta, setLocationMeta } from '@/services/location/LocationOutbox';
import { shouldRemindTracking, trackingAttention } from './trackingAttention';

export function LocationPermissionGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const eligible = isLoaded && isSignedIn && isFieldTrackerMetadata(user?.publicMetadata) && !isManagerMetadata(user?.publicMetadata);
  const insets = useSafeAreaInsets();
  const [health, setHealth] = useState<TrackingHealthSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [renderedMessage, setRenderedMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [tick, setTick] = useState(0);
  const lastShown = useRef<number | null>(null);
  const reminderKey = `trackingReminder:${user?.id ?? ''}`;
  const attention = eligible ? trackingAttention(health) : null;

  useEffect(() => {
    setHealth(null);
    lastShown.current = null;
    let disposed = false;
    void getLocationMeta<number>(reminderKey).then(value => { if (!disposed) lastShown.current = value ?? 0; }).catch(() => { if (!disposed) lastShown.current = 0; });
    if (!eligible) return () => { disposed = true; };
    const unsubscribe = subscribeTrackingHealth(setHealth);
    void reportTrackingHealth();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        setTick(value => value + 1);
        void reportTrackingHealth();
      }
    }, 30000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refreshLocationTracking('app-resume');
        void reportTrackingHealth();
        setTick(value => value + 1);
      }
    });
    return () => { disposed = true; unsubscribe(); clearInterval(timer); subscription.remove(); };
  }, [eligible, reminderKey]);

  const show = useCallback(() => {
    if (!attention) return;
    lastShown.current = Date.now();
    void setLocationMeta(reminderKey, lastShown.current).catch(() => undefined);
    setRenderedMessage(attention);
    setOpen(true);
  }, [attention, reminderKey]);

  useEffect(() => {
    if (!attention) { setOpen(false); return; }
    if (lastShown.current !== null && shouldRemindTracking({ foreground: AppState.currentState === 'active', needsAttention: true, lastShownAt: lastShown.current, now: Date.now() })) show();
  }, [attention, show, tick]);

  const requestPermission = async () => {
    setWorking(true);
    try {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.granted) await Location.requestBackgroundPermissionsAsync();
      await refreshLocationTracking('foreground');
      await reportTrackingHealth();
    } finally { setWorking(false); }
  };

  return <>
    {attention ? <View style={{ paddingTop: insets.top }} className='bg-red-700'>
      <Pressable accessibilityRole='button' onPress={show} className='flex-row items-center gap-3 px-4 py-3'>
        <FontAwesome name='exclamation-triangle' size={18} color='white' />
        <View className='flex-1'><Text className='text-sm font-bold text-white'>Location tracking needs attention</Text>
          <Text className='mt-1 text-xs text-white'>{attention}</Text></View>
        <FontAwesome name='chevron-right' size={14} color='white' />
      </Pressable>
    </View> : null}
    <Modal visible={open} transparent animationType='fade' onRequestClose={() => setOpen(false)}>
      <View className='flex-1 justify-center bg-black/50 px-5' style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
        <View className='max-h-full rounded-lg bg-white p-5 dark:bg-neutral-900'>
          <ScrollView bounces={false}>
            <View className='flex-row items-center justify-between gap-3'>
              <Text className='flex-1 text-lg font-bold'>Location tracking needs attention</Text>
              <Pressable accessibilityRole='button' accessibilityLabel='Dismiss' onPress={() => setOpen(false)} className='h-11 w-11 items-center justify-center'>
                <FontAwesome name='close' size={22} color='#b91c1c' />
              </Pressable>
            </View>
            <Text className='mt-3 text-sm text-red-700 dark:text-red-300'>{renderedMessage}</Text>
            <Text className='mt-4 text-sm leading-6'>{Platform.OS === 'ios' ? 'Required settings: Location Always, Precise Location on, and Background App Refresh on.' : 'Required settings: Allow all the time, Precise Location on, and battery usage Unrestricted.'}</Text>
            <Text className='mt-3 text-sm leading-6'>Tracking is limited to scheduled work. Phone settings and operating-system restrictions can delay background updates.</Text>
            {(health?.permissionKind === 'foreground-denied' || health?.permissionKind === 'background-denied') ? <Pressable disabled={working} onPress={() => { void requestPermission().catch(() => undefined); }} className='mt-5 min-h-12 items-center justify-center rounded-lg bg-red-700 p-3'>
              <Text className='font-semibold text-white'>{working ? 'Checking permissions...' : 'Allow location'}</Text>
            </Pressable> : null}
            <Pressable onPress={() => { setOpen(false); void Linking.openSettings().catch(() => undefined); }} className='mt-3 min-h-12 items-center justify-center rounded-lg bg-red-700 p-3'><Text className='font-semibold text-white'>Open Settings</Text></Pressable>
            <Pressable onPress={() => setOpen(false)} className='mt-3 min-h-12 items-center justify-center p-3'><Text className='font-semibold'>Not now</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
