import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  useColorScheme
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, usePowerSync } from '@powersync/react-native';
import { useUser } from '@clerk/clerk-expo';
import { DateRangeSelector } from './DateRangeSelector';
import { TimeOffRequestItem } from './TimeOffRequestItem';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { validateTimeOffDateRange, formatDateRange } from '../../utils/availabilityValidation';
import { generateObjectId } from '@/utils/objectId';
import type { TimeOffRequest } from '../../services/database/schema';

interface TimeOffFormData {
  startDate: string | null;
  endDate: string | null;
  reason: string;
}

/**
 * TimeOffManager Component
 * Main screen for managing time-off requests
 */
export const TimeOffManager: React.FC<{ onNavigateBack?: () => void }> = ({ onNavigateBack }) => {
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const powerSync = usePowerSync();
  const colorScheme = useColorScheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [confirmationAction, setConfirmationAction] = useState<(() => void) | null>(null);

  // Form state
  const [formData, setFormData] = useState<TimeOffFormData>({
    startDate: null,
    endDate: null,
    reason: ''
  });

  // Fetch time-off requests from PowerSync
  const { data: requestsData } = useQuery(
    `SELECT * FROM timeoffrequests WHERE technicianId = ? ORDER BY startDate DESC`,
    [user?.id || '']
  );
  const requests = (requestsData as TimeOffRequest[]) || [];
  const iconColor = colorScheme === 'dark' ? '#F2EFEA' : '#4B5563';
  const primaryIconColor = colorScheme === 'dark' ? '#14110F' : '#FFFFFF';

  // Handle form changes
  const handleDateRangeChange = (startDate: string, endDate: string) => {
    setFormData((prev) => ({
      ...prev,
      startDate,
      endDate
    }));
  };

  const handleReasonChange = (text: string) => {
    setFormData((prev) => ({
      ...prev,
      reason: text
    }));
  };

  // Validate and submit time-off request
  const handleSubmit = async () => {
    // Validation
    if (!formData.startDate || !formData.endDate) {
      showError('Please select start and end dates');
      return;
    }

    if (!formData.reason.trim()) {
      showError('Please provide a reason for time off');
      return;
    }

    const dateError = validateTimeOffDateRange(formData.startDate, formData.endDate);
    if (dateError) {
      showError(dateError);
      return;
    }

    // Show confirmation
    setConfirmationMessage(
      `${isEditing ? 'Update' : 'Submit'} time-off request for ${formatDateRange(
        formData.startDate,
        formData.endDate
      )}?`
    );
    setConfirmationAction(() => submitRequest);
    setShowConfirmation(true);
  };

  // Submit to PowerSync only (BackendConnector handles API sync)
  const submitRequest = async () => {
    if (!user?.id || !formData.startDate || !formData.endDate) return;

    setIsSaving(true);
    try {
      if (editingRequestId) {
        await powerSync.execute(
          `UPDATE timeoffrequests
              SET startDate = ?, endDate = ?, reason = ?
            WHERE id = ?`,
          [formData.startDate, formData.endDate, formData.reason, editingRequestId]
        );
      } else {
        await powerSync.execute(
          `INSERT INTO timeoffrequests (id, technicianId, startDate, endDate, reason, status, requestedAt, reviewedAt, reviewedBy, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateObjectId(),
            user.id,
            formData.startDate,
            formData.endDate,
            formData.reason,
            'pending',
            new Date().toISOString(),
            null,
            null,
            null
          ]
        );
      }

      // Reset form
      setFormData({
        startDate: null,
        endDate: null,
        reason: ''
      });
      setIsEditing(false);
      setEditingRequestId(null);
      setShowConfirmation(false);

      Alert.alert(
        'Success',
        isEditing ? 'Request updated successfully' : 'Request submitted successfully'
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel/delete request
  const handleCancel = (requestId: string) => {
    setConfirmationMessage('Cancel this time-off request?');
    setConfirmationAction(() => async () => {
      try {
        setIsSaving(true);
        await powerSync.execute(`DELETE FROM timeoffrequests WHERE id = ?`, [requestId]);
        Alert.alert('Success', 'Request cancelled');
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to cancel request');
      } finally {
        setIsSaving(false);
        setShowConfirmation(false);
      }
    });
    setShowConfirmation(true);
  };

  // Edit request
  const handleEdit = (request: TimeOffRequest) => {
    setFormData({
      startDate: request.startDate || null,
      endDate: request.endDate || null,
      reason: request.reason || ''
    });
    setIsEditing(true);
    setEditingRequestId(request.id || null);
  };

  const showError = (message: string) => {
    Alert.alert('Error', message);
  };

  // Group requests by status
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const approvedRequests = requests.filter((r) => r.status === 'approved');
  const rejectedRequests = requests.filter((r) => r.status === 'rejected');

  return (
    <View
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'
    >
      <ScrollView className='flex-1'>
        <View className='p-4'>
          {/* Header */}
          <View className='flex-row items-center justify-between mb-6'>
            <View>
              <Text className='text-2xl font-bold text-[#14110F] dark:text-white'>
                Time Off Requests
              </Text>
              <Text className='mt-1 text-gray-600 dark:text-gray-300'>
                Manage your time-off requests
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
              {isEditing ? 'Edit Request' : 'Submit New Request'}
            </Text>

            <DateRangeSelector
              startDate={formData.startDate}
              endDate={formData.endDate}
              onDateRangeChange={handleDateRangeChange}
              label='Select Dates (14+ days advance)'
            />

            {/* Reason */}
            <View className='mb-4'>
              <Text className='mb-2 font-semibold text-gray-700 dark:text-gray-300'>
                Reason for Time Off
              </Text>
              <TextInput
                className='rounded-xl border border-black/10 bg-[#F0EDE6] p-4 text-gray-900 dark:border-white/10 dark:bg-[#1F1C16] dark:text-white'
                placeholder='e.g., Vacation, Medical, Personal'
                placeholderTextColor={colorScheme === 'dark' ? '#9CA3AF' : '#76706A'}
                value={formData.reason}
                onChangeText={handleReasonChange}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Action buttons */}
            <View className='flex-row gap-3'>
              {isEditing && (
                <TouchableOpacity
                  onPress={() => {
                    setIsEditing(false);
                    setEditingRequestId(null);
                    setFormData({
                      startDate: null,
                      endDate: null,
                      reason: ''
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
                onPress={handleSubmit}
                className='flex-1 flex-row items-center justify-center rounded-xl bg-[#14110F] p-4 dark:bg-amber-400'
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={primaryIconColor} size='small' />
                ) : (
                  <>
                    <Ionicons name='send' size={20} color={primaryIconColor} />
                    <Text className='ml-2 font-semibold text-white dark:text-[#14110F]'>
                      {isEditing ? 'Update' : 'Submit'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Requests List - Grouped by Status */}

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <View className='mb-6'>
              <Text className='text-lg font-bold text-gray-900 dark:text-white mb-4'>
                Pending Requests ({pendingRequests.length})
              </Text>
              {pendingRequests.map((request) => (
                <TimeOffRequestItem
                  key={request.id}
                  request={request}
                  onEdit={handleEdit}
                  onCancel={handleCancel}
                />
              ))}
            </View>
          )}

          {/* Approved Requests */}
          {approvedRequests.length > 0 && (
            <View className='mb-6'>
              <Text className='text-lg font-bold text-gray-900 dark:text-white mb-4'>
                Approved Requests ({approvedRequests.length})
              </Text>
              {approvedRequests.map((request) => (
                <TimeOffRequestItem key={request.id} request={request} />
              ))}
            </View>
          )}

          {/* Rejected Requests */}
          {rejectedRequests.length > 0 && (
            <View className='mb-6'>
              <Text className='text-lg font-bold text-gray-900 dark:text-white mb-4'>
                Rejected Requests ({rejectedRequests.length})
              </Text>
              {rejectedRequests.map((request) => (
                <TimeOffRequestItem key={request.id} request={request} />
              ))}
            </View>
          )}

          {/* Empty state */}
          {requests.length === 0 && (
            <View className='items-center rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-[#16140F]'>
              <Ionicons name='calendar-outline' size={48} color='#999' />
              <Text className='mt-4 text-center text-gray-600 dark:text-gray-300'>
                No time-off requests yet. Submit your first request above.
              </Text>
            </View>
          )}
          {/* Confirmation Modal */}
          <ConfirmationModal
            visible={showConfirmation}
            title='Confirmation'
            message={confirmationMessage}
            onConfirm={() => confirmationAction?.()}
            onClose={() => setShowConfirmation(false)}
          />
        </View>
      </ScrollView>
    </View>
  );
};
