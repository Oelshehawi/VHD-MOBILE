import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useColorScheme,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, DEFAULT_ROW_COMPARATOR, usePowerSync } from '@powersync/react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';
import type { InvoiceType, Schedule } from '@/types';
import type { ReportStatus } from '@/types/report';
import { PhotoDocumentationModal } from '@/components/PhotoComponents/PhotoDocumentationModal';
import { SignatureCapture } from './SignatureCapture';
import { TechnicianNotes } from './TechnicianNotes';
import { EquipmentProfilePanel } from './EquipmentProfilePanel';
import { formatScheduleTime, getScheduleStartAtUtc } from '@/utils/scheduleTime';
import { openMaps } from '@/utils/dashboard';
import { isScheduleReportRequired } from '@/utils/schedules';
import { invoiceLinksToSchedule } from '@/utils/invoices';
import { useLocationPermissionState } from '@/components/location/useLocationPermissionState';
import { canMarkChequeReceived } from '@/utils/invoicePayment';
import { formatDateReadable, formatVancouverTimestamp } from '@/utils/date';
import { ApiClient } from '@/services/ApiClient';
import { ServiceReportModal } from './ServiceReportModal';

interface JobDetailModalProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string;
  technicianId: string;
  isManager: boolean;
}

interface PhotoStatusRow {
  beforeCount: number | null;
  afterCount: number | null;
  signatureCount: number | null;
  uploadingSignatureCount: number | null;
}

interface InvoiceItem {
  description: string;
  price: number;
}

function parseInvoiceItems(value: string | null | undefined): InvoiceItem[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): InvoiceItem | null => {
        if (!item || typeof item !== 'object') return null;
        const record = item as { description?: unknown; price?: unknown };
        const price = Number(record.price ?? 0);

        return {
          description: typeof record.description === 'string' ? record.description : 'Invoice item',
          price: Number.isFinite(price) ? price : 0
        };
      })
      .filter((item): item is InvoiceItem => item !== null);
  } catch {
    return [];
  }
}

function parseOnSiteContact(value: unknown): { name?: string; phone?: string; email?: string } | null {
  if (!value) return null;
  if (typeof value === 'object') return value as { name?: string; phone?: string; email?: string };

  try {
    const parsed = JSON.parse(String(value));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function openPhone(phoneNumber: string) {
  const cleanedNumber = phoneNumber.replace(/[^\d+]/g, '');
  const phoneUrl = Platform.OS === 'ios' ? `telprompt:${cleanedNumber}` : `tel:${cleanedNumber}`;
  Linking.openURL(phoneUrl).catch(() => undefined);
}

function StatusBadge({ done, warn, label }: { done: boolean; warn?: boolean; label: string }) {
  const color = done
    ? 'bg-emerald-100 dark:bg-emerald-950/70'
    : warn
      ? 'bg-amber-100 dark:bg-amber-950/70'
      : 'bg-gray-100 dark:bg-white/10';
  const textColor = done
    ? 'text-emerald-800 dark:text-emerald-200'
    : warn
      ? 'text-amber-900 dark:text-amber-200'
      : 'text-gray-600 dark:text-gray-200';

  return (
    <View className={`rounded-full px-2 py-1 ${color}`}>
      <Text className={`text-xs font-semibold ${textColor}`}>{label}</Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  detail,
  done,
  warn,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  done?: boolean;
  warn?: boolean;
  onPress?: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const chevronColor = isDark ? '#C9C3BA' : '#76706A';
  const defaultIconColor = isDark ? '#F2EFEA' : '#3D3833';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className='rounded-2xl border border-black/10 bg-white p-4 active:bg-gray-50 dark:border-white/10 dark:bg-[#16140F] dark:active:bg-[#1F1C16]'
    >
      <View className='flex-row items-center gap-3'>
        <View
          className={`h-11 w-11 items-center justify-center rounded-xl ${
            done ? 'bg-emerald-100' : warn ? 'bg-amber-100' : 'bg-[#F0EDE6] dark:bg-gray-800'
          }`}
        >
          <Ionicons
            name={done ? 'checkmark' : icon}
            size={22}
            color={done ? '#047857' : warn ? '#92400E' : defaultIconColor}
          />
        </View>
        <View className='flex-1'>
          <Text className='text-base font-semibold text-[#14110F] dark:text-white'>{label}</Text>
          <Text className={`mt-1 text-xs font-medium ${warn && !done ? 'text-amber-800' : 'text-gray-500'}`}>
            {detail}
          </Text>
        </View>
        {onPress && <Ionicons name='chevron-forward' size={18} color={chevronColor} />}
      </View>
    </Pressable>
  );
}

export function JobDetailModal({
  visible,
  onClose,
  scheduleId,
  technicianId,
  isManager
}: JobDetailModalProps) {
  const insets = useSafeAreaInsets();
  const powerSync = usePowerSync();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#F2EFEA' : '#14110F';
  const invertedIconColor = isDark ? '#14110F' : '#F7F5F1';
  const [photoMode, setPhotoMode] = useState<'before' | 'after' | null>(null);
  const [signatureVisible, setSignatureVisible] = useState(false);
  const [invoiceDetailsVisible, setInvoiceDetailsVisible] = useState(false);
  const [isMarkingCheque, setIsMarkingCheque] = useState(false);
  const [chequeError, setChequeError] = useState<string | null>(null);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [sendInvoiceMessage, setSendInvoiceMessage] = useState<string | null>(null);
  const [sendInvoiceError, setSendInvoiceError] = useState<string | null>(null);
  const [reportVisible, setReportVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setInvoiceDetailsVisible(false);
      setChequeError(null);
      setSendInvoiceMessage(null);
      setSendInvoiceError(null);
    }
  }, [scheduleId, visible]);

  const scheduleQuery = useQuery<Schedule>(
    scheduleId ? `SELECT * FROM schedules WHERE id = ?` : `SELECT * FROM schedules WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const schedule = (scheduleQuery.data?.[0] as Schedule | undefined) ?? null;

  const invoiceQuery = useQuery<InvoiceType>(
    scheduleId ? `SELECT * FROM invoices WHERE visitIds LIKE ?` : `SELECT * FROM invoices WHERE 0`,
    [`%${scheduleId}%`],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const linkedInvoices = useMemo(
    () => (invoiceQuery.data ?? []).filter((candidate) => invoiceLinksToSchedule(candidate, scheduleId)),
    [invoiceQuery.data, scheduleId]
  );
  const invoice = linkedInvoices.length === 1 ? linkedInvoices[0] : null;
  const invoiceItems = useMemo(() => parseInvoiceItems(invoice?.items), [invoice?.items]);
  const invoiceSubtotal = useMemo(
    () => invoiceItems.reduce((sum, item) => sum + item.price, 0),
    [invoiceItems]
  );
  const invoiceGst = invoiceSubtotal * 0.05;
  const invoiceTotal = invoiceSubtotal + invoiceGst;

  const { data: photoRows = [] } = useQuery<PhotoStatusRow>(
    scheduleId
      ? `SELECT
           SUM(CASE WHEN type = 'before' THEN 1 ELSE 0 END) as beforeCount,
           SUM(CASE WHEN type = 'after' THEN 1 ELSE 0 END) as afterCount,
           SUM(CASE WHEN type = 'signature' THEN 1 ELSE 0 END) as signatureCount,
           SUM(CASE WHEN type = 'signature' AND cloudinaryUrl IS NULL THEN 1 ELSE 0 END) as uploadingSignatureCount
         FROM photos
         WHERE scheduleId = ?`
      : `SELECT 0 as beforeCount, 0 as afterCount, 0 as signatureCount, 0 as uploadingSignatureCount`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const { data: trackingWindowRows = [] } = useQuery<{ id: string }>(
    scheduleId
      ? `SELECT id FROM techniciantrackingwindows WHERE scheduleId = ? AND status IN ('planned', 'active') LIMIT 1`
      : `SELECT '' as id WHERE 0`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
  const hasTrackingWindow = trackingWindowRows.length > 0;
  const permissionState = useLocationPermissionState();
  const trackingPermissionWarn =
    hasTrackingWindow &&
    permissionState !== null &&
    permissionState.kind !== 'granted' &&
    permissionState.kind !== 'unavailable';

  const { data: reportRows = [] } = useQuery<{ reportStatus: ReportStatus | null }>(
    scheduleId
      ? `SELECT reportStatus FROM reports WHERE scheduleId = ? ORDER BY dateCompleted DESC LIMIT 1`
      : `SELECT NULL as reportStatus`,
    [scheduleId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  const markChequeAsPaid = async () => {
    if (!invoice?.id || !canMarkChequeReceived(invoice)) return;

    try {
      setIsMarkingCheque(true);
      setChequeError(null);

      await powerSync.execute(
        `UPDATE invoices SET status = ?, paymentMethod = ?, paymentDatePaid = ? WHERE id = ?`,
        ['paid', 'cheque', formatVancouverTimestamp(), invoice.id]
      );
    } catch (error) {
      setChequeError(
        error instanceof Error ? error.message : 'Failed to mark cheque as received. Please try again.'
      );
    } finally {
      setIsMarkingCheque(false);
    }
  };

  const confirmMarkChequeAsPaid = () => {
    if (!invoice?.id || !canMarkChequeReceived(invoice) || isMarkingCheque) return;

    Alert.alert(
      'Confirm Cheque Received',
      `Mark this invoice as paid by cheque for "${invoice.jobTitle || schedule?.jobTitle || ''}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Payment',
          onPress: markChequeAsPaid
        }
      ]
    );
  };

  const sendInvoice = async () => {
    if (!invoice?.id || isSendingInvoice) return;

    try {
      setIsSendingInvoice(true);
      setSendInvoiceError(null);
      setSendInvoiceMessage(null);

      const result = await new ApiClient().sendInvoice(scheduleId, technicianId);
      if (!result.success) {
        setSendInvoiceError(result.error || 'Failed to send invoice. Please try again.');
        return;
      }

      setSendInvoiceMessage('Invoice sent successfully.');
    } catch (error) {
      setSendInvoiceError(
        error instanceof Error ? error.message : 'Failed to send invoice. Please try again.'
      );
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const confirmSendInvoice = () => {
    if (!invoice?.id || isSendingInvoice) return;

    Alert.alert(
      'Send Invoice',
      `Send invoice ${invoice.invoiceId || ''} for "${invoice.jobTitle || schedule?.jobTitle || ''}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: sendInvoice
        }
      ]
    );
  };

  const handleOpenReport = () => {
    if (!schedule) return;
    setReportVisible(true);
  };

  if (!visible) return null;

  const beforeCount = Number(photoRows[0]?.beforeCount ?? 0);
  const afterCount = Number(photoRows[0]?.afterCount ?? 0);
  const signatureCount = Number(photoRows[0]?.signatureCount ?? 0);
  const uploadingSignatureCount = Number(photoRows[0]?.uploadingSignatureCount ?? 0);
  const reportRequired = isScheduleReportRequired(schedule ?? {});
  const reportStatus = reportRows[0]?.reportStatus ?? null;
  const reportDone = !reportRequired || reportStatus === 'in_progress' || reportStatus === 'completed';
  const onSiteContact = parseOnSiteContact(schedule?.onSiteContact);
  const startAtUtc = getScheduleStartAtUtc(schedule ?? {});
  const canReceiveCheque = invoice ? canMarkChequeReceived(invoice) : false;
  const paymentDate = formatDateReadable(invoice?.paymentDatePaid);
  const paymentStatusLabel =
    invoice?.status === 'paid'
      ? invoice.paymentMethod === 'cheque'
        ? 'Cheque received'
        : 'Payment received'
      : 'Payment not received';
  const paymentStatusDetail =
    invoice?.status === 'paid'
      ? paymentDate
        ? `Received ${paymentDate}`
        : 'Invoice is marked paid'
      : 'Mark cheque once it is in hand';

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType='slide' presentationStyle='fullScreen'>
      <View className='flex-1 bg-[#F7F5F1] dark:bg-gray-950' style={{ paddingTop: insets.top }}>
        <View className='border-b border-black/10 px-4 py-3 dark:border-white/10'>
          <View className='flex-row items-center gap-3'>
            <View className='flex-1'>
              <Text className='text-2xl font-bold text-[#14110F] dark:text-white' numberOfLines={2}>
                {schedule?.jobTitle || 'Job details'}
              </Text>
              <Text className='mt-1 text-xs font-medium text-gray-500' numberOfLines={1}>
                {schedule ? `${formatScheduleTime(schedule)} - ${schedule.location}` : 'Loading...'}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              className='h-10 w-10 items-center justify-center rounded-xl border border-black/15 bg-white dark:border-white/20 dark:bg-[#16140F]'
            >
              <Ionicons name='close' size={22} color={iconColor} />
            </Pressable>
          </View>
        </View>

        {!schedule ? (
          <View className='flex-1 items-center justify-center px-6'>
            <Text className='text-gray-500'>Loading job details...</Text>
          </View>
        ) : (
          <ScrollView
            className='flex-1'
            contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
          >
            <View className='px-4 pt-4'>
              <View className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
                <View className='flex-row gap-3'>
                  <Pressable
                    onPress={() => openMaps(schedule.jobTitle, schedule.location)}
                    className='flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#14110F] px-4 py-4 dark:bg-amber-400'
                  >
                    <Ionicons name='navigate' size={18} color={invertedIconColor} />
                    <Text className='font-bold text-[#F7F5F1] dark:text-[#14110F]'>Navigate</Text>
                  </Pressable>
                  {onSiteContact?.phone && (
                    <Pressable
                      onPress={() => openPhone(onSiteContact.phone!)}
                      className='flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-4 dark:border-white/20 dark:bg-[#16140F]'
                    >
                      <Ionicons name='call-outline' size={18} color={iconColor} />
                      <Text className='font-bold text-[#14110F] dark:text-white'>Call</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

            <View className='px-4 pt-5'>
              <Text className='mb-3 text-xs font-bold uppercase tracking-widest text-gray-500'>
                Documentation
              </Text>
              <View className='gap-3'>
                <DetailRow
                  icon='camera-outline'
                  label='Before photos'
                  detail={`${beforeCount} captured for this visit`}
                  done={beforeCount > 0}
                  warn={beforeCount === 0}
                  onPress={() => setPhotoMode('before')}
                />
                <DetailRow
                  icon='camera-outline'
                  label='After photos'
                  detail={afterCount > 0 ? `${afterCount} captured for this visit` : 'Pending'}
                  done={afterCount > 0}
                  warn={afterCount === 0}
                  onPress={() => setPhotoMode('after')}
                />
                <DetailRow
                  icon='create-outline'
                  label='Customer signature'
                  detail={
                    signatureCount > 0
                      ? uploadingSignatureCount > 0
                        ? 'Captured - uploading'
                        : 'Signed'
                      : 'Missing'
                  }
                  done={signatureCount > 0}
                  warn={signatureCount === 0}
                  onPress={() => setSignatureVisible(true)}
                />
                {trackingPermissionWarn && (
                  <DetailRow
                    icon='location-outline'
                    label='Location tracking unavailable'
                    detail='Permission missing. Tap to update settings.'
                    warn
                    onPress={() => Linking.openSettings().catch(() => undefined)}
                  />
                )}
                {reportRequired && (
                  <DetailRow
                    icon='document-text-outline'
                    label='Service report'
                    detail={reportDone ? 'Started or submitted' : 'Required'}
                    done={reportDone}
                    warn={!reportDone}
                    onPress={handleOpenReport}
                  />
                )}
              </View>
            </View>

            <View className='px-4 pt-5'>
              <Text className='mb-3 text-xs font-bold uppercase tracking-widest text-gray-500'>
                Notes
              </Text>
              <View className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
                <TechnicianNotes schedule={schedule} scheduleId={scheduleId} />
              </View>
            </View>

            <View className='px-4 pt-5'>
              <Text className='mb-3 text-xs font-bold uppercase tracking-widest text-gray-500'>
                On-site Info
              </Text>
              <View className='gap-3'>
                <View className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
                  <Text className='text-xs font-semibold uppercase tracking-widest text-gray-500'>
                    Location
                  </Text>
                  <Text className='mt-2 text-base font-semibold text-[#14110F] dark:text-white'>
                    {schedule.location}
                  </Text>
                </View>
                {onSiteContact && (
                  <View className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
                    <Text className='text-xs font-semibold uppercase tracking-widest text-gray-500'>
                      Contact
                    </Text>
                    {onSiteContact.name && (
                      <Text className='mt-2 text-base font-semibold text-[#14110F] dark:text-white'>
                        {onSiteContact.name}
                      </Text>
                    )}
                    {onSiteContact.phone && (
                      <Text className='mt-1 text-sm font-medium text-gray-500'>
                        {onSiteContact.phone}
                      </Text>
                    )}
                    {onSiteContact.email && (
                      <Text className='mt-1 text-sm font-medium text-gray-500'>
                        {onSiteContact.email}
                      </Text>
                    )}
                  </View>
                )}
                {schedule.accessInstructions && (
                  <View className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
                    <Text className='text-xs font-semibold uppercase tracking-widest text-gray-500'>
                      Access
                    </Text>
                    <Text className='mt-2 text-sm leading-5 text-[#14110F] dark:text-white'>
                      {schedule.accessInstructions}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View className='px-4 pt-5'>
              <Text className='mb-3 text-xs font-bold uppercase tracking-widest text-gray-500'>
                Equipment
              </Text>
              <EquipmentProfilePanel serviceJobId={schedule.serviceJobId} />
            </View>

            {(isManager || invoice) && (
              <View className='px-4 pt-5'>
                <Text className='mb-3 text-xs font-bold uppercase tracking-widest text-gray-500'>
                  Billing
                </Text>
                <View className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
                  {invoice ? (
                    <>
                      <Pressable
                        onPress={
                          isManager ? () => setInvoiceDetailsVisible((current) => !current) : undefined
                        }
                        disabled={!isManager}
                      >
                        <View className='flex-row items-center justify-between gap-3'>
                          <View className='flex-1'>
                            <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
                              {invoice.invoiceId}
                            </Text>
                            <Text className='mt-1 text-xs font-medium text-gray-500 dark:text-gray-400'>
                              {isManager ? 'Tap to view invoice pricing' : invoice.status || 'pending'}
                            </Text>
                          </View>
                          <View className='flex-row items-center gap-2'>
                            <StatusBadge done={invoice.status === 'paid'} label={invoice.status || 'linked'} />
                            {isManager && (
                              <Ionicons
                                name={invoiceDetailsVisible ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                color={iconColor}
                              />
                            )}
                          </View>
                        </View>
                      </Pressable>
                      {isManager && invoiceDetailsVisible && (
                        <View className='mt-4 border-t border-black/10 pt-4 dark:border-white/10'>
                          <View className='gap-3'>
                            {invoiceItems.length === 0 ? (
                              <Text className='text-sm italic text-gray-500 dark:text-gray-400'>
                                No invoice items found.
                              </Text>
                            ) : (
                              invoiceItems.map((item, index) => (
                                <View
                                  key={`${item.description}-${index}`}
                                  className='flex-row items-center justify-between gap-3 rounded-xl border border-black/10 bg-[#F7F5F1] p-3 dark:border-white/10 dark:bg-[#1F1C16]'
                                >
                                  <Text className='flex-1 text-sm font-medium text-[#14110F] dark:text-white'>
                                    {item.description}
                                  </Text>
                                  <Text className='font-mono text-sm font-bold text-[#14110F] dark:text-white'>
                                    ${item.price.toFixed(2)}
                                  </Text>
                                </View>
                              ))
                            )}
                          </View>

                          <View className='mt-4 gap-2 rounded-xl bg-[#F7F5F1] p-3 dark:bg-[#1F1C16]'>
                            <View className='flex-row justify-between'>
                              <Text className='text-sm text-gray-500 dark:text-gray-400'>Subtotal</Text>
                              <Text className='font-mono text-sm text-[#14110F] dark:text-white'>
                                ${invoiceSubtotal.toFixed(2)}
                              </Text>
                            </View>
                            <View className='flex-row justify-between'>
                              <Text className='text-sm text-gray-500 dark:text-gray-400'>GST (5%)</Text>
                              <Text className='font-mono text-sm text-[#14110F] dark:text-white'>
                                ${invoiceGst.toFixed(2)}
                              </Text>
                            </View>
                            <View className='mt-1 flex-row justify-between border-t border-black/10 pt-2 dark:border-white/10'>
                              <Text className='font-semibold text-[#14110F] dark:text-white'>Total</Text>
                              <Text className='font-mono font-bold text-[#14110F] dark:text-white'>
                                ${invoiceTotal.toFixed(2)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}
                      <View className='mt-4 border-t border-black/10 pt-4 dark:border-white/10'>
                        <View className='flex-row items-center gap-3'>
                          <View
                            className={`h-10 w-10 items-center justify-center rounded-xl ${
                              invoice.status === 'paid'
                                ? 'bg-emerald-100 dark:bg-emerald-950/70'
                                : 'bg-[#F0EDE6] dark:bg-gray-800'
                            }`}
                          >
                            <Ionicons
                              name={invoice.status === 'paid' ? 'checkmark' : 'cash-outline'}
                              size={20}
                              color={invoice.status === 'paid' ? '#047857' : iconColor}
                            />
                          </View>
                          <View className='flex-1'>
                            <Text className='text-sm font-semibold text-[#14110F] dark:text-white'>
                              {paymentStatusLabel}
                            </Text>
                            <Text className='mt-1 text-xs font-medium text-gray-500 dark:text-gray-400'>
                              {paymentStatusDetail}
                            </Text>
                          </View>
                        </View>

                        {canReceiveCheque && (
                          <Pressable
                            onPress={confirmMarkChequeAsPaid}
                            disabled={isMarkingCheque}
                            className={`mt-4 flex-row items-center justify-center gap-2 rounded-xl px-4 py-4 ${
                              isMarkingCheque ? 'bg-gray-400 dark:bg-gray-700' : 'bg-[#14110F] dark:bg-amber-400'
                            }`}
                          >
                            {isMarkingCheque ? (
                              <ActivityIndicator size='small' color={invertedIconColor} />
                            ) : (
                              <Ionicons name='cash-outline' size={18} color={invertedIconColor} />
                            )}
                            <Text className='font-bold text-[#F7F5F1] dark:text-[#14110F]'>
                              {isMarkingCheque ? 'Updating...' : 'Mark cheque received'}
                            </Text>
                          </Pressable>
                        )}

                        {chequeError && (
                          <View className='mt-3 rounded-xl bg-red-50 p-3 dark:bg-red-950/40'>
                            <Text className='text-sm font-medium text-red-800 dark:text-red-200'>
                              {chequeError}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View className='mt-4 border-t border-black/10 pt-4 dark:border-white/10'>
                        <Pressable
                          onPress={confirmSendInvoice}
                          disabled={isSendingInvoice}
                          className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-4 ${
                            isSendingInvoice ? 'bg-gray-400 dark:bg-gray-700' : 'bg-emerald-600 dark:bg-emerald-400'
                          }`}
                        >
                          {isSendingInvoice ? (
                            <ActivityIndicator size='small' color={invertedIconColor} />
                          ) : (
                            <Ionicons name='send-outline' size={18} color={invertedIconColor} />
                          )}
                          <Text className='font-bold text-white dark:text-[#14110F]'>
                            {isSendingInvoice ? 'Sending...' : 'Send invoice'}
                          </Text>
                        </Pressable>

                        {sendInvoiceMessage && (
                          <View className='mt-3 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/40'>
                            <Text className='text-sm font-medium text-emerald-800 dark:text-emerald-200'>
                              {sendInvoiceMessage}
                            </Text>
                          </View>
                        )}

                        {sendInvoiceError && (
                          <View className='mt-3 rounded-xl bg-red-50 p-3 dark:bg-red-950/40'>
                            <Text className='text-sm font-medium text-red-800 dark:text-red-200'>
                              {sendInvoiceError}
                            </Text>
                          </View>
                        )}
                      </View>
                    </>
                  ) : (
                    <Text className='text-sm font-medium text-gray-500 dark:text-gray-400'>
                      {linkedInvoices.length > 1
                        ? 'Multiple invoices are linked to this visit.'
                        : 'No invoice linked yet.'}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {schedule && photoMode && (
          <PhotoDocumentationModal
            visible={!!photoMode}
            onClose={() => setPhotoMode(null)}
            scheduleId={scheduleId}
            serviceJobId={schedule.serviceJobId}
            jobTitle={schedule.jobTitle}
            scheduledStartAtUtc={startAtUtc}
            technicianId={technicianId}
            initialMode={photoMode}
          />
        )}

        {schedule && (
          <SignatureCapture
            onSignatureCapture={() => setSignatureVisible(false)}
            technicianId={technicianId}
            schedule={schedule}
            visible={signatureVisible}
            onClose={() => setSignatureVisible(false)}
          />
        )}

        {schedule && (
          <ServiceReportModal
            visible={reportVisible}
            onClose={() => setReportVisible(false)}
            scheduleId={scheduleId}
            jobTitle={schedule.jobTitle}
            scheduledStartAtUtc={startAtUtc}
            timeZone={schedule.timeZone}
            technicianId={technicianId}
          />
        )}
      </View>
    </Modal>
  );
}
