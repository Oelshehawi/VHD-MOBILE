import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { Stack } from 'expo-router';
import { ScheduleView } from '../../components/schedule/ScheduleView';
import { useManagerStatus } from '@/providers/ManagerStatusProvider';
import { startOfDay } from 'date-fns';

export default function Page() {
  const { userId } = useAuth();
  const { isManager } = useManagerStatus();

  const [currentDate, setCurrentDate] = useState(() => {
    // Use date-fns to get start of today in local time
    return startOfDay(new Date()).toISOString();
  });

  const handleDateChange = useCallback((date: string) => {
    // Ensure we're always using start of day
    const newDate = startOfDay(new Date(date));
    setCurrentDate(newDate.toISOString());
  }, []);

  if (!userId) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <ScheduleView
        userId={userId}
        currentDate={currentDate}
        onDateChange={handleDateChange}
        isManager={isManager}
      />
    </>
  );
}
