import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { toLocalTime } from '../utils/date';

interface InvoiceModalProps {
  visible: boolean;
  onClose: () => void;
  invoice: any;
  canManage: boolean;
}

export function InvoiceModal({
  visible,
  onClose,
  invoice,
  canManage,
}: InvoiceModalProps) {
  if (!invoice) return null;

  const formatDate = (date: string) => {
    const localDate = toLocalTime(new Date(date));
    return localDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  return (
    <Modal
      animationType='slide'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className='flex-1 justify-end'>
        <View className='bg-white dark:bg-gray-800 rounded-t-3xl h-3/4 p-6'>
          <View className='flex-row justify-between items-center mb-6'>
            <Text className='text-2xl font-bold text-gray-900 dark:text-white'>
              Invoice Details
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className='p-2 bg-gray-100 dark:bg-gray-700 rounded-full'
            >
              <Text className='text-gray-600 dark:text-gray-300'>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView className='flex-1'>
            <View className='space-y-4'>
              <View>
                <Text className='text-sm text-gray-500 dark:text-gray-400'>
                  Date Issued
                </Text>
                <Text className='text-gray-900 dark:text-white'>
                  {formatDate(invoice.dateIssued)}
                </Text>
              </View>

              <View>
                <Text className='text-sm text-gray-500 dark:text-gray-400'>
                  Due Date
                </Text>
                <Text className='text-gray-900 dark:text-white'>
                  {formatDate(invoice.dateDue)}
                </Text>
              </View>

              <View>
                <Text className='text-sm text-gray-500 dark:text-gray-400 mb-2'>
                  Items
                </Text>
                {invoice.items.map((item: any, index: number) => (
                  <View
                    key={index}
                    className='flex-row justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700'
                  >
                    <Text className='text-gray-900 dark:text-white flex-1'>
                      {item.description}
                    </Text>
                    {canManage && item.price && (
                      <Text className='text-gray-900 dark:text-white ml-4'>
                        ${item.price.toFixed(2)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>

              {canManage && invoice.total && (
                <View className='mt-4 pt-4 border-t border-gray-200 dark:border-gray-700'>
                  <View className='flex-row justify-between'>
                    <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
                      Total
                    </Text>
                    <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
                      ${invoice.total.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}

              {invoice.notes && (
                <View className='mt-4'>
                  <Text className='text-sm text-gray-500 dark:text-gray-400'>
                    Notes
                  </Text>
                  <Text className='text-gray-900 dark:text-white'>
                    {invoice.notes}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
