import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import './global.css';
import { ClerkProvider, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '../cache';
import { PowerSyncProvider } from '../providers/PowerSyncProvider';
import { secureStore } from '@clerk/clerk-expo/secure-store';
import { initImageCache } from '@/utils/imageCache';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { requestAppPermissions } from '@/utils/permissions';

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

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
      __experimental_resourceCache={secureStore}
    >
      <InitialLayout>
        <ThemeProvider>
          <PowerSyncProvider>
            <Slot />
          </PowerSyncProvider>
        </ThemeProvider>
      </InitialLayout>
    </ClerkProvider>
  );
}
