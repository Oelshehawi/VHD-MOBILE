import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  SafeAreaView,
  ToastAndroid,
  Platform,
} from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import { SignatureType, InvoiceType } from '../../types';
import { useAuth } from '@clerk/clerk-expo';
import { usePowerSync } from '@powersync/react-native';
import { ApiClient } from '@/services/api';

// Toast utility function
const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // For iOS, you might want to use a custom toast component
    // For now, we'll use Alert
    Alert.alert('Success', message);
  }
};

interface SignatureCaptureProps {
  onSignatureCapture: () => void;
  technicianId: string;
  invoice: InvoiceType;
  visible: boolean;
  onClose: () => void;
}

export function SignatureCapture({
  onSignatureCapture,
  technicianId,
  invoice,
  visible,
  onClose,
}: SignatureCaptureProps) {
  const signatureRef = useRef<any>(null);
  const [signerName, setSignerName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const powerSync = usePowerSync();

  // Check if signature exists in photos data
  const hasSignature = (() => {
    try {
      if (!invoice?.photos) return false;
      const photosData = JSON.parse(invoice.photos);
      return !!photosData.signature;
    } catch (error) {
      console.error('Error parsing photos data:', error);
      return false;
    }
  })();

  const handleSignature = async (signature: string) => {
    if (!signerName.trim()) {
      Alert.alert('Error', "Please enter the signer's name");
      return;
    }

    try {
      setIsSaving(true);

      const signatureId = `sig_${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Create signature object
      const signatureData = {
        id: signatureId,
        url: signature,
        timestamp: new Date().toISOString(),
        technicianId,
        signerName: signerName.trim(),
        status: 'pending',
        type: 'signature' as const,
      };

      // Save to local database using PowerSync
      await powerSync.writeTransaction(async (tx) => {
        // Get existing photos to preserve before/after photos and existing pending ops
        const result = await tx.get<{ photos: string }>(
          'SELECT photos FROM invoices WHERE id = ?',
          [invoice.id]
        );

        const existingData = result?.photos ? JSON.parse(result.photos) : {};

        // Create updated data with new signature
        const updatedData = {
          ...existingData,
          before: existingData.before || [],
          after: existingData.after || [],
          signature: signatureData,
          pendingOps: [
            ...(existingData.pendingOps || []).filter(
              (op: any) => op.photoType !== 'signature'
            ),
            {
              type: 'add',
              photoId: signatureId,
              photoType: 'signature',
              technicianId,
              timestamp: new Date().toISOString(),
              signerName: signerName.trim(),
            },
          ],
        };

        await tx.execute(`UPDATE invoices SET photos = ? WHERE id = ?`, [
          JSON.stringify(updatedData),
          invoice.id,
        ]);
      });

      showToast('Signature saved and will sync when online');
      onSignatureCapture();
      onClose();
    } catch (error) {
      console.error('Error handling signature:', error);
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to save signature. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType='slide'
      transparent={false}
      visible={visible && !hasSignature}
      onRequestClose={onClose}
    >
      <SafeAreaView className='flex-1 bg-white dark:bg-gray-900'>
        <View className='flex-1 p-4 flex flex-col gap-4'>
          {/* Header with Loading State */}
          <View className='flex-row justify-between items-center'>
            <View className='flex-row items-center gap-2'>
              <Text className='text-xl font-bold text-gray-900 dark:text-white'>
                Electronic Signature Agreement
              </Text>
              {(isUploading || isSaving) && (
                <View className='h-5 w-5 rounded-full border-2 border-t-darkGreen animate-spin' />
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isUploading || isSaving}
              className='p-2 bg-gray-100 dark:bg-gray-700 rounded-full'
            >
              <Text className='text-gray-600 dark:text-gray-300 text-lg'>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          {/* Enhanced Legal Consent Statement */}
          <View className='bg-gray-100 dark:bg-gray-800 rounded-lg p-4'>
            <Text className='text-gray-900 dark:text-white font-medium mb-3'>
              Legal Authorization & Payment Agreement
            </Text>
            <View className='flex flex-col gap-2'>
              <Text className='text-gray-700 dark:text-gray-300'>
                By signing this electronic document, I hereby:
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • Confirm all work has been completed to my satisfaction
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • Authorize payment for the services rendered
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • Understand this is a legally binding electronic signature
                under the Electronic Transactions Act of British Columbia
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • Agree this signature carries the same weight and legal effect
                as a handwritten signature
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • Consent to using electronic signatures for this transaction
              </Text>
            </View>
          </View>

          {/* Signer Name Input */}
          <TextInput
            className='px-4 py-3 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg'
            placeholder='Signer Name'
            placeholderTextColor='#9ca3af'
            value={signerName}
            onChangeText={setSignerName}
          />

          {/* Signature Area with Loading State */}
          <View className='flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'>
            <SignatureCanvas
              ref={signatureRef}
              onOK={handleSignature}
              onEmpty={() => console.log('Empty')}
              descriptionText=''
              clearText='Clear'
              confirmText={
                isUploading ? 'Saving...' : isSaving ? 'Processing...' : 'Save'
              }
              webStyle={`
                .m-signature-pad {
                  height: 100%;
                  margin: 0;
                  border: none;
                }
                .m-signature-pad--body {
                  height: calc(100% - 64px);
                }
                .m-signature-pad--footer {
                  height: 64px;
                  position: absolute;
                  bottom: 0;
                  left: 0;
                  right: 0;
                  background-color: white;
                  display: flex;
                  flex-direction: row;
                  justify-content: space-between;
                  align-items: center;
                  padding: 12px;
                  border-top: 1px solid #e5e7eb;
                }
                .m-signature-pad--footer .button {
                  background-color: #f3f4f6;
                  color: #374151;
                  padding: 12px 24px;
                  border-radius: 8px;
                  font-weight: 500;
                  cursor: pointer;
                  border: 1px solid #e5e7eb;
                  min-width: 120px;
                  text-align: center;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  line-height: 1;
                }
                .m-signature-pad--footer .button.save {
                  background-color: #065f46;
                  color: white;
                  border-color: #065f46;
                }
                .m-signature-pad--footer .button:disabled {
                  opacity: 0.5;
                  cursor: not-allowed;
                  background-color: #9ca3af;
                }
              `}
            />
          </View>

          {/* Status Message */}
          {(isUploading || isSaving) && (
            <Text className='text-sm text-gray-500 dark:text-gray-400 text-center'>
              {isUploading
                ? 'Uploading signature...'
                : 'Processing signature...'}
            </Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
