import { View, Text } from 'react-native';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import { createSchedulesApi, createInvoicesApi } from '../../services/api';
import { useAuth } from '@clerk/clerk-expo';
import { MonthView } from '../../components/schedule/MonthView';
import { ScheduleType, InvoiceType } from '../../types';
import { InvoiceModal } from '../../components/schedule/InvoiceModal';
import { Stack } from 'expo-router';
import { toUTCDate } from '../../utils/date';
import { isSameDay } from 'date-fns';

export default function ScheduleScreen() {
  const { getToken } = useAuth();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceType | null>(
    null
  );
  const [currentDate, setCurrentDate] = useState(new Date());

  const schedulesApi = useMemo(
    () => getToken().then((token) => createSchedulesApi(token)),
    [getToken]
  );

  const {
    data: schedules,
    loading,
    error,
  } = useApi<ScheduleType>(schedulesApi);

  const invoicesApi = useMemo(
    () => getToken().then((token) => createInvoicesApi(token)),
    [getToken]
  );

  useEffect(() => {
    let mounted = true;

    if (selectedInvoiceId && !selectedInvoice) {
      invoicesApi.then((api) => {
        if (!mounted || !api) return;
        api
          .getById(selectedInvoiceId)
          .then((invoice) => {
            if (mounted) setSelectedInvoice(invoice);
          })
          .catch((error) => {
            if (mounted) {
              console.error('Error fetching invoice:', error);
              setSelectedInvoice(null);
            }
          });
      });
    }

    return () => {
      mounted = false;
    };
  }, [selectedInvoiceId, invoicesApi, selectedInvoice]);

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

      if (isSameDay(toUTCDate(schedule.startDateTime), new Date())) {
        console.log("👆 Today's appointment pressed:", {
          time: toUTCDate(schedule.startDateTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'UTC',
          }),
          client: schedule.jobTitle,
        });
      }
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

  if (!schedules || loading) {
    return (
      <View className='flex-1 bg-gray-950 justify-center items-center'>
        <Text className='text-gray-400'>
          {!schedules ? 'Authenticating...' : 'Loading schedules...'}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className='flex-1 bg-gray-950 justify-center items-center p-4'>
        <Text className='text-red-500 text-center mb-4'>
          Error loading schedules
        </Text>
        <Text className='text-gray-400 text-center'>{error.message}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
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
        />
      </View>
    </>
  );
}
