import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { useManagerStatus } from '@/providers/ManagerStatusProvider';
import { StatusBar } from 'react-native';

export default function Page() {
  const { userId } = useAuth();
  const { isManager } = useManagerStatus();

  if (!userId) return null;

  return (
    <>
      <StatusBar barStyle='dark-content' backgroundColor='#F9FAFB' />
      <DashboardView userId={userId} isManager={isManager} />
    </>
  );
}
