import { useUser } from '@clerk/clerk-expo';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { Stack } from 'expo-router';
import { canViewHoursMetadata, isManagerMetadata } from '@/utils/userRoles';

export default function Page() {
  const { user } = useUser();
  const isManager = isManagerMetadata(user?.publicMetadata);
  // Role eligibility only — the approval gate is applied in DashboardView.
  const canViewHoursRole = canViewHoursMetadata(user?.publicMetadata);

  if (!user?.id) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false
        }}
      />
      <DashboardView userId={user?.id} isManager={isManager} canViewHoursRole={canViewHoursRole} />
    </>
  );
}
