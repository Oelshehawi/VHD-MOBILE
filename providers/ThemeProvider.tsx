import React, { createContext, useState, useEffect, useContext } from 'react';
import { useColorScheme as useDeviceColorScheme, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider
} from '@react-navigation/native';
import { useColorScheme } from 'nativewind';

type ColorSchemeType = 'light' | 'dark' | 'system';

interface ThemeContextType {
  colorScheme: string;
  setColorScheme: (scheme: ColorSchemeType) => void;
  theme: ColorSchemeType;
}

const ThemeContext = createContext<ThemeContextType>({
  colorScheme: 'light',
  setColorScheme: () => {},
  theme: 'system'
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const deviceColorScheme = useDeviceColorScheme();
  const [userColorScheme, setUserColorScheme] = useState<ColorSchemeType>('system');
  const [isLoaded, setIsLoaded] = useState(false);
  const { setColorScheme: setNativeWindColorScheme } = useColorScheme();

  // Load user preference from AsyncStorage on mount
  useEffect(() => {
    async function loadColorScheme() {
      try {
        const savedScheme = await AsyncStorage.getItem('userColorScheme');
        if (savedScheme) {
          setUserColorScheme(savedScheme as ColorSchemeType);
        }
      } catch (error) {
        console.error('Failed to load color scheme preference:', error);
      } finally {
        setIsLoaded(true);
      }
    }

    loadColorScheme();
  }, []);

  // Listen for app state changes to detect system theme changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && userColorScheme === 'system') {
        // Force refresh of system theme when app comes to foreground
        setNativeWindColorScheme(deviceColorScheme || 'light');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [deviceColorScheme, userColorScheme, setNativeWindColorScheme]);

  // Determine the actual color scheme based on user preference
  const actualColorScheme =
    userColorScheme === 'system' ? deviceColorScheme || 'light' : userColorScheme;

  // Update NativeWind when color scheme changes
  useEffect(() => {
    // For 'system', use the device color scheme
    // For 'light' or 'dark', force that scheme
    if (userColorScheme === 'system') {
      setNativeWindColorScheme(deviceColorScheme || 'light');
    } else {
      setNativeWindColorScheme(userColorScheme as 'light' | 'dark');
    }
  }, [actualColorScheme, deviceColorScheme, userColorScheme, setNativeWindColorScheme]);

  // Set color scheme function that immediately updates state and saves to storage
  const setColorScheme = async (scheme: ColorSchemeType) => {
    try {
      setUserColorScheme(scheme);
      await AsyncStorage.setItem('userColorScheme', scheme);

      // Immediately update NativeWind
      if (scheme === 'system') {
        setNativeWindColorScheme(deviceColorScheme || 'light');
      } else {
        setNativeWindColorScheme(scheme as 'light' | 'dark');
      }
    } catch (error) {
      console.error('Failed to save color scheme preference:', error);
    }
  };

  // Get the appropriate navigation theme
  const theme = actualColorScheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeContext.Provider
      value={{
        colorScheme: actualColorScheme,
        setColorScheme,
        theme: userColorScheme
      }}
    >
      <NavigationThemeProvider value={theme}>{children}</NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}
