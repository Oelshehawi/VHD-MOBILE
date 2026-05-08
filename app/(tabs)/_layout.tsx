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
            backgroundColor: isDark ? '#030712' : '#F7F5F1'
          },
          headerTintColor: isDark ? '#F2EFEA' : '#14110F',
          tabBarStyle: {
            backgroundColor: isDark ? '#16140F' : '#FFFFFF',
            borderTopColor: isDark ? 'rgba(255,250,240,.12)' : 'rgba(20,17,15,.10)',
            paddingBottom: insets.bottom,
            paddingTop: 4
          },
          tabBarActiveTintColor: isDark ? '#FBBF24' : '#14110F',
          tabBarInactiveTintColor: isDark ? '#8A857D' : '#76706A'
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
