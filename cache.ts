import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { TokenCache } from '@clerk/clerk-expo/dist/cache';

const MANAGER_STATUS_KEY = 'vhd_manager_status';

export const getManagerStatus = async (): Promise<boolean> => {
  try {
    const status = await SecureStore.getItemAsync(MANAGER_STATUS_KEY);
    if (!status) return false;
    const { isManager } = JSON.parse(status);
    return !!isManager;
  } catch (error) {
    console.error('Error getting manager status:', error);
    return false;
  }
};

export const setManagerStatus = async (token: string): Promise<void> => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const isManager = !!payload.claims?.isManager;
    await SecureStore.setItemAsync(
      MANAGER_STATUS_KEY,
      JSON.stringify({ isManager })
    );
  } catch (error) {
    console.error('Error setting manager status:', error);
  }
};

const createTokenCache = (): TokenCache => {
  return {
    getToken: async (key: string) => {
      try {
        const item = await SecureStore.getItemAsync(key);
        if (item && key === 'manager-status') {
          await setManagerStatus(item);
        }
        return item;
      } catch (error) {
        console.error('secure store get item error: ', error);
        await SecureStore.deleteItemAsync(key);
        return null;
      }
    },
    saveToken: async (key: string, token: string) => {
      try {
        if (key === 'manager-status') {
          await setManagerStatus(token);
        }
        return await SecureStore.setItemAsync(key, token);
      } catch (error) {
        console.error('Error saving token:', error);
        return Promise.reject(error);
      }
    },
  };
};

// SecureStore is not supported on the web
export const tokenCache =
  Platform.OS !== 'web' ? createTokenCache() : undefined;
