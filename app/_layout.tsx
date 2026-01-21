import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Alert, AppState } from 'react-native';
import { useUpdates } from 'expo-updates';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import './global.css';
import { ClerkProvider, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PowerSyncProvider } from '../providers/PowerSyncProvider';
import { initImageCache } from '@/utils/imageCache';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { requestAppPermissions } from '@/utils/permissions';
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

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const UPDATE_PENDING_KEY = 'updatePending';

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

  // AppState listener for PowerSync background sync
  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // PowerSync automatically syncs pending attachments when app becomes active
        // No manual intervention needed - QUEUED_UPLOAD attachments sync every 5 seconds
      }
    });

    return () => {
      appStateSubscription?.remove();
    };
  }, []);

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
      Alert.alert('Update Failed', 'Could not install update. Please try again later.');
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
        animationType="fade"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              Update Available
            </Text>
            <Text className="text-gray-600 dark:text-gray-300 mb-6">
              A new version is available. Tap OK to download and install the update.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowUpdateModal(false)}
                className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-lg"
              >
                <Text className="text-gray-900 dark:text-white font-semibold text-center">
                  Later
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUpdateConfirm}
                className="flex-1 bg-green-600 dark:bg-green-700 py-3 rounded-lg"
              >
                <Text className="text-white font-semibold text-center">
                  OK
                </Text>
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
          className="absolute top-12 left-4 right-4 z-50"
        >
          <View className="bg-green-600 dark:bg-green-700 rounded-lg p-4 shadow-lg">
            <Text className="text-white font-semibold text-center">
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
          publishableKey={CLERK_PUBLISHABLE_KEY!}
          tokenCache={tokenCache}
          // __experimental_resourceCache={resourceCache} // Disabled to debug href error
        >
          <InitialLayout>
            <ThemeProvider>
              <PowerSyncProvider>
                <BottomSheetModalProvider>
                  <Slot />
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
