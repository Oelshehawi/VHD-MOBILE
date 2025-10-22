import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import './global.css';
import { ClerkProvider, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PowerSyncProvider } from '../providers/PowerSyncProvider';
import { initImageCache } from '@/utils/imageCache';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { requestAppPermissions } from '@/utils/permissions';
import { resourceCache } from '@clerk/clerk-expo/resource-cache';

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

function InitialLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useUser();

  const canManage = user?.publicMetadata.isManager;

  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

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

  // Check for OTA updates on app launch and when app comes to foreground
  useEffect(() => {
    async function checkForUpdates() {
      // Only check for updates in production/preview builds, not in development
      if (__DEV__) {
        return;
      }

      try {
        const update = await Updates.checkForUpdateAsync();

        if (update.isAvailable) {
          console.log('Update available, downloading...');
          await Updates.fetchUpdateAsync();
          console.log('Update downloaded, reloading app...');
          await Updates.reloadAsync();
        }
      } catch (error) {
        // Handle errors gracefully - don't crash the app if update check fails
        console.warn('Error checking for updates:', error);
      }
    }

    // Check on initial mount
    checkForUpdates();

    // Add AppState listener to check for updates when app becomes active
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // Check for OTA updates when app comes to foreground
        checkForUpdates();

        // PowerSync automatically syncs pending attachments when app becomes active
        // No manual intervention needed - QUEUED_UPLOAD attachments sync every 5 seconds
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  return (
    <>
      {children}
      {/* Debug button - commented out to prevent hooks error on iOS */}
      {/* <DebugButton visible={__DEV__ || canManage as boolean} /> */}
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
          __experimental_resourceCache={resourceCache}
        >
          <InitialLayout>
            <ThemeProvider>
              <PowerSyncProvider>
                <Slot />
              </PowerSyncProvider>
            </ThemeProvider>
          </InitialLayout>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
