import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDateRange, parseISODateToLocalDate } from '../../utils/availabilityValidation';
import { format } from 'date-fns';
import type { TimeOffRequest } from '../../services/database/schema';

interface TimeOffRequestItemProps {
  request: TimeOffRequest;
  onEdit?: (request: TimeOffRequest) => void;
  onCancel?: (requestId: string) => void;
}

/**
 * TimeOffRequestItem Component
 * Displays a single time-off request with status and action buttons
 */
export const TimeOffRequestItem: React.FC<TimeOffRequestItemProps> = ({
  request,
  onEdit,
  onCancel
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-50 dark:bg-green-950/40';
      case 'rejected':
        return 'bg-red-50 dark:bg-red-950/40';
      case 'pending':
      default:
        return 'bg-amber-50 dark:bg-[#1F1C16]';
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-green-800 dark:text-green-100';
      case 'rejected':
        return 'text-red-800 dark:text-red-100';
      case 'pending':
      default:
        return 'text-yellow-800 dark:text-yellow-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return 'checkmark-circle';
      case 'rejected':
        return 'close-circle';
      case 'pending':
      default:
        return 'time';
    }
  };

  const isPending = request.status === 'pending';
  const dateRange = formatDateRange(request.startDate || '', request.endDate || '');

  return (
    <View
      className={`${getStatusColor(
        request.status || ''
      )} mb-3 rounded-2xl border border-black/10 p-4 dark:border-white/10`}
    >
      {/* Header with status */}
      <View className='flex-row items-center justify-between mb-3'>
        <View className='flex-row items-center flex-1'>
          <Ionicons
            name={getStatusIcon(request.status || '') as any}
            size={20}
            color={
              request.status === 'approved'
                ? '#16a34a'
                : request.status === 'rejected'
                  ? '#dc2626'
                  : '#ca8a04'
            }
          />
          <Text
            className={`ml-2 font-semibold capitalize ${getStatusTextColor(request.status || '')}`}
          >
            {request.status}
          </Text>
        </View>
      </View>

      {/* Date range */}
      <View className='flex-row items-center mb-2'>
        <Ionicons name='calendar-outline' size={16} color='#76706A' />
        <Text className='ml-2 text-gray-800 dark:text-gray-200 font-semibold'>{dateRange}</Text>
      </View>

      {/* Reason */}
      <View className='mb-3'>
        <Text className='text-gray-600 dark:text-gray-400 text-sm mb-1'>Reason:</Text>
        <Text className='text-gray-800 dark:text-gray-100'>{request.reason}</Text>
      </View>

      {/* Request date */}
      <Text className='text-xs text-gray-600 dark:text-gray-400 mb-3'>
        Requested on{' '}
        {request.requestedAt
          ? format(parseISODateToLocalDate(request.requestedAt), 'MMM d, yyyy')
          : 'Unknown'}
      </Text>

      {/* Admin notes if available */}
      {request.notes && (
        <View className='bg-white/50 dark:bg-black/20 p-2 rounded mb-3'>
          <Text className='text-xs text-gray-600 dark:text-gray-400 mb-1'>Admin Notes:</Text>
          <Text className='text-gray-800 dark:text-gray-200 text-sm'>{request.notes}</Text>
        </View>
      )}

      {/* Action buttons for pending requests */}
      {isPending && (onEdit || onCancel) && (
        <View className='flex-row gap-2'>
          {/* {onEdit && (
            <TouchableOpacity
              onPress={() => onEdit(request)}
              className="flex-1 bg-blue-500 p-3 rounded flex-row items-center justify-center"
            >
              <Ionicons name="pencil" size={16} color="white" />
              <Text className="text-white font-semibold ml-2">Edit</Text>
            </TouchableOpacity>
          )} */}
          {onCancel && (
            <TouchableOpacity
              onPress={() => onCancel(request.id!)}
              className='flex-1 flex-row items-center justify-center rounded-xl bg-red-600 p-3'
            >
              <Ionicons name='trash' size={16} color='white' />
              <Text className='text-white font-semibold ml-2'>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};
