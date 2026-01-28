import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Alert } from 'react-native';
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
  const { isLoaded, user } = useUser();

  const canManage = user?.publicMetadata.isManager;

  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

  // Use the Expo Updates hook for reactive update state
  const { isUpdateAvailable } = useUpdates();

  useEffect(() => {
    if (isLoaded) {
      // Initialize image cache management
      initImageCache().catch((err) => {
        console.warn('Failed to initialize image cache:', err);
      });

      // Request app permissions
      requestAppPermissions().catch((err) => {
        console.warn('Failed to request app permissions:', err);
      });
    }
  }, [isLoaded]);

  // Check if we just came back from an update (on mount only)
  useEffect(() => {
    if (__DEV__) {
      return;
    }

    const checkIfJustUpdated = async () => {
      try {
        const updatePending = await AsyncStorage.getItem(UPDATE_PENDING_KEY);

        if (updatePending === 'true') {
          // We just updated! Show success toast
          await AsyncStorage.removeItem(UPDATE_PENDING_KEY);
          setShowUpdateToast(true);
          setTimeout(() => setShowUpdateToast(false), 3000);
        }
      } catch (error) {
        console.warn('Error checking update status:', error);
      }
    };

    checkIfJustUpdated();
  }, []);

  // Show update modal when an update becomes available
  useEffect(() => {
    if (__DEV__) {
      return;
    }

    if (isUpdateAvailable && !showUpdateToast) {
      console.log('Update available!');
      setShowUpdateModal(true);
    }
  }, [isUpdateAvailable, showUpdateToast]);

  const handleUpdateConfirm = async () => {
    try {
      // Set flag that update is pending
      await AsyncStorage.setItem(UPDATE_PENDING_KEY, 'true');

      // Download and install the update
      await Updates.fetchUpdateAsync();

      // Reload the app to apply the update
      await Updates.reloadAsync();
    } catch (error) {
      console.error('Error applying update:', error);
      await AsyncStorage.removeItem(UPDATE_PENDING_KEY);
      Alert.alert(
        'Update Failed',
        'Could not install update. Please try again later.',
      );
    }
  };

  return (
    <>
      {children}
      {/* Debug button - commented out to prevent hooks error on iOS */}
      {/* <DebugButton visible={__DEV__ || canManage as boolean} /> */}

      {/* Update Available Modal */}
      <Modal
        visible={showUpdateModal}
        transparent
        animationType='fade'
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View className='flex-1 justify-center items-center bg-black/50 px-6'>
          <View className='bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl'>
            <Text className='text-xl font-bold text-gray-900 dark:text-white mb-3'>
              Update Available
            </Text>
            <Text className='text-gray-600 dark:text-gray-300 mb-6'>
              A new version is available. Tap OK to download and install the
              update.
            </Text>
            <View className='flex-row gap-3'>
              <TouchableOpacity
                onPress={() => setShowUpdateModal(false)}
                className='flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-lg'
              >
                <Text className='text-gray-900 dark:text-white font-semibold text-center'>
                  Later
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUpdateConfirm}
                className='flex-1 bg-green-600 dark:bg-green-700 py-3 rounded-lg'
              >
                <Text className='text-white font-semibold text-center'>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Update Success Toast */}
      {showUpdateToast && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          exiting={FadeOutUp.duration(300)}
          className='absolute top-12 left-4 right-4 z-50'
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider
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
                  </Stack>
                  <PortalHost />
                </BottomSheetModalProvider>
              </PowerSyncProvider>
            </ThemeProvider>
          </InitialLayout>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
