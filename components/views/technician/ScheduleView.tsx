import { View, SafeAreaView, StatusBar } from 'react-native';
import { MonthView } from '../../schedule/MonthView';
import { TechnicianInvoiceModal } from '../technician/InvoiceModal';
import { useCallback, useState } from 'react';
import { useSchedules, useInvoiceById } from '@/services/data/schedules';
import { AppointmentType } from '@/types';

interface TechnicianScheduleViewProps {
  userId: string;
  currentDate: string;
  onDateChange: (date: string) => void;
}

export function TechnicianScheduleView({
  userId,
  currentDate,
  onDateChange,
}: TechnicianScheduleViewProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );

  const { data: schedules = [] } = useSchedules(false, userId);
  const { data: selectedInvoice = [] } = useInvoiceById(selectedInvoiceId);

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

  const handleDayPress = useCallback(
    (date: string) => {
      const selectedDate = new Date(date);
      onDateChange(selectedDate.toISOString());
    },
    [onDateChange]
  );

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

  return (
    <SafeAreaView className='flex-1 bg-gray-950'>
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
          onDateChange={onDateChange}
        />
      </View>
      <TechnicianInvoiceModal
        visible={!!selectedInvoice.length}
        onClose={handleCloseModal}
        invoice={selectedInvoice[0] || null}
        technicianId={userId}
      />
    </SafeAreaView>
  );
}
