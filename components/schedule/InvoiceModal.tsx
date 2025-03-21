import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { InvoiceType } from '@/types';
import { formatDateReadable } from '@/utils/date';
import { SignatureCapture } from './SignatureCapture';
import { useQuery, usePowerSync } from '@powersync/react-native';
import { Ionicons } from '@expo/vector-icons';
import { openMaps } from '@/utils/dashboard';

// TechnicianNotes component to encapsulate the notes editing functionality
function TechnicianNotes({
  schedule,
  scheduleId,
  isManager,
}: {
  schedule: any;
  scheduleId: string;
  isManager: boolean;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [technicianNotes, setTechnicianNotes] = useState(
    schedule?.technicianNotes || ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const powerSync = usePowerSync();

  // Function to save updated technicianNotes
  const saveTechnicianNotes = async () => {
    if (!scheduleId) return;

    try {
      setIsSaving(true);

      // Update local PowerSync database
      await powerSync.execute(
        `UPDATE schedules SET technicianNotes = ? WHERE id = ?`,
        [technicianNotes, scheduleId]
      );

      // Show success message
      Alert.alert('Success', 'Notes saved successfully');
      setEditingNotes(false);
    } catch (error) {
      console.error('Error saving technician notes:', error);
      Alert.alert('Error', 'Failed to save notes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className='flex flex-col gap-4'>
      <View className='flex-row justify-between items-center'>
        <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
          Technician Notes
        </Text>
        {!isManager && !editingNotes && (
          <TouchableOpacity
            onPress={() => setEditingNotes(true)}
            className='px-3 py-1 bg-darkGreen rounded-lg'
          >
            <Text className='text-white font-medium'>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {editingNotes ? (
        <View className='flex flex-col gap-3'>
          <TextInput
            className='bg-white dark:bg-gray-700 p-4 rounded-lg text-gray-700 dark:text-gray-300 min-h-[100px]'
            multiline
            value={technicianNotes}
            onChangeText={setTechnicianNotes}
            placeholder='Enter notes about the work completed...'
            placeholderTextColor='#9CA3AF'
          />
          <View className='flex-row justify-end gap-3'>
            <TouchableOpacity
              onPress={() => {
                setTechnicianNotes(schedule?.technicianNotes || '');
                setEditingNotes(false);
              }}
              className='px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg'
              disabled={isSaving}
            >
              <Text className='text-gray-700 dark:text-gray-300 font-medium'>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveTechnicianNotes}
              className='px-4 py-2 bg-darkGreen rounded-lg'
              disabled={isSaving}
            >
              <Text className='text-white font-medium'>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className='bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg'>
          {schedule?.technicianNotes ? (
            <Text className='text-gray-700 dark:text-gray-300'>
              {schedule.technicianNotes}
            </Text>
          ) : (
            <Text className='text-gray-500 dark:text-gray-400 italic'>
              No technician notes yet
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

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
  const powerSync = usePowerSync();

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

      // Check if we're using the new schema (single array with type) or legacy schema (before/after arrays)
      if (Array.isArray(parsedPhotos.photos)) {
        // New schema - filter by type
        const beforePhotos = parsedPhotos.photos
          .filter((photo: any) => photo.type === 'before')
          .map((photo: any) => ({
            ...photo,
            id: photo._id || photo.id,
            _id: photo._id || photo.id, // Keep _id for backward compatibility
            type: 'before' as const,
            status: photo.status || 'uploaded',
          }));

        const afterPhotos = parsedPhotos.photos
          .filter((photo: any) => photo.type === 'after')
          .map((photo: any) => ({
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
      } else {
        // Legacy schema with before/after arrays
        // Convert _id to id if needed and add type field
        return {
          before: Array.isArray(parsedPhotos.before)
            ? parsedPhotos.before.map((photo: any) => ({
                ...photo,
                id: photo._id || photo.id,
                _id: photo._id || photo.id, // Keep _id for backward compatibility
                type: 'before' as const,
                status: photo.status || 'uploaded',
              }))
            : [],
          after: Array.isArray(parsedPhotos.after)
            ? parsedPhotos.after.map((photo: any) => ({
                ...photo,
                id: photo._id || photo.id,
                _id: photo._id || photo.id, // Keep _id for backward compatibility
                type: 'after' as const,
                status: photo.status || 'uploaded',
              }))
            : [],
        };
      }
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
  const hasSignature = signature;

  const renderWorkCompletionSection = () => {
    return (
      <View className='flex flex-col gap-6 border-t border-gray-200 dark:border-gray-700 pt-6 mt-6'>
        <Text className='text-xl font-bold text-gray-900 dark:text-white'>
          Work Documentation
        </Text>

        {/* Technician Notes - Now using separate component */}
        <TechnicianNotes
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
                schedule={schedule}
                visible={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                startDate={schedule?.startDateTime}
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
    </Modal>
  );
}
