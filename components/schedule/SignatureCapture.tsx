import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SignatureCanvas from 'react-native-signature-canvas';
import { usePowerSync } from '@powersync/react-native';
import { PhotoType, showToast, SignatureType } from '@/utils/photos';
import { useSystem } from '@/services/database/System';
import { AttachmentRecord } from '@powersync/attachments';
import { checkAndStartBackgroundUpload } from '@/services/background/BackgroundUploadService'; // Add this import
import { logPhoto, logPhotoError } from '@/utils/DebugLogger'; // Add this import for logging

// Define extended attachment type locally
interface ExtendedAttachmentRecord extends AttachmentRecord {
  scheduleId?: string;
  jobTitle?: string;
  type?: 'before' | 'after' | 'signature';
  startDate?: string;
  technicianId?: string;
  signerName?: string;
}

export interface SignatureSchedule {
  id?: string;
  jobTitle?: string;
  signature?: PhotoType;
  photos?: string; // JSON string
}

interface SignatureCaptureProps {
  onSignatureCapture: () => void;
  technicianId: string;
  schedule: SignatureSchedule | null;
  visible: boolean;
  onClose: () => void;
  startDate?: string;
}

export function SignatureCapture({
  onSignatureCapture,
  technicianId,
  schedule,
  visible,
  onClose,
  startDate,
}: SignatureCaptureProps) {
  const signatureRef = useRef<any>(null);
  const [signerName, setSignerName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const powerSync = usePowerSync();
  const system = useSystem();

  // Check if signature exists
  const hasSignature = !!schedule?.signature;

  const handleSignature = async (signature: string) => {
    if (!schedule?.id) {
      Alert.alert('Error', 'Schedule information is missing');
      return;
    }

    if (!signerName.trim()) {
      Alert.alert('Error', "Please enter the signer's name");
      return;
    }

    if (!system?.attachmentQueue) {
      Alert.alert('Error', 'System is not properly initialized');
      return;
    }

    try {
      setIsSaving(true);
      logPhoto('Starting signature save process', {
        // Add logging
        scheduleId: schedule.id,
        technicianId,
        signerName,
      });

      // Get the queue from system
      const queue = system.attachmentQueue;

      // Pass the data URI directly to savePhotoFromUri
      // The signature canvas returns a data URI like "data:image/png;base64,iVBORw0KG..."
      // prepareImageForUpload can handle this directly - no temp file needed!
      const attachmentRecord = (await queue.savePhotoFromUri(
        signature, // Pass data URI directly - much faster!
        schedule.id,
        schedule.jobTitle,
        'signature', // Set type as signature
        startDate,
        technicianId,
        signerName // Pass the signer name
      )) as ExtendedAttachmentRecord;

      logPhoto('Signature saved to queue', {
        // Add logging
        attachmentId: attachmentRecord.id,
        filename: attachmentRecord.filename,
      });

      // Update schedule record in PowerSync database to trigger UI refresh
      try {
        const signatureData = {
          id: attachmentRecord.id,
          url: attachmentRecord.local_uri,
          filename: attachmentRecord.filename,
          type: 'signature',
          status: 'pending',
          signerName: signerName,
          timestamp: new Date().toISOString(),
        };

        await powerSync.execute(
          `UPDATE schedules SET signature = ? WHERE id = ?`,
          [JSON.stringify(signatureData), schedule.id]
        );
        logPhoto('Schedule updated with signature data'); // Add logging
      } catch (dbError) {
        logPhotoError(
          'Failed to update schedule signature in database:',
          dbError
        ); // Add logging
        // Don't throw - the attachment is saved, just the UI won't update immediately
      }

      // Start background upload process for signature (like PhotoCapture does)
      logPhoto('Starting background upload service for signature'); // Add logging
      try {
        await checkAndStartBackgroundUpload();
        logPhoto(
          'Background upload service started successfully for signature'
        ); // Add logging
      } catch (uploadError) {
        logPhotoError(
          'Failed to start background upload service for signature',
          uploadError
        ); // Add logging
      }

      showToast('Signature saved and will sync when online');

      // Close immediately
      onSignatureCapture();
    } catch (error) {
      logPhotoError('Error handling signature:', {
        // Add logging
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to save signature. Please try again.'
      );
    } finally {
      setIsSaving(false);
      logPhoto('Signature save process finished'); // Add logging
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
