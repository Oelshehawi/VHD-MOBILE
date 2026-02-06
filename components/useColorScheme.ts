import { useState, useEffect } from 'react';
import { useColorScheme as _useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ColorSchemeType = 'light' | 'dark' | 'system';

/**
 * Enhanced useColorScheme hook that supports manual color scheme selection
 * It will first try to use user preference, then fall back to system preference
 */
export function useColorScheme(): string {
  const systemColorScheme = _useColorScheme();
  const [userColorScheme, setUserColorScheme] = useState<ColorSchemeType>('system');
  const [isLoaded, setIsLoaded] = useState(false);

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

  // Save user preference to AsyncStorage when it changes
  useEffect(() => {
    if (!isLoaded) return;

    async function saveColorScheme() {
      try {
        await AsyncStorage.getItem('userColorScheme').then((current) => {
          if (current !== userColorScheme) {
            AsyncStorage.setItem('userColorScheme', userColorScheme);
          }
        });
      } catch (error) {
        console.error('Failed to save color scheme preference:', error);
      }
    }

    saveColorScheme();
  }, [userColorScheme, isLoaded]);

  // Determine the actual color scheme based on user preference
  const actualColorScheme =
    userColorScheme === 'system' ? systemColorScheme || 'light' : userColorScheme;

  return actualColorScheme;
}

/**
 * Set the user's color scheme preference
 * @param scheme The color scheme to set ('light', 'dark', or 'system')
 */
export async function setColorScheme(scheme: ColorSchemeType): Promise<void> {
  try {
    await AsyncStorage.setItem('userColorScheme', scheme);
  } catch (error) {
    console.error('Failed to save color scheme preference:', error);
  }
}
