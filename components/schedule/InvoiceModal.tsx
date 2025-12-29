import { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InvoiceType, Schedule } from '@/types';
import { formatDateReadable } from '@/utils/date';
import { SignatureCapture } from './SignatureCapture';
import {
  useQuery,
  usePowerSync,
  DEFAULT_ROW_COMPARATOR,
} from '@powersync/react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { openMaps } from '@/utils/dashboard';
import { TechnicianNotes } from './TechnicianNotes';
import { ApiClient } from '@/services/ApiClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Text } from '@/components/ui/text';
import { ATTACHMENT_TABLE, AttachmentState } from '@powersync/attachments';

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
  const bottomSheetRef = useRef<BottomSheet>(null);
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const powerSync = usePowerSync();
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // Send invoice state management
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [sendInvoiceError, setSendInvoiceError] = useState<string | null>(null);
  const [invoiceSent, setInvoiceSent] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);

  // Cheque payment state management
  const [isMarkingCheque, setIsMarkingCheque] = useState(false);
  const [chequeMarked, setChequeMarked] = useState(false);
  const [chequeError, setChequeError] = useState<string | null>(null);
  const [showChequeConfirmModal, setShowChequeConfirmModal] = useState(false);

  // Control bottom sheet index directly based on visible prop
  const sheetIndex = visible ? 0 : -1;

  // First fetch the schedule using the scheduleId
  const scheduleQuery = useQuery<Schedule>(
    scheduleId
      ? `SELECT * FROM schedules WHERE id = ?`
      : `SELECT * FROM schedules WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const schedule: Schedule | null =
    (scheduleQuery.data?.[0] as Schedule | undefined) ?? null;
  const invoiceRef = schedule?.invoiceRef;

  // Then fetch the invoice using the invoiceRef from the schedule
  const invoiceQuery = useQuery<InvoiceType>(
    invoiceRef
      ? `SELECT * FROM invoices WHERE id = ?`
      : `SELECT * FROM invoices WHERE 0`,
    [invoiceRef || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const invoice = invoiceQuery.data?.[0] || null;

  // Check if queries are still loading
  const isLoading = !schedule || !invoice;

  const { data: signatureAttachmentData = [] } = useQuery<any>(
    scheduleId
      ? `SELECT id, state, timestamp FROM ${ATTACHMENT_TABLE} WHERE scheduleId = ? AND type = 'signature' ORDER BY timestamp DESC LIMIT 1`
      : `SELECT id FROM ${ATTACHMENT_TABLE} WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const latestSignatureAttachment = signatureAttachmentData[0] || null;

  // If we have no invoice data, don't render content (but keep sheet for animation)
  const shouldShowContent = !isLoading && invoice;

  // Optimized: Only check if photos exist, don't parse/map entire arrays
  const { hasBeforePhotos, hasAfterPhotos } = useMemo(() => {
    try {
      const photos = (schedule as any)?.photos;
      if (!photos) {
        return { hasBeforePhotos: false, hasAfterPhotos: false };
      }

      const parsedPhotos =
        typeof photos === 'string' ? JSON.parse(photos) : photos;

      if (!Array.isArray(parsedPhotos) || parsedPhotos.length === 0) {
        return { hasBeforePhotos: false, hasAfterPhotos: false };
      }

      // Use .some() to short-circuit as soon as we find a match
      const hasBeforePhotos = parsedPhotos.some(
        (photo: any) => photo.type === 'before'
      );
      const hasAfterPhotos = parsedPhotos.some(
        (photo: any) => photo.type === 'after'
      );

      return { hasBeforePhotos, hasAfterPhotos };
    } catch (error) {
      console.error('Error parsing photos:', error);
      return { hasBeforePhotos: false, hasAfterPhotos: false };
    }
  }, [(schedule as any)?.photos]);

  // Optimized: Just check if signature exists, don't parse if unnecessary
  const hasSignatureData = useMemo(() => {
    try {
      const signature = (schedule as any)?.signature;
      if (!signature) {
        return false;
      }

      const parsed =
        typeof signature === 'string' ? JSON.parse(signature) : signature;

      return !!parsed;
    } catch (error) {
      console.error('Error parsing signature:', error);
      return false;
    }
  }, [(schedule as any)?.signature]);

  const items: InvoiceItem[] = useMemo(() => {
    if (!invoice?.items) return [];
    try {
      return JSON.parse(invoice.items) as InvoiceItem[];
    } catch (error) {
      console.error('Error parsing invoice items:', error);
      return [];
    }
  }, [invoice?.items]);

  const subtotal = items.reduce(
    (sum: number, item: InvoiceItem) => sum + (item.price || 0),
    0
  );
  const gst = subtotal * 0.05;
  const total = subtotal + gst;

  const attachmentStateValue =
    latestSignatureAttachment?.state === undefined ||
    latestSignatureAttachment?.state === null
      ? undefined
      : Number(latestSignatureAttachment.state);
  const hasPendingAttachment = !!latestSignatureAttachment;
  const attachmentSynced =
    attachmentStateValue !== undefined &&
    !Number.isNaN(attachmentStateValue) &&
    attachmentStateValue === AttachmentState.SYNCED;

  const hasSignature =
    hasSignatureData || (hasPendingAttachment && !attachmentSynced);
  const isSignatureUploading = hasPendingAttachment && !attachmentSynced;

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
        error instanceof Error
          ? error.message
          : 'Failed to send invoice. Please try again.'
      );
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const handleSendInvoiceClick = () => {
    setShowConfirmationModal(true);
  };

  // Mark cheque as paid function
  const markChequeAsPaid = async () => {
    if (!invoice?.id) return;

    try {
      setIsMarkingCheque(true);
      setChequeError(null);
      setShowChequeConfirmModal(false);

      const datePaid = new Date().toISOString();

      // Update local PowerSync database
      await powerSync.execute(
        `UPDATE invoices SET status = ?, paymentMethod = ?, paymentDatePaid = ? WHERE id = ?`,
        ['paid', 'cheque', datePaid, invoice.id]
      );

      setChequeMarked(true);
    } catch (error) {
      console.error('Error marking cheque as paid:', error);
      setChequeError(
        error instanceof Error
          ? error.message
          : 'Failed to mark cheque as paid. Please try again.'
      );
    } finally {
      setIsMarkingCheque(false);
    }
  };

  const handleMarkChequeClick = () => {
    setShowChequeConfirmModal(true);
  };

  // Render backdrop with proper dismiss behavior
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior='close'
      />
    ),
    []
  );

  // Handle bottom sheet close
  const handleSheetClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle X button press - close the sheet directly
  const handleClosePress = useCallback(() => {
    bottomSheetRef.current?.close();
    onClose();
  }, [onClose]);

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
                📤 Syncing Signature...
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
                  <ActivityIndicator size='small' color='#ffffff' />
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

        {/* Mark Cheque Received Section - Show for non-managers */}
        <View className='flex flex-col gap-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
            Payment Received
          </Text>

          {chequeMarked ||
          (invoice?.status === 'paid' &&
            invoice?.paymentMethod === 'cheque') ? (
            <View className='bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800'>
              <View className='flex-row items-center gap-2 mb-2'>
                <Text className='text-green-600 dark:text-green-400 text-xl'>
                  ✓
                </Text>
                <Text className='text-green-800 dark:text-green-200 font-semibold text-base'>
                  Cheque Marked as Received
                </Text>
              </View>
              {invoice?.paymentDatePaid && (
                <Text className='text-green-700 dark:text-green-300 text-sm mt-1'>
                  Payment received on:{' '}
                  {formatDateReadable(invoice.paymentDatePaid)}
                </Text>
              )}
              <Text className='text-green-700 dark:text-green-300 text-sm mt-1'>
                Invoice status has been updated to paid.
              </Text>
            </View>
          ) : invoice?.status !== 'paid' ? (
            <>
              <TouchableOpacity
                onPress={handleMarkChequeClick}
                disabled={isMarkingCheque}
                className={`p-4 rounded-lg flex-row justify-center items-center ${
                  isMarkingCheque
                    ? 'bg-gray-400 dark:bg-gray-600'
                    : 'bg-blue-600'
                }`}
              >
                {isMarkingCheque ? (
                  <View className='flex-row items-center gap-2'>
                    <ActivityIndicator size='small' color='#ffffff' />
                    <Text className='text-white font-medium text-lg'>
                      Updating...
                    </Text>
                  </View>
                ) : (
                  <Text className='text-white font-medium text-lg'>
                    💵 Mark Cheque Received
                  </Text>
                )}
              </TouchableOpacity>

              {chequeError && (
                <View className='bg-red-50 dark:bg-red-900/20 p-4 rounded-lg'>
                  <Text className='text-red-800 dark:text-red-200 text-center font-medium'>
                    ⚠️ {chequeError}
                  </Text>
                  {!isMarkingCheque && (
                    <TouchableOpacity
                      onPress={() => {
                        setChequeError(null);
                        markChequeAsPaid();
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
            </>
          ) : null}
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
              {items.map((item: InvoiceItem, index: number) => (
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
    <>
      <BottomSheet
        key={scheduleId}
        ref={bottomSheetRef}
        index={sheetIndex}
        snapPoints={['75%', '90%']}
        enablePanDownToClose={true}
        enableDynamicSizing={false}
        onClose={handleSheetClose}
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: colorScheme === 'dark' ? '#1F2937' : '#ffffff',
        }}
        handleIndicatorStyle={{
          backgroundColor: colorScheme === 'dark' ? '#6B7280' : '#D1D5DB',
        }}
      >
        {isLoading ? (
          <View className='flex-1 items-center justify-center px-6 py-8'>
            <ActivityIndicator size='large' color='#22543D' />
            <Text className='text-gray-600 dark:text-gray-300 mt-4'>
              Loading invoice...
            </Text>
          </View>
        ) : shouldShowContent ? (
          <>
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
                  onPress={handleClosePress}
                  className='w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full items-center justify-center'
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text className='text-gray-600 dark:text-gray-300 text-lg font-bold'>
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <BottomSheetScrollView
              className='flex-1 px-6 py-4'
              contentContainerStyle={{
                paddingBottom: Math.max(insets.bottom, 24),
              }}
            >
              <View className='flex flex-col gap-6'>
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
                      onPress={() =>
                        openMaps(invoice.jobTitle, invoice.location)
                      }
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
            </BottomSheetScrollView>
          </>
        ) : null}
      </BottomSheet>

      {/* Send Invoice AlertDialog - outside BottomSheet */}
      <AlertDialog
        open={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Text className='text-lg font-semibold'>Send Invoice</Text>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Text className='text-muted-foreground'>
                Are you sure you want to send the invoice for "
                {invoice?.jobTitle || ''}" to the client?
              </Text>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSendingInvoice}>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={sendInvoice}
              disabled={isSendingInvoice}
            >
              <Text>{isSendingInvoice ? 'Sending...' : 'Send Invoice'}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cheque Payment AlertDialog */}
      <AlertDialog
        open={showChequeConfirmModal}
        onOpenChange={setShowChequeConfirmModal}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Text className='text-lg font-semibold'>
                Confirm Cheque Received
              </Text>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Text className='text-muted-foreground'>
                Are you sure you received a cheque payment for "
                {invoice?.jobTitle || ''}"? This will mark the invoice as paid.
              </Text>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMarkingCheque}>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={markChequeAsPaid}
              disabled={isMarkingCheque}
            >
              <Text>{isMarkingCheque ? 'Updating...' : 'Confirm Payment'}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
