import {
  View,
  Text,
  SafeAreaView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { MonthView } from '../../components/schedule/MonthView';
import { InvoiceType, Schedule } from '@/types';
import { InvoiceModal } from '../../components/schedule/InvoiceModal';
import { Stack } from 'expo-router';
import { usePowerSync, useQuery } from '@powersync/react-native';

interface AppointmentType {
  id: string;
  startTime: string;
  endTime: string;
  clientName: string;
  serviceType: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export default function Page() {
  const { userId, getToken } = useAuth();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );
  const [isManager, setIsManager] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    // Subtract 8 hours to convert from UTC to PST
    const pstTime = now.getTime() - 8 * 60 * 60 * 1000;
    return new Date(pstTime).toISOString();
  });

  // Use PowerSync queries directly
  const { data: schedules = [] } = useQuery<Schedule>(
    `SELECT * FROM schedules 
     WHERE assignedTechnicians LIKE ? 
     OR ? = true
     ORDER BY startDateTime ASC`,
    [userId ? `%${userId}%` : '', isManager]
  );

  const { data: invoices = [] } = useQuery<InvoiceType>(
    `SELECT * FROM invoices`
  );

  // Only run this query when we have a selectedInvoiceId
  const { data: selectedInvoice = [] } = useQuery<InvoiceType>(
    selectedInvoiceId
      ? `SELECT * FROM invoices WHERE id = ?`
      : `SELECT * FROM invoices WHERE 0`,
    [selectedInvoiceId || '']
  );

  const handleAppointmentPress = useCallback(
    async (appointmentId: string) => {
      const schedule = schedules?.find((s) => s.id === appointmentId);
      if (!schedule?.invoiceRef) {
        console.log('No invoice reference found for schedule:', appointmentId);
        return;
      }
      setSelectedInvoiceId(schedule.invoiceRef);
    },
    [schedules]
  );

  const handleDayPress = useCallback((date: string) => {
    // When a day is clicked, keep it in PST
    const selectedDate = new Date(date);
    // No need to adjust time since the date from MonthView is already in correct timezone
    setCurrentDate(selectedDate.toISOString());
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedInvoiceId(null);
  }, []);

  const appointments: AppointmentType[] = schedules
    .map((schedule) => {
      if (!schedule.startDateTime) return null;

      const hours = schedule.hours || 4;
      const startTime = schedule.startDateTime;
      const endTime = new Date(
        new Date(startTime).getTime() + hours * 60 * 60 * 1000
      ).toISOString();

      return {
        id: schedule.id,
        startTime,
        endTime,
        clientName: schedule.jobTitle,
        serviceType: schedule.location,
        status: schedule.confirmed
          ? ('scheduled' as const)
          : schedule.deadRun
          ? ('cancelled' as const)
          : ('scheduled' as const),
      };
    })
    .filter((apt): apt is NonNullable<typeof apt> => apt !== null);

  useEffect(() => {
    const checkManager = async () => {
      const token = await getToken();
      if (!token) {
        setIsManager(false);
        return;
      }

      try {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        setIsManager(decoded?.publicMetadata?.isManager || false);
      } catch (e) {
        console.error('Error decoding token:', e);
        setIsManager(false);
      }
    };

    checkManager();
  }, [getToken]);

  return (
    <SafeAreaView className='flex-1 bg-gray-950'>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <StatusBar
        barStyle='light-content'
        backgroundColor='#111827'
        translucent={false}
      />
      <View className='flex-1'>
        <MonthView
          appointments={appointments}
          onAppointmentPress={handleAppointmentPress}
          onDayPress={handleDayPress}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />
      </View>
      <InvoiceModal
        visible={!!selectedInvoice.length}
        onClose={handleCloseModal}
        invoice={selectedInvoice[0] || null}
        canManage={isManager}
        technicianId={userId || ''}
      />
    </SafeAreaView>
  );
}
