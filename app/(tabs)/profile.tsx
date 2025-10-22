import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Stack } from 'expo-router';
import { formatDateReadable } from '../../utils/date';
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import * as Updates from 'expo-updates';
// Import functions to get URLs
import {
  getPowerSyncUrl,
  getApiUrl,
  setEnvironment,
} from '../../services/ApiClient';
import { LocationTracker } from '@/services/location/LocationTracker';
import { useSystem } from '@/services/database/System';

const USER_CACHE_KEY = 'vhd_user_cache';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { powersync } = useSystem();
  const [isOffline, setIsOffline] = useState(false);
  const [cachedUser, setCachedUser] = useState<any>(null);
  const [trackingStatus, setTrackingStatus] = useState(() =>
    LocationTracker.getTrackingStatus()
  );
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

  useEffect(() => {
    const unsubscribe = LocationTracker.subscribe(setTrackingStatus);

    if (powersync && user?.id) {
      LocationTracker.initialize(powersync, user.id).catch((error) => {
        console.warn('Failed to initialise location tracker on profile screen', error);
      });
    }

    return unsubscribe;
  }, [powersync, user?.id]);

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

  // Use cached data when offline
  const displayUser = isOffline ? cachedUser : user;

  if (!displayUser) {
    return (
      <SafeAreaView className='flex-1 bg-white dark:bg-gray-950'>
        <View className='flex-1 justify-center items-center p-4'>
          <Text className='text-gray-800 dark:text-gray-400'>
            {isOffline ? 'Offline - No cached data available' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
      <SafeAreaView className='flex-1 bg-white dark:bg-gray-950'>
        <ScrollView className='flex-1 p-4'>
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
              {displayUser.email ||
                displayUser.primaryEmailAddress?.emailAddress}
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

        <Card className='mb-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'>
          <View className='p-4'>
            <Text className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4'>
              Location Tracking
            </Text>
            <View className='flex-row items-center justify-between'>
              <Text className='text-sm text-gray-600 dark:text-gray-400'>
                Status
              </Text>
              <View className='flex-row items-center'>
                <View
                  className={`w-2 h-2 rounded-full ${
                    trackingStatus.isTracking ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                <Text
                  className={`ml-2 font-semibold ${
                    trackingStatus.isTracking
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {trackingStatus.isTracking ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>

            {trackingStatus.isTracking && trackingStatus.jobId && (
              <Text className='mt-3 text-sm text-gray-600 dark:text-gray-400'>
                Current job: {trackingStatus.jobId}
              </Text>
            )}

            <Text className='mt-3 text-xs text-gray-500 dark:text-gray-400 leading-5'>
              Your location is only recorded while an active job is being tracked and is cleared automatically when you complete the job.
            </Text>
          </View>
        </Card>

        <Card className='mb-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'>
          <View className='p-4'>
            <Text className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4'>
              App Version
            </Text>
            <View className='space-y-2'>
              <View>
                <Text className='text-sm text-gray-600 dark:text-gray-400'>
                  Version
                </Text>
                <Text className='text-gray-800 dark:text-gray-200'>1.0.0</Text>
              </View>
              <View>
                <Text className='text-sm text-gray-600 dark:text-gray-400'>
                  Update Channel
                </Text>
                <Text className='text-gray-800 dark:text-gray-200'>
                  {Updates.channel || 'development'}
                </Text>
              </View>
              <View>
                <Text className='text-sm text-gray-600 dark:text-gray-400'>
                  Update ID
                </Text>
                <Text className='text-gray-800 dark:text-gray-200 text-xs'>
                  {Updates.updateId || 'No OTA update installed'}
                </Text>
              </View>
              {Updates.createdAt && (
                <View>
                  <Text className='text-sm text-gray-600 dark:text-gray-400'>
                    Update Published
                  </Text>
                  <Text className='text-gray-800 dark:text-gray-200'>
                    {formatDateReadable(Updates.createdAt)}
                  </Text>
                </View>
              )}
            </View>
          </View>
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
      </SafeAreaView>
  );
}
