import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useUpdates } from 'expo-updates';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import './global.css';
import { ClerkProvider, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  PowerSyncProvider,
  usePowerSyncStatus,
} from '../providers/PowerSyncProvider';
import { initImageCache } from '@/utils/imageCache';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { requestAppPermissions } from '@/utils/permissions';
import { PushNotificationInitializer } from '@/components/notifications/PushNotificationInitializer';
// import { resourceCache } from '@clerk/clerk-expo/resource-cache';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { PortalHost } from '@rn-primitives/portal';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const UPDATE_PENDING_KEY = 'updatePending';

function UpdateChecker({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const { isUpdateAvailable } = useUpdates();
  const insets = useSafeAreaInsets();

  // Check if we just came back from an update (show toast)
  useEffect(() => {
    if (__DEV__) {
      setIsChecking(false);
      return;
    }

    const checkIfJustUpdated = async () => {
      try {
        const updatePending = await AsyncStorage.getItem(UPDATE_PENDING_KEY);
        if (updatePending === 'true') {
          await AsyncStorage.removeItem(UPDATE_PENDING_KEY);
          setShowUpdateToast(true);
          setTimeout(() => setShowUpdateToast(false), 3000);
        }
      } catch (error) {
        console.warn('Error checking update status:', error);
      }
      setIsChecking(false);
    };
    checkIfJustUpdated();
  }, []);

  // Auto-apply updates when available
  useEffect(() => {
    if (__DEV__ || isChecking) return;

    if (isUpdateAvailable) {
      const applyUpdate = async () => {
        try {
          await AsyncStorage.setItem(UPDATE_PENDING_KEY, 'true');
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        } catch (error) {
          console.error('Error applying update:', error);
          await AsyncStorage.removeItem(UPDATE_PENDING_KEY);
        }
      };
      applyUpdate();
    }
  }, [isUpdateAvailable, isChecking]);

  // Show nothing while checking for updates initially (keeps splash screen visible)
  if (isChecking) {
    return null;
  }

  return (
    <>
      {children}
      {showUpdateToast && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          exiting={FadeOutUp.duration(300)}
          className='absolute left-4 right-4 z-50'
          style={{ top: Math.max(insets.top + 8, 48) }}
        >
          <View className='bg-green-600 dark:bg-green-700 rounded-lg p-4 shadow-lg'>
            <Text className='text-white font-semibold text-center'>
              ✓ App updated to latest version!
            </Text>
          </View>
        </Animated.View>
      )}
    </>
  );
}

function PowerSyncStatusBanner() {
  const { error, isRetrying, retryInit, isSignedIn } = usePowerSyncStatus();
  const insets = useSafeAreaInsets();

  if (!error || !isSignedIn) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutUp.duration(200)}
      className='absolute left-0 right-0 z-50 bg-red-600'
      style={{
        paddingTop: Math.max(insets.top, 8),
        paddingBottom: 8,
        paddingHorizontal: 16,
      }}
    >
      <View className='flex-row items-center justify-between'>
        <View className='flex-1 pr-3'>
          <Text className='text-white font-semibold'>Sync failed</Text>
          <Text className='text-white/90 text-xs'>{error.message}</Text>
        </View>
        <TouchableOpacity
          onPress={retryInit}
          disabled={isRetrying}
          className='bg-white/20 px-3 py-2 rounded-md'
        >
          <Text className='text-white font-semibold text-xs'>
            {isRetrying ? 'Retrying...' : 'Retry'}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function InitialLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useUser();

  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (isLoaded && fontsLoaded) {
      // Hide splash screen once fonts and auth are ready
      SplashScreen.hideAsync();

      // Initialize image cache management
      initImageCache().catch((err) => {
        console.warn('Failed to initialize image cache:', err);
      });

      // Request app permissions
      requestAppPermissions().catch((err) => {
        console.warn('Failed to request app permissions:', err);
      });
    }
  }, [isLoaded, fontsLoaded]);

  return <>{children}</>;
}

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env',
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <UpdateChecker>
          <ClerkProvider
            publishableKey={CLERK_PUBLISHABLE_KEY}
            tokenCache={tokenCache}
            // __experimental_resourceCache={resourceCache} // Disabled to debug href error
          >
            <InitialLayout>
              <ThemeProvider>
                <PowerSyncProvider>
                  <PushNotificationInitializer />
                  <PowerSyncStatusBanner />
                  <BottomSheetModalProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen
                        name='(tabs)'
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name='report'
                        options={{
                          headerShown: true,
                          presentation: 'card',
                          title: 'Report Essentials',
                        }}
                      />
                      <Stack.Screen
                        name='debug-logs'
                        options={{
                          headerShown: true,
                          presentation: 'card',
                          title: 'Debug Logs',
                        }}
                      />
                      <Stack.Screen
                        name='debug-env'
                        options={{
                          headerShown: true,
                          presentation: 'card',
                          title: 'Environment Tools',
                        }}
                      />
                    </Stack>
                    <PortalHost />
                  </BottomSheetModalProvider>
                </PowerSyncProvider>
              </ThemeProvider>
            </InitialLayout>
          </ClerkProvider>
        </UpdateChecker>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
