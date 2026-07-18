import { useUser } from '@clerk/clerk-expo';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { Stack } from 'expo-router';
import { canViewHoursMetadata, isManagerMetadata } from '@/utils/userRoles';
import { getMobileStaffIdentity } from '@/utils/staffIdentity';

export default function Page() {
  const { user } = useUser();
  const isManager = isManagerMetadata(user?.publicMetadata);
  // Role eligibility only — the approval gate is applied in DashboardView.
  const canViewHoursRole = canViewHoursMetadata(user?.publicMetadata);
  const identity = getMobileStaffIdentity(user?.publicMetadata);

  if (!identity) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false
        }}
      />
      <DashboardView
        fieldStaffId={identity.fieldStaffId ?? ''}
        isManager={isManager}
        canViewHoursRole={canViewHoursRole}
      />
    </>
  );
}
