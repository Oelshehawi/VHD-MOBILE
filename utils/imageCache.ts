import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';

// Constants
const CACHE_CHECK_KEY = 'EXPO_IMAGE_CACHE_LAST_CLEARED';
const CACHE_CHECK_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Initialize the image cache management
 * - Clears memory cache on app start
 * - Clears disk cache periodically based on interval
 */
export const initImageCache = async (): Promise<void> => {
  try {
    // Always clear memory cache on app start to free memory
    await Image.clearMemoryCache();

    // Check if we need to clear disk cache
    const lastClearDateStr = await AsyncStorage.getItem(CACHE_CHECK_KEY);
    const now = Date.now();

    if (!lastClearDateStr || now - parseInt(lastClearDateStr, 10) > CACHE_CHECK_INTERVAL) {
      console.log('Clearing Expo Image disk cache');

      // Clear disk cache
      await Image.clearDiskCache();

      // Update the last cleared date
      await AsyncStorage.setItem(CACHE_CHECK_KEY, now.toString());
    }
  } catch (error) {
    console.warn('Error managing Expo Image cache:', error);
  }
};

/**
 * Preload important images
 * @param uris Array of image URIs to preload
 */
export const preloadImages = (uris: string[]): void => {
  if (!uris || uris.length === 0) return;

  // Expo Image doesn't have a direct preload method like FastImage
  // But we can achieve similar functionality by creating Image instances
  uris.forEach((uri) => {
    Image.prefetch(uri);
  });
};

/**
 * Force clear all image caches
 */
export const clearAllImageCaches = async (): Promise<void> => {
  try {
    // Clear both memory and disk caches
    await Image.clearMemoryCache();
    await Image.clearDiskCache();

    // Update the last cleared date
    const now = Date.now();
    await AsyncStorage.setItem(CACHE_CHECK_KEY, now.toString());
  } catch (error) {
    console.warn('Error clearing image caches:', error);
  }
};
