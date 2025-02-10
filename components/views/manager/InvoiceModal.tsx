import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { InvoiceType } from '@/types';
import { formatDateReadable } from '@/utils/date';
import { PhotoCapture } from '../../schedule/PhotoCapture';
import { SignatureCapture } from '../../schedule/SignatureCapture';
import { useQuery } from '@powersync/react-native';

interface InvoiceModalProps {
  visible: boolean;
  onClose: () => void;
  invoice: InvoiceType | null;
  technicianId: string;
}

interface InvoiceItem {
  description: string;
  price: number;
}

export function ManagerInvoiceModal({
  visible,
  onClose,
  invoice: initialInvoice,
  technicianId,
}: InvoiceModalProps) {
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // Use PowerSync query directly
  const { data: invoiceData = [] } = useQuery<InvoiceType>(
    initialInvoice?.id
      ? `SELECT * FROM invoices WHERE id = ?`
      : `SELECT * FROM invoices WHERE 0`,
    [initialInvoice?.id || '']
  );

  const invoice = invoiceData[0] || null;

  if (!visible || !invoice) return null;

  // Parse photos, signature, and items from JSON strings
  const photos = (() => {
    try {
      const parsedPhotos = invoice.photos
        ? JSON.parse(invoice.photos)
        : { before: [], after: [] };

      return {
        before: Array.isArray(parsedPhotos.before)
          ? parsedPhotos.before.map((photo: any) => ({
              ...photo,
              id: photo._id || photo.id,
              _id: photo._id || photo.id,
              type: 'before' as const,
              status: photo.status || 'uploaded',
            }))
          : [],
        after: Array.isArray(parsedPhotos.after)
          ? parsedPhotos.after.map((photo: any) => ({
              ...photo,
              id: photo._id || photo.id,
              _id: photo._id || photo.id,
              type: 'after' as const,
              status: photo.status || 'uploaded',
            }))
          : [],
      };
    } catch (error) {
      console.error('Error parsing photos:', error, invoice.photos);
      return { before: [], after: [] };
    }
  })();

  const signature = invoice.signature
    ? JSON.parse(invoice.signature)
    : undefined;
  const items: InvoiceItem[] = invoice.items ? JSON.parse(invoice.items) : [];

  const subtotal = items.reduce((sum, item) => sum + (item.price || 0), 0);
  const gst = subtotal * 0.05;
  const total = subtotal + gst;

  const renderWorkCompletionSection = () => {
    const hasBeforePhotos = photos.before?.length > 0;
    const hasAfterPhotos = photos.after?.length > 0;
    const hasSignature = signature;

    return (
      <View className='flex flex-col gap-6 border-t border-gray-200 dark:border-gray-700 pt-6 mt-6'>
        <Text className='text-xl font-bold text-gray-900 dark:text-white'>
          Work Documentation
        </Text>

        {/* Before Photos */}
        <View className='flex flex-col gap-4'>
          <PhotoCapture
            type='before'
            photos={photos.before}
            technicianId={technicianId}
            jobTitle={invoice.jobTitle}
            invoiceId={invoice.id}
          />
        </View>

        {/* After Photos */}
        <View className='flex flex-col gap-4'>
          <PhotoCapture
            type='after'
            photos={photos.after}
            technicianId={technicianId}
            jobTitle={invoice.jobTitle}
            invoiceId={invoice.id}
          />
        </View>

        {/* Signature */}
        <View className='flex flex-col gap-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
            Customer Signature {hasSignature && '✓'}
          </Text>
          {!hasSignature ? (
            <View className='flex flex-col gap-4'>
              <TouchableOpacity
                onPress={() => setShowSignatureModal(true)}
                className='p-4 rounded-lg flex-row justify-center items-center bg-darkGreen'
              >
                <Text className='text-white font-medium text-lg'>
                  ✍️ Tap to Sign
                </Text>
              </TouchableOpacity>
              <SignatureCapture
                onSignatureCapture={() => {
                  setShowSignatureModal(false);
                }}
                technicianId={technicianId}
                invoice={invoice}
                visible={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
              />
            </View>
          ) : (
            <View className='bg-green-50 dark:bg-green-900/20 p-4 rounded-lg'>
              <Text className='text-green-200 dark:text-green-200 text-center font-medium'>
                ✓ Signature Captured
              </Text>
            </View>
          )}
        </View>

        {/* Work Complete Status */}
        {hasBeforePhotos && hasAfterPhotos && hasSignature && (
          <View className='bg-green-50 dark:bg-green-900/20 p-4 rounded-lg'>
            <Text className='text-green-800 dark:text-green-200 text-center font-medium'>
              ✓ Work Documentation Complete
            </Text>
          </View>
        )}
      </View>
    );
  };

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
          <View className='flex flex-col gap-1 px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
            <View className='flex-row justify-between items-center'>
              <View className='flex flex-col gap-1'>
                <Text className='text-2xl font-bold text-gray-900 dark:text-white'>
                  {invoice.jobTitle}
                </Text>
                <Text className='text-sm text-gray-500 dark:text-gray-400'>
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
            <View className='flex flex-col gap-6 pb-6'>
              {/* Dates Section */}
              <View className='flex-row justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg'>
                <View className='flex flex-col gap-1'>
                  <Text className='text-sm text-gray-500 dark:text-gray-400'>
                    Date Issued
                  </Text>
                  <Text className='text-base font-medium text-gray-900 dark:text-white'>
                    {formatDateReadable(invoice.dateIssued)}
                  </Text>
                </View>
                <View className='flex flex-col gap-1'>
                  <Text className='text-sm text-gray-500 dark:text-gray-400'>
                    Due Date
                  </Text>
                  <Text className='text-base font-medium text-gray-900 dark:text-white'>
                    {formatDateReadable(invoice.dateDue)}
                  </Text>
                </View>
              </View>

              {/* Location */}
              <View className='flex flex-col gap-1'>
                <Text className='text-sm text-gray-500 dark:text-gray-400'>
                  Location
                </Text>
                <Text className='text-base text-gray-900 dark:text-white font-medium'>
                  {invoice.location}
                </Text>
              </View>

              {/* Items Section */}
              <View className='flex flex-col gap-4'>
                <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
                  Services
                </Text>
                <View className='flex flex-col gap-3'>
                  {items.map((item, index) => (
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

                {/* Total Section */}
                <View className='bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg'>
                  <View className='flex flex-col gap-2'>
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
                      <Text className='text-xl font-bold text-gray-900 dark:text-white'>
                        ${total.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Notes */}
              {invoice.notes && (
                <View className='flex flex-col gap-2'>
                  <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
                    Notes
                  </Text>
                  <Text className='text-gray-700 dark:text-gray-300'>
                    {invoice.notes}
                  </Text>
                </View>
              )}

              {/* Work Completion Section */}
              {renderWorkCompletionSection()}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
