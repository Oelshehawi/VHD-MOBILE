import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '@/components/ui/Card';
import { mockProfile } from '@/services/mockData';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <View className='flex-1 bg-gray-100 dark:bg-gray-900 p-4'>
      <Card className='mb-4'>
        <Text className='text-xl font-bold text-gray-900 dark:text-white mb-2'>
          {mockProfile.name}
        </Text>
        <Text className='text-gray-500 dark:text-gray-400'>
          {mockProfile.role}
        </Text>
      </Card>

      <TouchableOpacity
        onPress={handleSignOut}
        className='bg-darkGreen py-4 rounded-lg mt-auto'
      >
        <Text className='text-center text-darkWhite font-semibold'>
          Sign Out
        </Text>
      </TouchableOpacity>
    </View>
  );
}
