import { View, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/button';
import { Text } from '../../components/ui/text';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../../components/ui/Card';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { OfflineBanner } from '../../components/profile/OfflineBanner';
import { InfoRow } from '../../components/profile/InfoRow';
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

  // Use cached data when offline
  const displayUser = isOffline ? cachedUser : user;

  if (!displayUser) {
    return (
      <SafeAreaView className='flex-1 bg-white dark:bg-gray-950'>
        <View className='flex-1 justify-center items-center p-4'>
          <Text variant='muted'>
            {isOffline ? 'Offline - No cached data available' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className='flex-1 bg-white dark:bg-gray-950'>
      <ScrollView
        className='flex-1'
        contentContainerStyle={{
          flexGrow: 1,
          padding: 16,
          paddingBottom: 32,
        }}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className='flex-1'>
          <OfflineBanner visible={isOffline} />

          <ProfileHeader
            imageUrl={displayUser.imageUrl}
            fullName={displayUser.fullName}
            username={displayUser.username}
            email={
              displayUser.email || displayUser.primaryEmailAddress?.emailAddress
            }
          />

          <Card className='mb-4'>
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
            </CardHeader>
            <CardContent>
              <View className='space-y-2'>
                <InfoRow
                  label='Member Since'
                  value={
                    displayUser.createdAt
                      ? formatDateReadable(displayUser.createdAt)
                      : 'N/A'
                  }
                />
                <InfoRow
                  label='Last Updated'
                  value={
                    displayUser.updatedAt
                      ? formatDateReadable(displayUser.updatedAt)
                      : 'N/A'
                  }
                />
              </View>
            </CardContent>
          </Card>

          <Card className='mb-4'>
            <CardHeader>
              <CardTitle>App Version</CardTitle>
            </CardHeader>
            <CardContent>
              <View className='space-y-2'>
                <InfoRow label='Version' value='1.0.0' />
                <InfoRow
                  label='Update Channel'
                  value={Updates.channel || 'development'}
                />
                <InfoRow
                  label='Update ID'
                  value={Updates.updateId || 'No OTA update installed'}
                />
                {Updates.createdAt && (
                  <InfoRow
                    label='Update Published'
                    value={formatDateReadable(Updates.createdAt)}
                  />
                )}
              </View>
            </CardContent>
          </Card>

          <Button
            onPress={handleSignOut}
            disabled={isOffline}
            className={`mt-auto py-4 ${
              isOffline ? 'bg-gray-400 dark:bg-gray-600' : 'bg-darkGreen'
            }`}
          >
            <Text className='text-center text-white font-semibold'>
              {isOffline ? 'Offline - Sign Out Unavailable' : 'Sign Out'}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
