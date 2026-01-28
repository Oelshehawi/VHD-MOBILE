import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Text } from '../components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useSystem } from '../services/database/System';
import Constants from 'expo-constants';
import { usePowerSync } from '@powersync/react-native';

export default function DebugEnvScreen() {
  const system = useSystem();
  const powerSync = usePowerSync();

  const envVars = [
    {
      label: 'Clerk Publishable Key',
      value: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    },
    {
      label: 'EAS Project ID',
      value: Constants.expoConfig?.extra?.eas?.projectId,
    },
    { label: 'PowerSync URL', value: process.env.EXPO_PUBLIC_POWERSYNC_URL },
    {
      label: 'Cloudinary Cloud Name',
      value: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME,
    },
    { label: 'Environment', value: __DEV__ ? 'Development' : 'Production' },
    { label: 'Platform', value: process.platform },
  ];

  const handleWipeDatabase = () => {
    Alert.alert(
      'Wipe Database',
      'This will disconnect and clear the local PowerSync database. The app will reload. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe & Reload',
          style: 'destructive',
          onPress: async () => {
            try {
              await powerSync.disconnectAndClear();
            } catch (error) {
              Alert.alert(
                'Error',
                error instanceof Error
                  ? error.message
                  : 'Failed to wipe database',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      className='flex-1 bg-white dark:bg-gray-950'
      edges={['bottom']}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Environment & Tools',
        }}
      />

      <ScrollView className='flex-1 p-4'>
        <View className='mb-6'>
          <Text className='text-lg font-bold mb-4 text-gray-900 dark:text-gray-100'>
            Environment Variables
          </Text>
          <View className='bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden'>
            {envVars.map((env, index) => (
              <View
                key={index}
                className={`p-4 border-b border-gray-200 dark:border-gray-700 ${index === envVars.length - 1 ? 'border-b-0' : ''}`}
              >
                <Text className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1'>
                  {env.label}
                </Text>
                <Text
                  className='text-sm text-gray-900 dark:text-gray-100 font-mono'
                  numberOfLines={2}
                >
                  {env.value || 'Not Set'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className='mb-6'>
          <Text className='text-lg font-bold mb-4 text-gray-900 dark:text-gray-100'>
            Database Tools
          </Text>
          <TouchableOpacity
            onPress={handleWipeDatabase}
            className='flex-row items-center bg-red-100 dark:bg-red-900/30 p-4 rounded-xl border border-red-200 dark:border-red-800'
          >
            <View className='bg-red-500 p-2 rounded-lg mr-4'>
              <Ionicons name='refresh-outline' size={24} color='white' />
            </View>
            <View className='flex-1'>
              <Text className='text-red-700 dark:text-red-400 font-bold'>
                Wipe Local Database
              </Text>
              <Text className='text-red-600 dark:text-red-500/80 text-xs'>
                Clears all local sync data and reloads the app. Use to fix
                schema mismatches.
              </Text>
            </View>
            <Ionicons name='chevron-forward' size={20} color='#ef4444' />
          </TouchableOpacity>
        </View>

        <View className='mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800'>
          <View className='flex-row items-center mb-2'>
            <Ionicons name='information-circle' size={20} color='#3b82f6' />
            <Text className='text-blue-700 dark:text-blue-400 font-bold ml-2'>
              Note
            </Text>
          </View>
          <Text className='text-blue-600 dark:text-blue-500/80 text-sm'>
            Wiping the database won't delete data on the server. It only forces
            a fresh sync from PowerSync.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
