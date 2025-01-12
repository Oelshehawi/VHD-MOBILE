import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { InvoiceType } from '../../types';
import { formatDateReadable } from '../../utils/date';

interface InvoiceModalProps {
  visible: boolean;
  onClose: () => void;
  invoice: InvoiceType | null;
}

export function InvoiceModal({ visible, onClose, invoice }: InvoiceModalProps) {
  if (!invoice) return null;

  const subtotal = invoice.items.reduce(
    (sum, item) => sum + (item.price || 0),
    0
  );
  const gst = subtotal * 0.05; // 5% GST
  const total = subtotal + gst;

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <View className='mb-4'>
      <Text className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
        {label}
      </Text>
      <Text className='text-base text-gray-900 dark:text-white font-medium'>
        {value}
      </Text>
    </View>
  );

  return (
    <Modal
      animationType='slide'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className='flex-1 justify-end bg-black/50'>
        <View className='bg-white dark:bg-gray-800 rounded-t-3xl min-h-[75%] max-h-[90%]'>
          {/* Header */}
          <View className='px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
            <View className='flex-row justify-between items-center'>
              <View>
                <Text className='text-2xl font-bold text-gray-900 dark:text-white'>
                  {invoice.jobTitle}
                </Text>
                <Text className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                  Invoice #{invoice.invoiceId}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                className='p-2 bg-gray-100 dark:bg-gray-700 rounded-full'
              >
                <Text className='text-gray-600 dark:text-gray-300 text-lg'>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView className='flex-1 px-6 py-4'>
            <View className='space-y-6'>
              {/* Dates Section */}
              <View className='flex-row justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg'>
                <View>
                  <Text className='text-sm text-gray-500 dark:text-gray-400'>
                    Date Issued
                  </Text>
                  <Text className='text-base font-medium text-gray-900 dark:text-white'>
                    {formatDateReadable(invoice.dateIssued)}
                  </Text>
                </View>
                <View>
                  <Text className='text-sm text-gray-500 dark:text-gray-400'>
                    Due Date
                  </Text>
                  <Text className='text-base font-medium text-gray-900 dark:text-white'>
                    {formatDateReadable(invoice.dateDue)}
                  </Text>
                </View>
              </View>

              {/* Location */}
              <InfoRow label='Location' value={invoice.location} />

              {/* Items Section */}
              <View>
                <Text className='text-lg font-semibold text-gray-900 dark:text-white mb-3'>
                  Services
                </Text>
                <View className='space-y-3'>
                  {invoice.items.map((item, index) => (
                    <View
                      key={index}
                      className='flex-row justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700'
                    >
                      <Text className='text-gray-900 dark:text-white flex-1 text-base'>
                        {item.description}
                      </Text>
                      <Text className='text-gray-900 dark:text-white ml-4 font-medium'>
                        ${item.price.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Total Section */}
              <View className='bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg mt-4'>
                <View className='space-y-2'>
                  <View className='flex-row justify-between items-center'>
                    <Text className='text-gray-600 dark:text-gray-400'>
                      Subtotal
                    </Text>
                    <Text className='text-gray-900 dark:text-white'>
                      ${subtotal.toFixed(2)}
                    </Text>
                  </View>
                  <View className='flex-row justify-between items-center'>
                    <Text className='text-gray-600 dark:text-gray-400'>
                      GST (5%)
                    </Text>
                    <Text className='text-gray-900 dark:text-white'>
                      ${gst.toFixed(2)}
                    </Text>
                  </View>
                  <View className='flex-row justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600'>
                    <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
                      Total
                    </Text>
                    <Text className='text-xl font-bold text-darkGreen'>
                      ${total.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Notes */}
              {invoice.notes && (
                <View className='mt-6'>
                  <Text className='text-lg font-semibold text-gray-900 dark:text-white mb-2'>
                    Notes
                  </Text>
                  <Text className='text-gray-700 dark:text-gray-300'>
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
