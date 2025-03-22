import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { Card } from '../../components/ui/Card';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Stack } from 'expo-router';
import { formatDateReadable } from '../../utils/date';
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
// Import functions to get URLs
import {
  getPowerSyncUrl,
  getApiUrl,
  setEnvironment,
} from '../../services/ApiClient';

const USER_CACHE_KEY = 'vhd_user_cache';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const [isOffline, setIsOffline] = useState(false);
  const [cachedUser, setCachedUser] = useState<any>(null);
  // Get URLs for display
  const powerSyncUrl = getPowerSyncUrl();
  const apiUrl = getApiUrl();

  // Check network status and load cached user data
  useEffect(() => {
    const loadCachedUser = async () => {
      try {
        const userData = await SecureStore.getItemAsync(USER_CACHE_KEY);
        if (userData) {
          setCachedUser(JSON.parse(userData));
        }
      } catch (error) {
        console.error('Error loading cached user:', error);
        // If there's an error reading the cache, clear it
        await SecureStore.deleteItemAsync(USER_CACHE_KEY);
      }
    };

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });

    loadCachedUser();
    return () => unsubscribe();
  }, []);

  // Cache user data when online
  useEffect(() => {
    if (user && !isOffline) {
      SecureStore.setItemAsync(
        USER_CACHE_KEY,
        JSON.stringify({
          fullName: user.fullName,
          username: user.username,
          imageUrl: user.imageUrl,
          email: user.primaryEmailAddress?.emailAddress,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          // Add any additional user metadata you need offline
          metadata: user.publicMetadata,
        })
      ).catch((error) => console.error('Error caching user data:', error));
    }
  }, [user]);

  const handleSignOut = async () => {
    try {
      if (isOffline) {
        Alert.alert(
          'Offline Mode',
          'You are currently offline. Some features may not work until you reconnect.'
        );
        return;
      }

      await signOut();
      await SecureStore.deleteItemAsync(USER_CACHE_KEY);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Toggle environment for testing
  const toggleEnvironment = () => {
    // Only allow toggling in development mode
    if (__DEV__) {
      const newEnv = apiUrl.includes('192.168') ? 'PRODUCTION' : 'DEVELOPMENT';
      setEnvironment(newEnv);
      // Force reload to apply changes
      Alert.alert(
        'Environment Changed',
        `Switched to ${newEnv} environment. Changes will apply on app restart.`
      );
    }
  };

  // Use cached data when offline
  const displayUser = isOffline ? cachedUser : user;

  if (!displayUser) {
    return (
      <View className='flex-1 bg-white dark:bg-gray-950 justify-center items-center p-4'>
        <Text className='text-gray-800 dark:text-gray-400'>
          {isOffline ? 'Offline - No cached data available' : 'Loading...'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className='flex-1 bg-white dark:bg-gray-950 p-4'>
      <Stack.Screen options={{ headerShown: false }} />

      {isOffline && (
        <View className='bg-yellow-600/20 p-3 rounded-lg mb-4'>
          <Text className='text-yellow-800 dark:text-yellow-200 text-center'>
            Offline Mode - Limited functionality available
          </Text>
        </View>
      )}

      <Card className='mb-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'>
        <View className='p-4 items-center'>
          {displayUser.imageUrl && (
            <Image
              source={{ uri: displayUser.imageUrl }}
              className='w-24 h-24 rounded-full mb-4 border-2 border-gray-200 dark:border-gray-800'
            />
          )}
          <Text className='text-xl font-bold text-gray-800 dark:text-gray-200 mb-2'>
            {displayUser.fullName || displayUser.username}
          </Text>
          <Text className='text-gray-600 dark:text-gray-400 mb-1'>
            {displayUser.email || displayUser.primaryEmailAddress?.emailAddress}
          </Text>
        </View>
      </Card>

      <Card className='mb-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'>
        <View className='p-4'>
          <Text className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4'>
            Account Details
          </Text>
          <View className='space-y-2'>
            <View>
              <Text className='text-sm text-gray-600 dark:text-gray-400'>
                Member Since
              </Text>
              <Text className='text-gray-800 dark:text-gray-200'>
                {displayUser.createdAt
                  ? formatDateReadable(displayUser.createdAt)
                  : 'N/A'}
              </Text>
            </View>
            <View>
              <Text className='text-sm text-gray-600 dark:text-gray-400'>
                Last Updated
              </Text>
              <Text className='text-gray-800 dark:text-gray-200'>
                {displayUser.updatedAt
                  ? formatDateReadable(displayUser.updatedAt)
                  : 'N/A'}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* New card for connection information */}
      <Card className='mb-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'>
        <TouchableOpacity
          onPress={toggleEnvironment}
          activeOpacity={__DEV__ ? 0.7 : 1}
        >
          <View className='p-4'>
            <View className='flex-row justify-between'>
              <Text className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4'>
                Connection Details
              </Text>
              {__DEV__ && (
                <Text className='text-xs text-darkGreen'>
                  (Tap to toggle in dev mode)
                </Text>
              )}
            </View>
            <View className='space-y-3'>
              <View>
                <Text className='text-sm text-gray-600 dark:text-gray-400'>
                  API URL
                </Text>
                <Text
                  className='text-gray-800 dark:text-gray-200 text-xs'
                  numberOfLines={1}
                  ellipsizeMode='middle'
                >
                  {apiUrl || 'Not configured'}
                </Text>
              </View>
              <View>
                <Text className='text-sm text-gray-600 dark:text-gray-400'>
                  PowerSync URL
                </Text>
                <Text
                  className='text-gray-800 dark:text-gray-200 text-xs'
                  numberOfLines={1}
                  ellipsizeMode='middle'
                >
                  {powerSyncUrl || 'Not configured'}
                </Text>
              </View>
              <View>
                <Text className='text-sm text-gray-600 dark:text-gray-400'>
                  Environment
                </Text>
                <Text className='text-gray-800 dark:text-gray-200'>
                  {apiUrl?.includes('192.168') ? 'DEVELOPMENT' : 'PRODUCTION'}
                </Text>
              </View>
              <View>
                <Text className='text-sm text-gray-600 dark:text-gray-400'>
                  Network Status
                </Text>
                <View className='flex-row items-center'>
                  <View
                    className={`h-2 w-2 rounded-full mr-2 ${
                      isOffline ? 'bg-red-500' : 'bg-green-500'
                    }`}
                  />
                  <Text className='text-gray-800 dark:text-gray-200'>
                    {isOffline ? 'Offline' : 'Online'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Card>

      <TouchableOpacity
        onPress={handleSignOut}
        className={`py-4 rounded-lg mt-auto ${
          isOffline ? 'bg-gray-400 dark:bg-gray-600' : 'bg-darkGreen'
        }`}
      >
        <Text className='text-center text-white font-semibold'>
          {isOffline ? 'Offline - Sign Out Unavailable' : 'Sign Out'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
