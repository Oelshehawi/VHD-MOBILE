import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { InvoiceType, PhotoType, SignatureType } from '../../types';
import { formatDateReadable } from '../../utils/date';
import { PhotoCapture } from './PhotoCapture';
import { SignatureCapture } from './SignatureCapture';
import { useAuth } from '@clerk/clerk-expo';
import { createInvoicesApi } from '../../services/api';

interface InvoiceModalProps {
  visible: boolean;
  onClose: () => void;
  invoice: InvoiceType | null;
  canManage: boolean;
  technicianId: string;
}

export function InvoiceModal({
  visible,
  onClose,
  invoice: initialInvoice,
  canManage,
  technicianId,
}: InvoiceModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceType | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const { getToken } = useAuth();

  // Update local invoice state when prop changes
  useEffect(() => {
    if (initialInvoice) {
      setInvoice(initialInvoice);
    }
  }, [initialInvoice]);

  const refreshInvoice = async () => {
    if (!invoice?._id) return;

    try {
      setIsLoading(true);
      const token = await getToken();
      const api = createInvoicesApi(token);
      if (!api) return;

      const updatedInvoice = await api.getById(invoice._id);
      setInvoice(updatedInvoice);
    } catch (error) {
      console.error('Error refreshing invoice:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotosCapture = async (
    photos: PhotoType[],
    type: 'before' | 'after'
  ) => {
    try {
      setIsLoading(true);
      await refreshInvoice();
    } catch (error) {
      console.error('Error updating photos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignatureCapture = async (signature: SignatureType) => {
    try {
      setIsLoading(true);
      await refreshInvoice();
      setShowSignatureModal(false);
    } catch (error) {
      console.error('Error updating signature:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setShowSignatureModal(false);
    }
  }, [visible]);

  if (!invoice) return null;

  const subtotal = invoice.items.reduce(
    (sum, item) => sum + (item.price || 0),
    0
  );
  const gst = subtotal * 0.05;
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

  const renderWorkCompletionSection = () => {
    const hasBeforePhotos =
      invoice.photos?.before && invoice.photos.before.length > 0;
    const hasAfterPhotos =
      invoice.photos?.after && invoice.photos.after.length > 0;
    const hasSignature = invoice.signature;

    return (
      <View className='flex flex-col gap-6 border-t border-gray-200 dark:border-gray-700 pt-6 mt-6'>
        <Text className='text-xl font-bold text-gray-900 dark:text-white'>
          Work Documentation
        </Text>

        {/* Before Photos */}
        <View className='flex flex-col gap-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
            Before Photos {hasBeforePhotos && '✓'}
          </Text>
          <PhotoCapture
            type='before'
            onPhotosCapture={(photos) => handlePhotosCapture(photos, 'before')}
            technicianId={technicianId}
            isLoading={isLoading}
            existingPhotos={invoice.photos?.before}
            jobTitle={invoice.jobTitle}
            invoiceId={invoice._id}
          />
        </View>

        {/* After Photos */}
        <View className='flex flex-col gap-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
            After Photos {hasAfterPhotos && '✓'}
          </Text>
          <PhotoCapture
            type='after'
            onPhotosCapture={(photos) => handlePhotosCapture(photos, 'after')}
            technicianId={technicianId}
            isLoading={isLoading}
            existingPhotos={invoice.photos?.after}
            jobTitle={invoice.jobTitle}
            invoiceId={invoice._id}
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
                disabled={isLoading}
                className={`p-4 rounded-lg flex-row justify-center items-center ${
                  isLoading ? 'bg-gray-300' : 'bg-darkGreen'
                }`}
              >
                <Text className='text-white font-medium text-lg'>
                  ✍️ Tap to Sign
                </Text>
              </TouchableOpacity>
              <SignatureCapture
                onSignatureCapture={handleSignatureCapture}
                technicianId={technicianId}
                invoice={invoice}
                isLoading={isLoading}
                visible={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
              />
            </View>
          ) : (
            <View className='bg-green-50 dark:bg-green-900/20 p-4 rounded-lg'>
              <Text className='text-green-800 dark:text-green-200 text-center font-medium'>
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

              {/* Items Section - Only visible to managers */}
              {canManage && (
                <View className='flex flex-col gap-4'>
                  <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
                    Services
                  </Text>
                  <View className='flex flex-col gap-3'>
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
              )}

              {/* Total Section - Only visible to managers */}
              {canManage && (
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
                      <Text className='text-xl font-bold text-white'>
                        ${total.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

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

              {/* Work Completion Section - Only visible to technicians */}
              {!canManage && renderWorkCompletionSection()}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
