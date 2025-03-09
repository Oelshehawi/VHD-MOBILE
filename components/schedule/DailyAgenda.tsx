import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { format, parseISO } from 'date-fns';
import { AppointmentType, Schedule } from '@/types';
import { formatTimeUTC, formatDateReadable } from '@/utils/date';
import { getAppointmentsForDay } from '@/utils/calendar';
import { Ionicons } from '@expo/vector-icons';
import { openMaps } from '@/utils/dashboard';
import { PhotoDocumentationModal } from './PhotoDocumentationModal';

interface DailyAgendaProps {
  selectedDate: string; // ISO string in UTC
  schedules: Schedule[];
  onSchedulePress: (id: string) => void;
  isManager?: boolean;
}

// Helper function to safely extract technician ID
const getTechnicianId = (technicians: any): string => {
  if (typeof technicians === 'string') {
    return technicians.split(',')[0] || '';
  }
  if (Array.isArray(technicians) && technicians.length > 0) {
    return technicians[0];
  }
  return '';
};

export function DailyAgenda({
  selectedDate,
  schedules,
  onSchedulePress,
  isManager = false,
}: DailyAgendaProps) {
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(
    null
  );

  // Group schedules by time slot for better visualization
  const groupedSchedules = schedules.reduce(
    (acc: Record<string, Schedule[]>, schedule) => {
      try {
        const date = parseISO(schedule.startDateTime);
        const hour = date.getHours();
        const timeSlot =
          hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

        if (!acc[timeSlot]) {
          acc[timeSlot] = [];
        }

        acc[timeSlot].push(schedule);
      } catch (err) {
        console.error('Error parsing date', schedule.startDateTime);
      }
      return acc;
    },
    {}
  );

  // Define time slots order
  const timeSlots = ['Morning', 'Afternoon', 'Evening'];

  // Handle map navigation without interfering with schedule press
  const handleMapPress = (e: any, jobTitle: string, location: string) => {
    e.stopPropagation(); // Prevent the parent TouchableOpacity from being triggered
    openMaps(jobTitle, location);
  };

  // Handle photo documentation access
  const handlePhotoDocumentationPress = (e: any, schedule: Schedule) => {
    e.stopPropagation(); // Prevent the schedule card from being triggered
    setSelectedSchedule(schedule);
    setPhotoModalVisible(true);
  };

  return (
    <View className='flex-1 bg-white dark:bg-gray-900 p-4'>
      <Text className='text-xl font-bold mb-4 text-gray-900 dark:text-white'>
        {formatDateReadable(new Date(selectedDate))}
      </Text>

      <ScrollView className='flex-1'>
        {schedules.length === 0 ? (
          <View className='py-6 items-center'>
            <Text className='text-gray-500 dark:text-gray-400 text-center italic'>
              No schedules for this day
            </Text>
          </View>
        ) : (
          <View className='flex-col'>
            {timeSlots.map((timeSlot) => {
              const slotSchedules = groupedSchedules[timeSlot] || [];
              if (slotSchedules.length === 0) return null;

              return (
                <View key={timeSlot} className='mb-6'>
                  <Text className='text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200'>
                    {timeSlot}
                  </Text>
                  <View className='flex flex-col gap-3'>
                    {slotSchedules.map((schedule) => {
                      let startTime = '';
                      try {
                        // Ensure we're using UTC time display
                        const date = parseISO(schedule.startDateTime);
                        // Use formatTimeUTC to ensure UTC time display
                        startTime = formatTimeUTC(date);
                      } catch (err) {
                        console.error(
                          'Error formatting time',
                          schedule.startDateTime
                        );
                      }

                      // Determine status color and icon
                      let statusColor = 'bg-gray-100 dark:bg-gray-700';
                      let statusBorder = 'border-l-gray-300';
                      let statusIcon: 'time' | 'checkmark-circle' = 'time';

                      if (schedule.confirmed) {
                        statusColor = 'bg-green-50 dark:bg-green-900/20';
                        statusBorder = 'border-l-green-500';
                        statusIcon = 'checkmark-circle';
                      }

                      // Check if photos exist
                      let hasPhotos = false;
                      let hasTechnicianNotes = false;
                      try {
                        if ('photos' in schedule && schedule.photos) {
                          const photosData =
                            typeof schedule.photos === 'string'
                              ? JSON.parse(schedule.photos)
                              : schedule.photos;

                          hasPhotos =
                            (photosData.before &&
                              photosData.before.length > 0) ||
                            (photosData.after && photosData.after.length > 0);
                        }

                        // Check if technician notes exist
                        hasTechnicianNotes =
                          'technicianNotes' in schedule &&
                          !!schedule.technicianNotes &&
                          typeof schedule.technicianNotes === 'string' &&
                          schedule.technicianNotes.trim() !== '';
                      } catch (err) {
                        console.error('Error parsing photos', err);
                      }

                      // Determine if we should show notification badge
                      const showNotificationBadge = hasTechnicianNotes;

                      return (
                        <TouchableOpacity
                          key={schedule.id}
                          onPress={() => onSchedulePress(schedule.id)}
                          className={`${statusColor} rounded-lg overflow-hidden border-l-4 ${statusBorder}`}
                        >
                          <View className='p-4'>
                            <View className='flex-row justify-between items-start'>
                              <View className='flex-1'>
                                <Text className='text-lg font-medium text-gray-900 dark:text-white mb-1'>
                                  {schedule.jobTitle}
                                </Text>
                                <Text className='text-gray-500 dark:text-gray-400 mb-2'>
                                  {startTime} •{' '}
                                  {schedule.assignedTechnicians
                                    ? 'Assigned'
                                    : 'Unassigned'}
                                </Text>
                                <View className='flex-row items-center'>
                                  <Ionicons
                                    name='location-outline'
                                    size={16}
                                    color='#9CA3AF'
                                  />
                                  <Text
                                    numberOfLines={1}
                                    className='text-gray-500 dark:text-gray-400 ml-1'
                                  >
                                    {schedule.location}
                                  </Text>
                                </View>
                              </View>

                              <View className='flex-row'>
                                {/* Camera/Photo Documentation Button */}
                                <TouchableOpacity
                                  onPress={(e) =>
                                    handlePhotoDocumentationPress(e, schedule)
                                  }
                                  className='bg-blue-500 p-2 rounded-full mr-2 relative'
                                >
                                  <Ionicons
                                    name={hasPhotos ? 'images' : 'camera'}
                                    size={20}
                                    color='#ffffff'
                                  />

                                  {/* Notification Badge for Technician Notes */}
                                  {showNotificationBadge && (
                                    <View className='absolute -top-1 -right-1 bg-red-500 rounded-full w-3 h-3'></View>
                                  )}
                                </TouchableOpacity>

                                {/* Map Button */}
                                <TouchableOpacity
                                  onPress={(e) =>
                                    handleMapPress(
                                      e,
                                      schedule.jobTitle,
                                      schedule.location
                                    )
                                  }
                                  className='bg-darkGreen p-2 rounded-full'
                                >
                                  <Ionicons
                                    name='navigate'
                                    size={20}
                                    color='#ffffff'
                                  />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Photo Documentation Modal */}
      {selectedSchedule && (
        <PhotoDocumentationModal
          visible={photoModalVisible}
          onClose={() => {
            setPhotoModalVisible(false);
            setSelectedSchedule(null);
          }}
          scheduleId={selectedSchedule.id}
          jobTitle={selectedSchedule.jobTitle}
          technicianId={getTechnicianId(selectedSchedule.assignedTechnicians)}
          location={selectedSchedule.location}
        />
      )}
    </View>
  );
}
