import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, Redirect } from 'expo-router';
import '../global.css';
import { ClerkLoaded, useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/providers/ThemeProvider';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { isSignedIn, isLoaded } = useUser();
  const { colorScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';

  if (!isLoaded) {
    return null;
  }
  if (!isSignedIn) {
    return <Redirect href='/sign-in' />;
  }

  return (
    <ClerkLoaded>
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: isDark ? '#111827' : '#ffffff' // dark: gray-900, light: white
          },
          headerTintColor: isDark ? '#e5e7eb' : '#111827', // dark: gray-200, light: gray-900
          tabBarStyle: {
            backgroundColor: isDark ? '#111827' : '#ffffff', // dark: gray-900, light: white
            borderTopColor: isDark ? '#1f2937' : '#e5e7eb', // dark: gray-800, light: gray-200
            paddingBottom: insets.bottom,
            paddingTop: 4
          },
          tabBarActiveTintColor: '#0ea5e9', // blue-500 for both themes
          tabBarInactiveTintColor: isDark ? '#9ca3af' : '#6b7280' // dark: gray-400, light: gray-500
        }}
      >
        <Tabs.Screen
          name='index'
          options={{
            title: 'Dashboard',
            headerShown: false,
            tabBarIcon: ({ color }) => <FontAwesome name='home' size={24} color={color} />
          }}
        />
        <Tabs.Screen
          name='schedule'
          options={{
            title: 'Schedule',
            headerShown: false,
            tabBarIcon: ({ color }) => <FontAwesome name='calendar' size={24} color={color} />
          }}
        />
        <Tabs.Screen
          name='profile'
          options={{
            title: 'Profile',
            headerShown: false,
            tabBarIcon: ({ color }) => <TabBarIcon name='user' color={color} />
          }}
        />
      </Tabs>
    </ClerkLoaded>
  );
}
