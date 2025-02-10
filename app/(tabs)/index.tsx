import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { ManagerDashboardView } from '@/components/views/manager/DashboardView';
import { TechnicianDashboardView } from '@/components/views/technician/DashboardView';
import { useManagerStatus } from '@/providers/ManagerStatusProvider';

export default function Page() {
  const { userId} = useAuth();
  
  const { isManager } = useManagerStatus();

  if (!userId) return null;

  return isManager ? (
    <ManagerDashboardView userId={userId} />
  ) : (
    <TechnicianDashboardView userId={userId} />
  );
}
