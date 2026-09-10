import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { ApiClient } from '@/services/ApiClient';
import { isBelowMinVersion } from '@/utils/appVersion';
import { debugLogger } from '@/utils/DebugLogger';

const MIN_VERSION_CACHE_KEY = 'vhd_min_app_version_v1';
const IOS_APP_STORE_ID = '6757776446';
const ANDROID_PACKAGE = 'com.braille71.VHDApp';

const STORE_URLS = Platform.select({
  ios: [
    `itms-apps://apps.apple.com/app/id${IOS_APP_STORE_ID}`,
    `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`
  ],
  android: [
    `market://details?id=${ANDROID_PACKAGE}`,
    `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
  ],
  default: []
});

// runtimeVersion uses the appVersion policy, so it equals the installed store
// binary's version even after OTA updates.
function getInstalledAppVersion(): string | null {
  return Updates.runtimeVersion ?? Constants.expoConfig?.version ?? null;
}

async function openStore() {
  for (const url of STORE_URLS) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // Try the web fallback.
    }
  }
}

/**
 * Blocks signed-in technicians on a binary older than the server's
 * MOBILE_MIN_APP_VERSION. The last known minimum is cached so an offline
 * launch still blocks; with no cache and no server answer, the app stays usable
 * so nobody is locked out of a job for lack of signal.
 */
export function ForceUpdateGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [minVersion, setMinVersion] = useState<string | null>(null);
  const serverAnsweredRef = useRef(false);
  const installedVersion = getInstalledAppVersion();

  useEffect(() => {
    AsyncStorage.getItem(MIN_VERSION_CACHE_KEY)
      .then((cached) => {
        if (cached && !serverAnsweredRef.current) setMinVersion(cached);
      })
      .catch(() => undefined);
  }, []);

  const check = useCallback(async () => {
    const config = await new ApiClient().getAppConfig();
    if (!config) return;
    serverAnsweredRef.current = true;
    setMinVersion(config.minAppVersion);
    try {
      if (config.minAppVersion) {
        await AsyncStorage.setItem(MIN_VERSION_CACHE_KEY, config.minAppVersion);
      } else {
        await AsyncStorage.removeItem(MIN_VERSION_CACHE_KEY);
      }
    } catch {
      // The in-memory value still applies for this session.
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void check();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void check();
    });
    return () => subscription.remove();
  }, [check, isLoaded, isSignedIn]);

  const blocked = Boolean(isSignedIn) && isBelowMinVersion(installedVersion, minVersion);

  useEffect(() => {
    if (blocked) {
      void debugLogger.warn('SYNC', 'App version below required minimum; showing update gate', {
        installedVersion,
        minVersion
      });
    }
  }, [blocked, installedVersion, minVersion]);

  return (
    <Modal
      visible={blocked}
      animationType='fade'
      presentationStyle='fullScreen'
      onRequestClose={() => {}}
    >
      <View
        className='flex-1 justify-center bg-white px-6 dark:bg-[#16140F]'
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className='text-2xl font-bold text-[#14110F] dark:text-white'>Update required</Text>
        <Text className='mt-3 text-base leading-6 text-gray-600 dark:text-gray-300'>
          This version of the app ({installedVersion}) is no longer supported. Install version{' '}
          {minVersion} or newer to keep tracking jobs and syncing reports.
        </Text>
        <Text className='mt-3 text-sm leading-5 text-gray-500 dark:text-gray-400'>
          {Platform.OS === 'ios'
            ? 'If the button does not open the update, open the App Store, tap your profile icon, and update Vancouver Hood Doctors from the list.'
            : 'If the button does not open the update, open the Play Store, tap your profile icon, choose Manage apps & device, and update Vancouver Hood Doctors.'}
        </Text>
        <Pressable
          onPress={() => void openStore()}
          className='mt-8 items-center rounded-xl bg-[#14110F] px-4 py-4 dark:bg-amber-400'
        >
          <Text className='font-bold text-[#F7F5F1] dark:text-[#14110F]'>Update</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
