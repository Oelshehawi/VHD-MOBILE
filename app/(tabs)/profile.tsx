import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Card } from '../../components/ui/Card';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Stack } from 'expo-router';
import { toLocalTime } from '../../utils/date';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!user) {
    return (
      <View className='flex-1 bg-gray-950 justify-center items-center p-4'>
        <Text className='text-gray-400'>Loading...</Text>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-gray-950 p-4'>
      <Stack.Screen options={{ headerShown: false }} />
      <Card className='mb-4 bg-gray-900 border-gray-800'>
        <View className='p-4 items-center'>
          {user.imageUrl && (
            <Image
              source={{ uri: user.imageUrl }}
              className='w-24 h-24 rounded-full mb-4 border-2 border-gray-800'
            />
          )}
          <Text className='text-xl font-bold text-gray-200 mb-2'>
            {user.fullName || user.username}
          </Text>
          <Text className='text-gray-400 mb-1'>
            {user.primaryEmailAddress?.emailAddress}
          </Text>
        </View>
      </Card>

      <Card className='mb-4 bg-gray-900 border-gray-800'>
        <View className='p-4'>
          <Text className='text-lg font-semibold text-gray-200 mb-4'>
            Account Details
          </Text>
          <View className='space-y-2'>
            <View>
              <Text className='text-sm text-gray-400'>Member Since</Text>
              <Text className='text-gray-200'>
                {user.createdAt
                  ? toLocalTime(new Date(user.createdAt)).toLocaleDateString(
                      'en-US',
                      {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        timeZone: 'UTC',
                      }
                    )
                  : 'N/A'}
              </Text>
            </View>
            <View>
              <Text className='text-sm text-gray-400'>Last Updated</Text>
              <Text className='text-gray-200'>
                {user.updatedAt
                  ? toLocalTime(new Date(user.updatedAt)).toLocaleDateString(
                      'en-US',
                      {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        timeZone: 'UTC',
                      }
                    )
                  : 'N/A'}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      <TouchableOpacity
        onPress={handleSignOut}
        className='bg-darkGreen py-4 rounded-lg mt-auto'
      >
        <Text className='text-center text-gray-100 font-semibold'>
          Sign Out
        </Text>
      </TouchableOpacity>
    </View>
  );
}
