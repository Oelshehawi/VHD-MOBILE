import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { format } from 'date-fns';
import { AppointmentType } from '@/types';
import { formatTimeUTC } from '@/utils/date';
import { getAppointmentsForDay } from '@/utils/calendar';

interface DailyAgendaProps {
  selectedDate: Date;
  appointments: AppointmentType[];
  onAppointmentPress: (id: string) => void;
}

export function DailyAgenda({
  selectedDate,
  appointments,
  onAppointmentPress,
}: DailyAgendaProps) {
  const dayAppointments = getAppointmentsForDay(selectedDate, appointments);

  return (
    <View className='bg-gray-900 p-4 min-h-[200]'>
      <Text className='text-gray-200 text-lg mb-4'>
        {format(selectedDate, 'MMMM d, yyyy')}
      </Text>
      <ScrollView>
        <View className='flex flex-col gap-2'>
          {dayAppointments.map((apt) => (
            <TouchableOpacity
              key={apt.id}
              className='bg-gray-800 rounded-lg p-4'
              onPress={() => onAppointmentPress(apt.id)}
            >
              <View className='flex-row justify-between items-center'>
                <Text className='text-gray-200 font-medium'>
                  {formatTimeUTC(new Date(apt.startTime))}
                </Text>
                <View
                  className={`w-2 h-2 rounded-full ${
                    apt.status === 'cancelled'
                      ? 'bg-red-500'
                      : apt.status === 'completed'
                      ? 'bg-darkGreen'
                      : 'bg-blue-500'
                  }`}
                />
              </View>
              <Text className='text-gray-200 text-lg'>
                {apt.clientName.trim()}
              </Text>
              <Text className='text-gray-400'>{apt.serviceType}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
