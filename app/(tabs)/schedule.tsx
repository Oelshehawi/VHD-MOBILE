import { View, Text } from 'react-native';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { createSchedulesApi, createInvoicesApi } from '../../services/api';
import { MonthView } from '../../components/schedule/MonthView';
import { ScheduleType, InvoiceType } from '../../types';
import { InvoiceModal } from '../../components/schedule/InvoiceModal';
import { Stack } from 'expo-router';
import { toUTCDate } from '../../utils/date';

export default function Page() {
  const { getToken, userId } = useAuth();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceType | null>(
    null
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<ScheduleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [canManage, setCanManage] = useState(false);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const api = createSchedulesApi(token);
      if (!api) throw new Error('Failed to initialize API');

      const result = await api.getAll();
      setSchedules(result.schedules);
      setCanManage(result.canManage);
    } catch (err) {
      console.error('Error fetching schedules:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchInvoice = async () => {
      if (!selectedInvoiceId) return;

      try {
        const token = await getToken();
        const api = createInvoicesApi(token);
        if (!mounted || !api) return;

        const invoice = await api.getById(selectedInvoiceId);
        if (mounted) setSelectedInvoice(invoice);
      } catch (error) {
        console.error('Error fetching invoice:', error);
        if (mounted) setSelectedInvoice(null);
      }
    };

    fetchInvoice();
    return () => {
      mounted = false;
    };
  }, [selectedInvoiceId]);

  const appointments = useMemo(() => {
    if (!schedules?.length) return [];

    return schedules
      .map((schedule) => {
        const startDateTime = toUTCDate(schedule.startDateTime);
        if (isNaN(startDateTime.getTime())) return null;

        return {
          id: schedule._id,
          startTime: startDateTime,
          endTime: new Date(
            startDateTime.getTime() + (schedule.hours || 4) * 60 * 60 * 1000
          ),
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
  }, [schedules]);

  const handleAppointmentPress = useCallback(
    (appointmentId: string) => {
      const schedule = schedules?.find((s) => s._id === appointmentId);
      if (!schedule) return;
      setSelectedInvoiceId(schedule.invoiceRef as string);
    },
    [schedules]
  );

  const handleDayPress = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedInvoiceId(null);
    setSelectedInvoice(null);
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View className='flex-1 bg-gray-950 justify-center items-center'>
          <Text className='text-gray-400'>Loading schedules...</Text>
        </View>
      ) : error ? (
        <View className='flex-1 bg-gray-950 justify-center items-center p-4'>
          <Text className='text-red-500 text-center mb-4'>
            Error loading schedules
          </Text>
          <Text className='text-gray-400 text-center'>{error.message}</Text>
        </View>
      ) : (
        <View className='flex-1 bg-gray-950'>
          <MonthView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            appointments={appointments}
            onDayPress={handleDayPress}
            onAppointmentPress={handleAppointmentPress}
          />
          <InvoiceModal
            visible={!!selectedInvoiceId}
            onClose={handleCloseModal}
            invoice={selectedInvoice}
            canManage={canManage}
            technicianId={userId || ''}
          />
        </View>
      )}
    </>
  );
}
