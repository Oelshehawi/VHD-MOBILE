import { useCallback, useState } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { Stack } from 'expo-router';
import { ScheduleView } from '../../components/schedule/ScheduleView';
import { startOfDay } from 'date-fns';
import { isManagerMetadata } from '@/utils/userRoles';
import { getServiceDayStartIsoForInstant } from '@/utils/scheduleTime';

export default function Page() {
  const { user } = useUser();
  const isManager = isManagerMetadata(user?.publicMetadata);

  const [currentDate, setCurrentDate] = useState(() => {
    return getServiceDayStartIsoForInstant();
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
          headerShown: false
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
