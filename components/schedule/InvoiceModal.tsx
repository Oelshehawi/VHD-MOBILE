import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { InvoiceType } from '@/types';
import { formatDateReadable } from '@/utils/date';
import { SignatureCapture } from './SignatureCapture';
import { useQuery } from '@powersync/react-native';
import { Ionicons } from '@expo/vector-icons';
import { openMaps } from '@/utils/dashboard';
import { TechnicianNotes } from './TechnicianNotes';
import { ApiClient } from '@/services/ApiClient';
import { ConfirmationModal } from '../common/ConfirmationModal';

interface InvoiceModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  technicianId: string;
  isManager: boolean;
}

interface InvoiceItem {
  description: string;
  price: number;
}

export function InvoiceModal({
  visible,
  onClose,
  scheduleId,
  technicianId,
  isManager,
}: InvoiceModalProps) {
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // Send invoice state management
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [sendInvoiceError, setSendInvoiceError] = useState<string | null>(null);
  const [invoiceSent, setInvoiceSent] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);

  // First fetch the schedule using the scheduleId
  const { data: scheduleData = [] } = useQuery<any>(
    scheduleId
      ? `SELECT * FROM schedules WHERE id = ?`
      : `SELECT * FROM schedules WHERE 0`,
    [scheduleId || '']
  );

  const schedule = scheduleData[0] || null;
  const invoiceRef = schedule?.invoiceRef;

  // Then fetch the invoice using the invoiceRef from the schedule
  const { data: invoiceData = [] } = useQuery<InvoiceType>(
    invoiceRef
      ? `SELECT * FROM invoices WHERE id = ?`
      : `SELECT * FROM invoices WHERE 0`,
    [invoiceRef || '']
  );

  const invoice = invoiceData[0] || null;

  if (!visible || !invoice) return null;

  // Parse photos and signature from schedule JSON strings
  const photos = (() => {
    try {
      if (!schedule?.photos) {
        return { before: [], after: [] };
      }

      const parsedPhotos =
        typeof schedule.photos === 'string'
          ? JSON.parse(schedule.photos)
          : schedule.photos;

      // We're using the new schema - an array with photo objects that have a type property
      const photoArray = Array.isArray(parsedPhotos) ? parsedPhotos : [];

      // Filter by type
      const beforePhotos = photoArray
        .filter((photo) => photo.type === 'before')
        .map((photo) => ({
          ...photo,
          id: photo._id || photo.id,
          _id: photo._id || photo.id, // Keep _id for backward compatibility
          type: 'before' as const,
          status: photo.status || 'uploaded',
        }));

      const afterPhotos = photoArray
        .filter((photo) => photo.type === 'after')
        .map((photo) => ({
          ...photo,
          id: photo._id || photo.id,
          _id: photo._id || photo.id, // Keep _id for backward compatibility
          type: 'after' as const,
          status: photo.status || 'uploaded',
        }));

      return {
        before: beforePhotos,
        after: afterPhotos,
      };
    } catch (error) {
      console.error('Error parsing photos:', error, schedule?.photos);
      return { before: [], after: [] };
    }
  })();

  const signature = (() => {
    try {
      if (!schedule?.signature) {
        return undefined;
      }

      return typeof schedule.signature === 'string'
        ? JSON.parse(schedule.signature)
        : schedule.signature;
    } catch (error) {
      console.error('Error parsing signature:', error, schedule?.signature);
      return undefined;
    }
  })();

  const items: InvoiceItem[] = invoice.items ? JSON.parse(invoice.items) : [];

  const subtotal = items.reduce((sum, item) => sum + (item.price || 0), 0);
  const gst = subtotal * 0.05;
  const total = subtotal + gst;

  const hasBeforePhotos = photos.before?.length > 0;
  const hasAfterPhotos = photos.after?.length > 0;
  const hasSignature = !!signature;
  const isSignatureUploading = hasSignature && signature?.status === 'pending';
  const isWorkComplete = hasBeforePhotos && hasAfterPhotos && hasSignature && !isSignatureUploading;

  // Send invoice function
  const sendInvoice = async () => {
    setIsSendingInvoice(true);
    setSendInvoiceError(null);
    setShowConfirmationModal(false);

    try {
      // Create ApiClient instance - you'll need to get the actual auth token
      // For now using empty token, but you should replace this with actual Clerk token
      const apiClient = new ApiClient('');

      const result = await apiClient.sendInvoice(
        scheduleId,
        invoice.id,
        {
          invoiceId: invoice.invoiceId,
          jobTitle: invoice.jobTitle,
          location: invoice.location,
          dateIssued: invoice.dateIssued,
          dateDue: invoice.dateDue,
          items: items,
        },
        technicianId,
        true // Always send as complete since we're removing work documentation requirement
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to send invoice');
      }

      setInvoiceSent(true);
      setSendInvoiceError(null);
    } catch (error) {
      console.error('Error sending invoice:', error);
      setSendInvoiceError(
        error instanceof Error ? error.message : 'Failed to send invoice. Please try again.'
      );
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const handleSendInvoiceClick = () => {
    setShowConfirmationModal(true);
  };

  const renderWorkCompletionSection = () => {
    return (
      <View className='flex flex-col gap-6 border-t border-gray-200 dark:border-gray-700 pt-6 mt-6'>
        <Text className='text-xl font-bold text-gray-900 dark:text-white'>
          Work Documentation
        </Text>

        {/* Technician Notes - Now using separate component */}
        <TechnicianNotes
          key={`tech-notes-${scheduleId}`}
          schedule={schedule}
          scheduleId={scheduleId}
          isManager={isManager}
        />

        {/* Work Documentation Status */}
        <View className='flex flex-col gap-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
            Documentation Status
          </Text>
          <View className='flex-row flex-wrap gap-4'>
            <View
              className={`py-2 px-4 rounded-lg ${
                hasBeforePhotos
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-gray-100 dark:bg-gray-700'
              }`}
            >
              <Text
                className={`${
                  hasBeforePhotos
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {hasBeforePhotos
                  ? '✓ Before Photos'
                  : '○ Before Photos Missing'}
              </Text>
            </View>

            <View
              className={`py-2 px-4 rounded-lg ${
                hasAfterPhotos
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-gray-100 dark:bg-gray-700'
              }`}
            >
              <Text
                className={`${
                  hasAfterPhotos
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {hasAfterPhotos ? '✓ After Photos' : '○ After Photos Missing'}
              </Text>
            </View>

            <View
              className={`py-2 px-4 rounded-lg ${
                hasSignature
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-gray-100 dark:bg-gray-700'
              }`}
            >
              <Text
                className={`${
                  hasSignature
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {hasSignature ? '✓ Signature' : '○ Signature Missing'}
              </Text>
            </View>
          </View>
        </View>

        {/* Signature */}
        <View className='flex flex-col gap-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
            Customer Signature {hasSignature && '✓'}
          </Text>
          {!hasSignature ? (
            <TouchableOpacity
              onPress={() => setShowSignatureModal(true)}
              className='p-4 rounded-lg flex-row justify-center items-center bg-darkGreen'
            >
              <Text className='text-white font-medium text-lg'>
                ✍️ Tap to Sign
              </Text>
            </TouchableOpacity>
          ) : isSignatureUploading ? (
            <View className='p-4 rounded-lg flex-row justify-center items-center bg-blue-600'>
              <View className='h-5 w-5 rounded-full border-2 border-t-white animate-spin mr-2' />
              <Text className='text-white font-medium text-lg'>
                📤 Uploading Signature...
              </Text>
            </View>
          ) : (
            <View className='p-4 rounded-lg flex-row justify-center items-center bg-green-600'>
              <Text className='text-white font-medium text-lg'>
                ✅ Signature Captured
              </Text>
            </View>
          )}

          <SignatureCapture
            onSignatureCapture={() => {
              setShowSignatureModal(false);
            }}
            technicianId={technicianId}
            schedule={schedule}
            visible={showSignatureModal}
            onClose={() => setShowSignatureModal(false)}
            startDate={schedule?.startDateTime}
          />
        </View>

        {/* Work Complete Status */}
        {hasBeforePhotos && hasAfterPhotos && hasSignature && (
          <View className='bg-green-50 dark:bg-green-900/20 p-4 rounded-lg'>
            <Text className='text-green-800 dark:text-green-200 text-center font-medium'>
              ✓ Work Documentation Complete
            </Text>
          </View>
        )}

        {/* Send Invoice Section */}
        <View className='flex flex-col gap-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
            Send Invoice
          </Text>

          {invoiceSent ? (
            <View className='bg-green-50 dark:bg-green-900/20 p-4 rounded-lg'>
              <Text className='text-green-800 dark:text-green-200 text-center font-medium'>
                ✓ Invoice Sent Successfully
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleSendInvoiceClick}
              disabled={isSendingInvoice}
              className={`p-4 rounded-lg flex-row justify-center items-center ${
                isSendingInvoice
                  ? 'bg-gray-400 dark:bg-gray-600'
                  : 'bg-darkGreen'
              }`}
            >
              {isSendingInvoice ? (
                <View className='flex-row items-center gap-2'>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text className='text-white font-medium text-lg'>
                    Sending Invoice...
                  </Text>
                </View>
              ) : (
                <Text className='text-white font-medium text-lg'>
                  📧 Send Invoice
                </Text>
              )}
            </TouchableOpacity>
          )}


          {sendInvoiceError && (
            <View className='bg-red-50 dark:bg-red-900/20 p-4 rounded-lg'>
              <Text className='text-red-800 dark:text-red-200 text-center font-medium'>
                ⚠️ {sendInvoiceError}
              </Text>
              {!isSendingInvoice && (
                <TouchableOpacity
                  onPress={() => {
                    setSendInvoiceError(null);
                    sendInvoice();
                  }}
                  className='mt-2 p-2 bg-red-600 rounded-lg'
                >
                  <Text className='text-white text-center font-medium'>
                    Try Again
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  // Render the pricing section only for managers
  const renderPricingSection = () => {
    if (!isManager) return null;

    return (
      <View className='flex flex-col gap-6 border-t border-gray-200 dark:border-gray-700 pt-6 mt-6'>
        <Text className='text-xl font-bold text-gray-900 dark:text-white'>
          Invoice Details
        </Text>

        {/* Invoice items */}
        <View className='flex flex-col gap-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
            Items
          </Text>

          {items.length === 0 ? (
            <Text className='text-gray-500 dark:text-gray-400 italic'>
              No items added
            </Text>
          ) : (
            <View className='flex flex-col gap-4'>
              {items.map((item, index) => (
                <View
                  key={index}
                  className='flex-row justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg'
                >
                  <Text className='text-gray-700 dark:text-gray-300 flex-1'>
                    {item.description}
                  </Text>
                  <Text className='text-gray-700 dark:text-gray-300 font-semibold'>
                    ${item.price.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Pricing summary */}
        <View className='flex flex-col gap-2 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg'>
          <View className='flex-row justify-between items-center'>
            <Text className='text-gray-500 dark:text-gray-400'>Subtotal</Text>
            <Text className='text-gray-700 dark:text-gray-300'>
              ${subtotal.toFixed(2)}
            </Text>
          </View>
          <View className='flex-row justify-between items-center'>
            <Text className='text-gray-500 dark:text-gray-400'>GST (5%)</Text>
            <Text className='text-gray-700 dark:text-gray-300'>
              ${gst.toFixed(2)}
            </Text>
          </View>
          <View className='flex-row justify-between items-center border-t border-gray-200 dark:border-gray-600 pt-2 mt-2'>
            <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
              Total
            </Text>
            <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
              ${total.toFixed(2)}
            </Text>
          </View>
        </View>
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
                  {isManager ? `Invoice #${invoice.invoiceId}` : ''}
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
              {/* Dates Section - Show only for managers */}
              {isManager && (
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
              )}

              {/* Location Section */}
              <View className='bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg'>
                <View className='flex-row justify-between items-center'>
                  <View className='flex-1'>
                    <Text className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
                      Location
                    </Text>
                    <Text className='text-base font-medium text-gray-900 dark:text-white'>
                      {invoice.location}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openMaps(invoice.jobTitle, invoice.location)}
                    className='bg-darkGreen p-2 rounded-full ml-2'
                  >
                    <Ionicons name='navigate' size={20} color='#ffffff' />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Work Documentation Section */}
              {renderWorkCompletionSection()}

              {/* Invoice Details Section - Only for managers */}
              {renderPricingSection()}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        onConfirm={sendInvoice}
        title="Send Invoice"
        message={`Are you sure you want to send the invoice for "${invoice.jobTitle}" to the client?`}
        confirmText="Send Invoice"
        cancelText="Cancel"
        isLoading={isSendingInvoice}
      />
    </Modal>
  );
}
