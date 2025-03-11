import { useCallback, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Stack } from 'expo-router';
import { ScheduleView } from '../../components/schedule/ScheduleView';
import { startOfDay } from 'date-fns';

export default function Page() {
  const { user } = useUser();
  // Use Clerk's has() method to determine if user has management permissions
  const isManager = !!user?.publicMetadata.isManager;

  const [currentDate, setCurrentDate] = useState(() => {
    // Use date-fns to get start of today in local time
    return startOfDay(new Date()).toISOString();
  });

  const handleDateChange = useCallback((date: string) => {
    // Ensure we're always using start of day
    const newDate = startOfDay(new Date(date));
    setCurrentDate(newDate.toISOString());
  }, []);

  if (!user?.id) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <ScheduleView
        userId={user?.id}
        currentDate={currentDate}
        onDateChange={handleDateChange}
        isManager={isManager}
      />
    </>
  );
}
