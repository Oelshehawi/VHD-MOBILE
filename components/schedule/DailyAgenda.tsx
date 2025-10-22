import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { parseISO, format, addDays } from 'date-fns';
import { Schedule } from '@/types';
import { formatTimeUTC, formatDateReadable } from '@/utils/date';
import Ionicons from '@expo/vector-icons/Ionicons';
import { openMaps } from '@/utils/dashboard';
import { PhotoDocumentationModal } from '../PhotoComponents/PhotoDocumentationModal';
import { InvoiceModal } from './InvoiceModal';
import { WeatherService, WeatherData } from '@/services/weather/WeatherService';
import { GeocodingService } from '@/services/weather/GeocodingService';

interface DailyAgendaProps {
  selectedDate: string; // ISO string in UTC
  schedules: Schedule[];
  isManager?: boolean;
  userId: string;
  onDateChange?: (date: string) => void; // For navigation
  showSevereWeatherAlert?: boolean; // Add this prop to control weather alert visibility
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
  isManager,
  userId,
  onDateChange,
  showSevereWeatherAlert = true, // Default to true for backward compatibility
}: DailyAgendaProps) {
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(
    null
  );
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [selectedScheduleForInvoice, setSelectedScheduleForInvoice] =
    useState<Schedule | null>(null);
  const [weatherDataMap, setWeatherDataMap] = useState<
    Map<string, WeatherData>
  >(new Map());

  // Load weather for all locations on selected date
  useEffect(() => {
    loadWeatherForDate();
  }, [schedules, selectedDate]);

  const loadWeatherForDate = async () => {
    const locationSet = new Set<string>();

    // Collect unique locations
    schedules.forEach((schedule) => {
      if (schedule.location) {
        locationSet.add(schedule.location);
      }
    });

    const weatherMap = new Map<string, WeatherData>();
    const dateStr = format(parseISO(selectedDate), 'yyyy-MM-dd');

    // Fetch weather for each location
    for (const location of locationSet) {
      const coords = await GeocodingService.getCoordinates(location);
      if (!coords) continue;

      const forecast = await WeatherService.getForecast(
        coords.latitude,
        coords.longitude
      );
      const dayWeather = forecast.find((day) => day.date === dateStr);
      if (dayWeather) {
        weatherMap.set(location, dayWeather);
      }
    }

    setWeatherDataMap(weatherMap);
  };

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
    openMaps(location, jobTitle);
  };

  // Handle photo documentation access
  const handlePhotoDocumentationPress = (e: any, schedule: Schedule) => {
    e.stopPropagation(); // Prevent the schedule card from being triggered
    setSelectedSchedule(schedule);
    setPhotoModalVisible(true);
  };

  // Function to handle invoice press
  const handleInvoicePress = (e: any, schedule: Schedule) => {
    e.stopPropagation(); // Prevent the schedule card from being triggered
    if (schedule.invoiceRef) {
      setSelectedScheduleForInvoice(schedule);
      setInvoiceModalVisible(true);
    } else {
    }
  };

  // Check for severe weather conditions
  const severeWeatherJobs = schedules.filter((schedule) => {
    const weather = weatherDataMap.get(schedule.location);
    return weather && WeatherService.isSevereWeather(weather);
  });

  const goToPreviousDay = () => {
    if (onDateChange) {
      const previousDate = addDays(parseISO(selectedDate), -1);
      onDateChange(previousDate.toISOString());
    }
  };

  const goToNextDay = () => {
    if (onDateChange) {
      const followingDate = addDays(parseISO(selectedDate), 1);
      onDateChange(followingDate.toISOString());
    }
  };

  return (
    <View className='flex-1 bg-white dark:bg-gray-900 p-4'>
      {/* Date Navigation Header - only show in day view */}
      {onDateChange && (
        <View className='flex-row items-center justify-between mb-4'>
          <TouchableOpacity
            onPress={goToPreviousDay}
            className='p-2 bg-gray-100 dark:bg-gray-800 rounded-full'
          >
            <Ionicons name='chevron-back' size={20} color='#6B7280' />
          </TouchableOpacity>

          <Text className='text-xl font-bold text-gray-900 dark:text-white'>
            {formatDateReadable(new Date(selectedDate))}
          </Text>

          <TouchableOpacity
            onPress={goToNextDay}
            className='p-2 bg-gray-100 dark:bg-gray-800 rounded-full'
          >
            <Ionicons name='chevron-forward' size={20} color='#6B7280' />
          </TouchableOpacity>
        </View>
      )}

      {/* Date header for month view (no navigation arrows) */}
      {!onDateChange && (
        <Text className='text-xl font-bold mb-4 text-gray-900 dark:text-white'>
          {formatDateReadable(new Date(selectedDate))}
        </Text>
      )}

      {/* Severe Weather Alert - conditionally show based on prop */}
      {showSevereWeatherAlert && severeWeatherJobs.length > 0 && (
        <View className='mb-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3'>
          <View className='flex-row items-start gap-2'>
            <Text className='text-2xl'>⚠️</Text>
            <View className='flex-1'>
              <Text className='font-semibold text-yellow-800 dark:text-yellow-200 mb-1'>
                Severe Weather Alert
              </Text>
              <Text className='text-sm text-yellow-700 dark:text-yellow-300'>
                {severeWeatherJobs.length} job
                {severeWeatherJobs.length !== 1 ? 's' : ''} affected by adverse
                weather conditions
              </Text>
              <View className='mt-2 gap-1'>
                {severeWeatherJobs.slice(0, 3).map((job) => {
                  const weather = weatherDataMap.get(job.location)!;
                  return (
                    <Text
                      key={job.id}
                      className='text-xs text-yellow-700 dark:text-yellow-300'
                    >
                      • {job.jobTitle}: {weather.condition.text} (
                      {Math.round(weather.temp_c)}°)
                    </Text>
                  );
                })}
                {severeWeatherJobs.length > 3 && (
                  <Text className='text-xs text-yellow-700 dark:text-yellow-300'>
                    • +{severeWeatherJobs.length - 3} more...
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

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
                          onPress={(e) => handleInvoicePress(e, schedule)}
                          className={`${statusColor} rounded-lg overflow-hidden border-l-4 ${statusBorder}`}
                        >
                          <View className='p-4'>
                            <View className='flex-row justify-between items-start'>
                              <View className='flex-1'>
                                <View className='flex-row items-start gap-2 mb-1'>
                                  <Text
                                    className='flex-1 text-lg font-medium text-gray-900 dark:text-white pr-2'
                                    numberOfLines={2}
                                    ellipsizeMode='tail'
                                  >
                                    {schedule.jobTitle}
                                  </Text>
                                  {/* Weather Indicator */}
                                  {weatherDataMap.get(schedule.location) && (
                                    <View className='flex-row items-center gap-1 flex-shrink-0'>
                                      <Image
                                        source={{
                                          uri: WeatherService.getIconUrl(
                                            weatherDataMap.get(
                                              schedule.location
                                            )!.condition.icon
                                          ),
                                        }}
                                        style={{ width: 20, height: 20 }}
                                      />
                                      <Text className='text-sm font-semibold text-gray-700 dark:text-gray-300'>
                                        {Math.round(
                                          weatherDataMap.get(schedule.location)!
                                            .temp_c
                                        )}
                                        °
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Text className='text-gray-500 dark:text-gray-400 mb-2'>
                                  {startTime} •{' '}
                                  {schedule.assignedTechnicians
                                    ? 'Assigned'
                                    : 'Unassigned'}
                                </Text>

                                {/* Add technician notes indicator below the job info */}
                                {showNotificationBadge && (
                                  <View className='mb-2 flex-row items-center bg-red-50 px-2 py-1 rounded-md'>
                                    <Ionicons
                                      name='document-text'
                                      size={14}
                                      color='#EF4444'
                                    />
                                    <Text className='text-xs text-red-600 font-medium ml-1'>
                                      Technician Notes
                                    </Text>
                                  </View>
                                )}

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

                                  {/* Remove notification badge from here */}
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
          onClose={() => setPhotoModalVisible(false)}
          scheduleId={selectedSchedule.id}
          jobTitle={selectedSchedule.jobTitle}
          location={selectedSchedule.location}
          startDate={selectedSchedule.startDateTime}
          technicianId={getTechnicianId(selectedSchedule.assignedTechnicians)}
        />
      )}

      {/* Invoice Modal */}
      {selectedScheduleForInvoice && (
        <InvoiceModal
          visible={invoiceModalVisible}
          onClose={() => setInvoiceModalVisible(false)}
          scheduleId={selectedScheduleForInvoice.id}
          technicianId={userId}
          isManager={isManager || false}
        />
      )}
    </View>
  );
}
