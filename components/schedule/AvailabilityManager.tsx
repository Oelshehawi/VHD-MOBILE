import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  useColorScheme
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, usePowerSync } from '@powersync/react-native';
import { useUser } from '@clerk/clerk-expo';
import { TimePickerInput } from './TimePickerInput';
import { DatePickerInput } from './DatePickerInput';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { generateObjectId } from '@/utils/objectId';
import {
  validateTimeRange,
  validateNoConflicts,
  formatAvailabilityDisplay,
  getDayName
} from '../../utils/availabilityValidation';
import type { Availability } from '../../services/database/schema';

interface AvailabilityFormData {
  availabilityId?: string;
  dayOfWeek?: number;
  startTime: string;
  endTime: string;
  isFullDay: boolean;
  isRecurring: boolean;
  specificDate?: string;
}

/**
 * AvailabilityManager Component
 * Main screen for managing technician unavailable-time blocks
 */
export const AvailabilityManager: React.FC<{ onNavigateBack?: () => void }> = ({
  onNavigateBack
}) => {
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const powerSync = usePowerSync();
  const colorScheme = useColorScheme();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [confirmationAction, setConfirmationAction] = useState<(() => void) | null>(null);

  // Form state
  const [formData, setFormData] = useState<AvailabilityFormData>({
    dayOfWeek: 1, // Monday
    startTime: '09:00',
    endTime: '17:00',
    isFullDay: false,
    isRecurring: true,
    specificDate: undefined
  });

  const iconColor = colorScheme === 'dark' ? '#F2EFEA' : '#4B5563';
  const primaryIconColor = colorScheme === 'dark' ? '#14110F' : '#FFFFFF';

  // Fetch unavailable blocks from PowerSync
  const { data: availabilityData } = useQuery(
    `SELECT * FROM availabilities WHERE technicianId = ? ORDER BY createdAt DESC`,
    [user?.id || '']
  );
  const availability = (availabilityData as Availability[]) || [];

  // Handle form changes
  const handleFieldChange = (field: keyof AvailabilityFormData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRecurringChange = (isRecurring: boolean) => {
    setFormData((prev) => ({
      ...prev,
      isRecurring,
      dayOfWeek: isRecurring ? (prev.dayOfWeek ?? 1) : undefined,
      specificDate: isRecurring ? undefined : prev.specificDate
    }));
  };

  // Validate and save unavailable block
  const handleSave = async () => {
    // Validation
    if (!formData.isFullDay && (!formData.startTime || !formData.endTime)) {
      showError('Please select start and end times');
      return;
    }

    if (!formData.isFullDay && !validateTimeRange(formData.startTime, formData.endTime)) {
      showError('Start time must be before end time');
      return;
    }

    if (formData.isRecurring && formData.dayOfWeek === undefined) {
      showError('Please select a day of week');
      return;
    }

    if (!formData.isRecurring && !formData.specificDate) {
      showError('Please select a specific date');
      return;
    }

    // Check for conflicts
    const conflictError = validateNoConflicts(availability, formData);
    if (conflictError) {
      showError(conflictError);
      return;
    }

    // Show confirmation with 12-hour format
    const startTime12 = `${formatTimeReadable(formData.startTime)}`;
    const endTime12 = `${formatTimeReadable(formData.endTime)}`;

    const blockLabel = formData.isRecurring
      ? getDayName(formData.dayOfWeek!)
      : formData.specificDate;
    const timeLabel = formData.isFullDay ? 'Full day' : `${startTime12} - ${endTime12}`;

    setConfirmationMessage(`Save unavailable block: ${blockLabel} ${timeLabel}?`);
    setConfirmationAction(() => submitAvailability);
    setShowConfirmation(true);
  };

  // Helper to format time to 12-hour format
  const formatTimeReadable = (time: string): string => {
    const [hour, minute] = time.split(':').map(Number);
    const isPM = hour >= 12;
    const hour12 = hour % 12 || 12;
    const period = isPM ? 'PM' : 'AM';
    return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  };

  // Submit to PowerSync only (no API call)
  const submitAvailability = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();

      if (formData.availabilityId) {
        await powerSync.execute(
          `UPDATE availabilities
              SET dayOfWeek = ?, startTime = ?, endTime = ?, isFullDay = ?, isRecurring = ?, specificDate = ?, updatedAt = ?
            WHERE id = ?`,
          [
            formData.isRecurring ? (formData.dayOfWeek ?? null) : null,
            formData.startTime,
            formData.endTime,
            formData.isFullDay ? 1 : 0,
            formData.isRecurring ? 1 : 0,
            formData.isRecurring ? null : (formData.specificDate ?? null),
            nowIso,
            formData.availabilityId
          ]
        );
      } else {
        await powerSync.execute(
          `INSERT INTO availabilities (id, technicianId, dayOfWeek, startTime, endTime, isFullDay, isRecurring, specificDate, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateObjectId(),
            user.id,
            formData.isRecurring ? (formData.dayOfWeek ?? null) : null,
            formData.startTime,
            formData.endTime,
            formData.isFullDay ? 1 : 0,
            formData.isRecurring ? 1 : 0,
            formData.isRecurring ? null : (formData.specificDate ?? null),
            nowIso,
            nowIso
          ]
        );
      }

      // Reset form
      setFormData({
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        isFullDay: false,
        isRecurring: true
      });
      setIsEditing(false);
      setShowConfirmation(false);

      Alert.alert('Success', 'Unavailable block saved successfully');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete unavailable block
  const handleDelete = (availabilityId: string) => {
    setConfirmationMessage('Delete this unavailable block?');
    setConfirmationAction(() => async () => {
      try {
        setIsSaving(true);
        await powerSync.execute(`DELETE FROM availabilities WHERE id = ?`, [availabilityId]);
        Alert.alert('Success', 'Unavailable block deleted successfully');
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to delete');
      } finally {
        setIsSaving(false);
        setShowConfirmation(false);
      }
    });
    setShowConfirmation(true);
  };

  // Edit unavailable block
  const _handleEdit = (av: Availability) => {
    setFormData({
      availabilityId: av.id,
      dayOfWeek: av.dayOfWeek ?? undefined,
      startTime: av.startTime || '09:00',
      endTime: av.endTime || '17:00',
      isFullDay: av.isFullDay === 1,
      isRecurring: av.isRecurring === 1,
      specificDate: av.specificDate || undefined
    });
    setIsEditing(true);
  };

  const showError = (message: string) => {
    Alert.alert('Error', message);
  };

  return (
    <View
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'
    >
      <ScrollView className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
        <View className='p-4'>
          {/* Header */}
          <View className='flex-row items-center justify-between mb-6'>
            <View>
              <Text className='text-2xl font-bold text-[#14110F] dark:text-white'>
                Unavailable Time
              </Text>
              <Text className='mt-1 max-w-xs text-gray-600 dark:text-gray-300'>
                Add times you cannot work. No block means you are available.
              </Text>
            </View>
            {onNavigateBack && (
              <TouchableOpacity onPress={onNavigateBack}>
                <Ionicons name='close' size={24} color={iconColor} />
              </TouchableOpacity>
            )}
          </View>

          {/* Form Section */}
          <View className='mb-6 rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#16140F]'>
            <Text className='mb-4 text-lg font-bold text-[#14110F] dark:text-white'>
              {isEditing ? 'Edit Unavailable Block' : 'Add Unavailable Block'}
            </Text>

            {/* Recurring toggle */}
            <View className='flex-row items-center justify-between mb-4'>
              <Text className='font-semibold text-gray-700 dark:text-gray-300'>
                Repeats weekly
              </Text>
              <Switch
                value={formData.isRecurring}
                onValueChange={handleRecurringChange}
                trackColor={{ false: '#76706A', true: '#FBBF24' }}
                thumbColor={formData.isRecurring ? '#F59E0B' : '#F2EFEA'}
              />
            </View>

            {/* Day of week selector (for recurring) */}
            {formData.isRecurring && (
              <View className='mb-4'>
                <Text className='mb-2 font-semibold text-gray-700 dark:text-gray-300'>
                  Day of Week
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className='mb-4'>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                    <TouchableOpacity
                      key={day}
                      onPress={() => handleFieldChange('dayOfWeek', index)}
                      className={`mr-2 rounded-xl px-4 py-3 ${
                        formData.dayOfWeek === index
                          ? 'bg-[#14110F] dark:bg-amber-400'
                          : 'bg-[#F0EDE6] dark:bg-[#1F1C16]'
                      }`}
                    >
                      <Text
                        className={
                          formData.dayOfWeek === index
                            ? 'font-semibold text-white dark:text-[#14110F]'
                            : 'text-gray-900 dark:text-white'
                        }
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {!formData.isRecurring && (
              <DatePickerInput
                label='Unavailable Date'
                value={formData.specificDate}
                onChange={(date) => handleFieldChange('specificDate', date)}
              />
            )}

            {/* Full day toggle */}
            <View className='flex-row items-center justify-between mb-4'>
              <Text className='font-semibold text-gray-700 dark:text-gray-300'>
                Unavailable All Day
              </Text>
              <Switch
                value={formData.isFullDay}
                onValueChange={(value) => handleFieldChange('isFullDay', value)}
                trackColor={{ false: '#76706A', true: '#FBBF24' }}
                thumbColor={formData.isFullDay ? '#F59E0B' : '#F2EFEA'}
              />
            </View>

            {/* Time pickers */}
            {!formData.isFullDay && (
              <>
                <TimePickerInput
                  label='Unavailable Start'
                  value={formData.startTime}
                  onChange={(time) => handleFieldChange('startTime', time)}
                />
                <TimePickerInput
                  label='Unavailable End'
                  value={formData.endTime}
                  onChange={(time) => handleFieldChange('endTime', time)}
                />
              </>
            )}

            {/* Action buttons */}
            <View className='flex-row gap-3 mt-6'>
              {isEditing && (
                <TouchableOpacity
                  onPress={() => {
                    setIsEditing(false);
                    setFormData({
                      dayOfWeek: 1,
                      startTime: '09:00',
                      endTime: '17:00',
                      isFullDay: false,
                      isRecurring: true
                    });
                  }}
                  className='flex-1 rounded-xl bg-[#F0EDE6] p-4 dark:bg-[#2A261D]'
                  disabled={isSaving}
                >
                  <Text className='text-center font-semibold text-[#14110F] dark:text-white'>
                    Cancel
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleSave}
                className='flex-1 flex-row items-center justify-center rounded-xl bg-[#14110F] p-4 dark:bg-amber-400'
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={primaryIconColor} size='small' />
                ) : (
                  <>
                    <Ionicons name='checkmark' size={20} color={primaryIconColor} />
                    <Text className='ml-2 font-semibold text-white dark:text-[#14110F]'>
                      {isEditing ? 'Update' : 'Add'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Calendar View */}
          <View className='mb-6'>
            <Text className='mb-4 text-lg font-bold text-[#14110F] dark:text-white'>
              Blocked Time
            </Text>
            <AvailabilityCalendar availability={availability} />
          </View>

          {/* Unavailable block list */}
          {availability.length > 0 && (
            <View className='mb-6'>
              <Text className='mb-4 text-lg font-bold text-[#14110F] dark:text-white'>
                Unavailability Blocks
              </Text>
              {availability.map((av) => (
                <View
                  key={av.id}
                  className='mb-3 flex-row items-center justify-between rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'
                >
                  <View className='flex-1'>
                    <Text className='font-semibold text-[#14110F] dark:text-white'>
                      {formatAvailabilityDisplay(av)}
                    </Text>
                  </View>
                  <View className='flex-row gap-2'>
                    <TouchableOpacity
                      onPress={() => handleDelete(av.id!)}
                      className='rounded-xl bg-red-100 p-2 dark:bg-red-950/70'
                      disabled={isSaving}
                    >
                      <Ionicons name='trash' size={16} color='#ef4444' />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Confirmation Modal */}
        <ConfirmationModal
          visible={showConfirmation}
          title='Confirmation'
          message={confirmationMessage}
          onConfirm={() => confirmationAction?.()}
          onClose={() => setShowConfirmation(false)}
        />
      </ScrollView>
    </View>
  );
};
