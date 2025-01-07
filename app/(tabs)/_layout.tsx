import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, Redirect } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import '../global.css';
import { useAuth } from '@clerk/clerk-expo';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return <Redirect href='/sign-in' />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0891b2', // cyan-600
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#1f2937' : 'white',
        },
      }}
    >
      <Tabs.Screen
        name='index'
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <TabBarIcon name='home' color={color} />,
        }}
      />
      <Tabs.Screen
        name='schedule'
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name='calendar' color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='invoices'
        options={{
          title: 'Invoices',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name='file-text-o' color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='profile'
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name='user' color={color} />,
        }}
      />
    </Tabs>
  );
}
