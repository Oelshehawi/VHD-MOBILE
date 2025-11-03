import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, usePowerSync } from '@powersync/react-native';
import { useUser } from '@clerk/clerk-expo';
import { TimePickerInput } from './TimePickerInput';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { ConfirmationModal } from '../common/ConfirmationModal';
import {
  validateTimeRange,
  validateNoConflicts,
  formatAvailabilityDisplay,
  getDayName,
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
 * Main screen for managing technician availability
 */
export const AvailabilityManager: React.FC<{ onNavigateBack?: () => void }> = ({
  onNavigateBack,
}) => {
  const { user } = useUser();
  const powerSync = usePowerSync();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [confirmationAction, setConfirmationAction] = useState<
    (() => void) | null
  >(null);

  // Form state
  const [formData, setFormData] = useState<AvailabilityFormData>({
    dayOfWeek: 1, // Monday
    startTime: '09:00',
    endTime: '17:00',
    isFullDay: false,
    isRecurring: true,
    specificDate: undefined,
  });

  // Fetch availability from PowerSync
  const { data: availabilityData } = useQuery(
    `SELECT * FROM availability WHERE technicianId = ? ORDER BY createdAt DESC`,
    [user?.id || '']
  );
  const availability = (availabilityData as Availability[]) || [];

  // Handle form changes
  const handleFieldChange = (field: keyof AvailabilityFormData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Validate and save availability
  const handleSave = async () => {
    // Validation
    if (!formData.startTime || !formData.endTime) {
      showError('Please select start and end times');
      return;
    }

    if (!validateTimeRange(formData.startTime, formData.endTime)) {
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

    setConfirmationMessage(
      `Save availability: ${
        formData.isRecurring
          ? getDayName(formData.dayOfWeek!)
          : formData.specificDate
      } ${startTime12} - ${endTime12}?`
    );
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
      const availabilityId = formData.availabilityId || Math.random().toString();

      // Insert or update in PowerSync
      await powerSync.execute(
        `INSERT INTO availability (id, technicianId, dayOfWeek, startTime, endTime, isFullDay, isRecurring, specificDate, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          availabilityId,
          user.id,
          formData.dayOfWeek || null,
          formData.startTime,
          formData.endTime,
          formData.isFullDay ? 1 : 0,
          formData.isRecurring ? 1 : 0,
          formData.specificDate || null,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );

      // Reset form
      setFormData({
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        isFullDay: false,
        isRecurring: true,
      });
      setIsEditing(false);
      setShowConfirmation(false);

      Alert.alert('Success', 'Availability saved successfully');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete availability
  const handleDelete = (availabilityId: string) => {
    setConfirmationMessage('Delete this availability block?');
    setConfirmationAction(() => async () => {
      try {
        setIsSaving(true);
        await powerSync.execute(`DELETE FROM availability WHERE id = ?`, [
          availabilityId,
        ]);
        Alert.alert('Success', 'Availability deleted successfully');
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to delete');
      } finally {
        setIsSaving(false);
        setShowConfirmation(false);
      }
    });
    setShowConfirmation(true);
  };

  // Edit availability
  const handleEdit = (av: Availability) => {
    setFormData({
      availabilityId: av.id,
      dayOfWeek: av.dayOfWeek || undefined,
      startTime: av.startTime || 'null',
      endTime: av.endTime || 'null',
      isFullDay: av.isFullDay === 1,
      isRecurring: av.isRecurring === 1,
      specificDate: av.specificDate || undefined,
    });
    setIsEditing(true);
  };

  const showError = (message: string) => {
    Alert.alert('Error', message);
  };

  return (
    <SafeAreaView className='flex-1 bg-gray-50 dark:bg-gray-900'>
      <ScrollView className='flex-1 bg-gray-50 dark:bg-gray-900'>
      <View className='p-4'>
        {/* Header */}
        <View className='flex-row items-center justify-between mb-6'>
          <View>
            <Text className='text-2xl font-bold text-gray-900 dark:text-white'>
              Manage Availability
            </Text>
            <Text className='text-gray-600 dark:text-gray-400 mt-1'>
              Set your work availability
            </Text>
          </View>
          {onNavigateBack && (
            <TouchableOpacity onPress={onNavigateBack}>
              <Ionicons name='close' size={24} color='#666' />
            </TouchableOpacity>
          )}
        </View>

        {/* Form Section */}
        <View className='bg-white dark:bg-gray-800 p-4 rounded-lg mb-6'>
          <Text className='text-lg font-bold text-gray-900 dark:text-white mb-4'>
            {isEditing ? 'Edit Availability' : 'Add Availability Block'}
          </Text>

          {/* Recurring toggle */}
          <View className='flex-row items-center justify-between mb-4'>
            <Text className='text-gray-700 dark:text-gray-300 font-semibold'>
              Recurring Pattern
            </Text>
            <Switch
              value={formData.isRecurring}
              onValueChange={(value) => handleFieldChange('isRecurring', value)}
              trackColor={{ false: '#767577', true: '#81c784' }}
            />
          </View>

          {/* Day of week selector (for recurring) */}
          {formData.isRecurring && (
            <View className='mb-4'>
              <Text className='text-gray-700 dark:text-gray-300 font-semibold mb-2'>
                Day of Week
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className='mb-4'
              >
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                  (day, index) => (
                    <TouchableOpacity
                      key={day}
                      onPress={() => handleFieldChange('dayOfWeek', index)}
                      className={`mr-2 p-3 rounded-lg ${
                        formData.dayOfWeek === index
                          ? 'bg-blue-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <Text
                        className={
                          formData.dayOfWeek === index
                            ? 'text-white font-semibold'
                            : 'text-gray-900 dark:text-white'
                        }
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </ScrollView>
            </View>
          )}

          {/* Full day toggle */}
          <View className='flex-row items-center justify-between mb-4'>
            <Text className='text-gray-700 dark:text-gray-300 font-semibold'>
              Full Day
            </Text>
            <Switch
              value={formData.isFullDay}
              onValueChange={(value) => handleFieldChange('isFullDay', value)}
              trackColor={{ false: '#767577', true: '#81c784' }}
            />
          </View>

          {/* Time pickers */}
          {!formData.isFullDay && (
            <>
              <TimePickerInput
                label='Start Time'
                value={formData.startTime}
                onChange={(time) => handleFieldChange('startTime', time)}
              />
              <TimePickerInput
                label='End Time'
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
                    isRecurring: true,
                  });
                }}
                className='flex-1 bg-gray-300 dark:bg-gray-600 p-4 rounded-lg'
                disabled={isSaving}
              >
                <Text className='text-center font-semibold text-gray-900 dark:text-white'>
                  Cancel
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleSave}
              className='flex-1 bg-blue-500 p-4 rounded-lg flex-row items-center justify-center'
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color='white' size='small' />
              ) : (
                <>
                  <Ionicons name='checkmark' size={20} color='white' />
                  <Text className='text-white font-semibold ml-2'>
                    {isEditing ? 'Update' : 'Add'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Calendar View */}
        <View className='mb-6'>
          <Text className='text-lg font-bold text-gray-900 dark:text-white mb-4'>
            Your Availability
          </Text>
          <AvailabilityCalendar availability={availability} />
        </View>

        {/* Availability List */}
        {availability.length > 0 && (
          <View className='mb-6'>
            <Text className='text-lg font-bold text-gray-900 dark:text-white mb-4'>
              Manage Blocks
            </Text>
            {availability.map((av) => (
              <View
                key={av.id}
                className='bg-white dark:bg-gray-800 p-4 rounded-lg mb-3 flex-row items-center justify-between'
              >
                <View className='flex-1'>
                  <Text className='text-gray-900 dark:text-white font-semibold'>
                    {formatAvailabilityDisplay(av)}
                  </Text>
                </View>
                <View className='flex-row gap-2'>
                  <TouchableOpacity
                    onPress={() => handleEdit(av)}
                    className='p-2 bg-blue-100 dark:bg-blue-900 rounded-lg'
                    disabled={isSaving}
                  >
                    <Ionicons name='pencil' size={16} color='#3b82f6' />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(av.id!)}
                    className='p-2 bg-red-100 dark:bg-red-900 rounded-lg'
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
    </SafeAreaView>
  );
};
