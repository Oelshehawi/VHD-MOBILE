import { useUser } from '@clerk/clerk-expo';
import { DashboardView } from '@/components/dashboard/DashboardView';

export default function Page() {
  const { user } = useUser();
  // Use Clerk's has() method to determine if user has management permissions
  const isManager = !!user?.publicMetadata.isManager;

  if (!user?.id) return null;

  return (
    <>
      <DashboardView userId={user?.id} isManager={isManager} />
    </>
  );
}
