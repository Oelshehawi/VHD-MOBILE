import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  SafeAreaView,
} from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import { usePowerSync } from '@powersync/react-native';
import {
  PhotoType,
  showToast,
  createOptimisticPhoto,
  createPendingOp,
  parsePhotosData,
} from '@/utils/photos';

// Define ScheduleType interface to fix TS error
interface ScheduleType {
  id: string;
  jobTitle?: string;
  signature?: PhotoType;
  photos?: string; // JSON string
}

interface SignatureCaptureProps {
  onSignatureCapture: () => void;
  technicianId: string;
  schedule: ScheduleType | null;
  visible: boolean;
  onClose: () => void;
}

export function SignatureCapture({
  onSignatureCapture,
  technicianId,
  schedule,
  visible,
  onClose,
}: SignatureCaptureProps) {
  const signatureRef = useRef<any>(null);
  const [signerName, setSignerName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const powerSync = usePowerSync();

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

    try {
      setIsSaving(true);

      // Create signature object using utility function
      const signatureData = createOptimisticPhoto(
        signature,
        technicianId,
        'signature',
        signerName.trim()
      );

      // Save to local database with pendingOps
      await powerSync.writeTransaction(async (tx) => {
        // Get current photos data
        const dbResult = await tx.getAll<{ photos: string }>(
          `SELECT photos FROM schedules WHERE id = ?`,
          [schedule.id]
        );

        // Parse photos data using utility function
        const currentPhotos = parsePhotosData(dbResult?.[0]?.photos);

        // Create pending operation for the signature
        const pendingOp = createPendingOp('add', signatureData, schedule.id);

        // Update photos object with pendingOp
        const updatedPhotos = {
          ...currentPhotos,
          pendingOps: [...currentPhotos.pendingOps, pendingOp],
        };

        // Update database without using metadata
        await tx.execute(
          `UPDATE schedules SET 
            signature = ?,
            photos = ?
          WHERE id = ?`,
          [
            JSON.stringify(signatureData),
            JSON.stringify(updatedPhotos),
            schedule.id,
          ]
        );
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
