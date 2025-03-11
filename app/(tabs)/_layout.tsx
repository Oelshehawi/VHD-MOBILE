import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, Redirect, SplashScreen } from 'expo-router';
import '../global.css';
import { ClerkLoaded, useUser } from '@clerk/clerk-expo';
import Logger from 'js-logger';
import { useEffect } from 'react';

Logger.useDefaults();

Logger.setLevel(Logger.DEBUG);

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  return (
    <ClerkLoaded>
      <Tabs
        screenOptions={{
          headerStyle: {
          backgroundColor: '#111827', // gray-900
        },
        headerTintColor: '#e5e7eb', // gray-200
        tabBarStyle: {
          backgroundColor: '#111827', // gray-900
          borderTopColor: '#1f2937', // gray-800
        },
        tabBarActiveTintColor: '#0ea5e9', // blue-500
        tabBarInactiveTintColor: '#9ca3af', // gray-400
      }}
    >
      <Tabs.Screen
        name='index'
        options={{
          title: 'Dashboard',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <FontAwesome name='home' size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='schedule'
        options={{
          title: 'Schedule',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <FontAwesome name='calendar' size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='profile'
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name='user' color={color} />,
        }}
      />
    </Tabs>
    </ClerkLoaded>
  );
}
