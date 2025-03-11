import { useAuth } from '@clerk/clerk-expo';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { Stack } from 'expo-router';

export default function Page() {
  const { userId, has } = useAuth();
  // Use Clerk's has() method to determine if user has management permissions
  const isManager = !!has?.({ permission: 'org:database:allow' });

  if (!userId) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <DashboardView userId={userId} isManager={isManager} />
    </>
  );
}
