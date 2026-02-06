import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SignatureCanvas from 'react-native-signature-canvas';
import { showToast } from '@/utils/photos';
import { useSystem } from '@/services/database/System';

export interface SignatureSchedule {
  id: string;
  jobTitle: string;
  startDateTime: string;
}

interface SignatureCaptureProps {
  onSignatureCapture: () => void;
  technicianId: string;
  schedule: SignatureSchedule | null;
  visible: boolean;
  onClose: () => void;
}

export function SignatureCapture({
  onSignatureCapture,
  technicianId,
  schedule,
  visible,
  onClose
}: SignatureCaptureProps) {
  const signatureRef = useRef<any>(null);
  const [signerName, setSignerName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const system = useSystem();

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
      const queue = system.attachmentQueue;

      await queue.queuePhotos([
        {
          sourceUri: signature,
          scheduleId: schedule.id,
          type: 'signature',
          technicianId: technicianId,
          signerName: signerName.trim(),
          jobTitle: schedule.jobTitle,
          startDate: schedule.startDateTime
        }
      ]);

      showToast('Signature saved and will sync when online');
      onSignatureCapture();
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to save signature. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal animationType='slide' transparent={false} visible={visible} onRequestClose={onClose}>
      <SafeAreaView className='flex-1 bg-white dark:bg-gray-900'>
        <View className='flex-1 p-4 flex flex-col gap-4'>
          <View className='flex-row justify-between items-center'>
            <View className='flex-row items-center gap-2'>
              <Text className='text-xl font-bold text-gray-900 dark:text-white'>
                Electronic Signature Agreement
              </Text>
              {isSaving && (
                <View className='h-5 w-5 rounded-full border-2 border-t-darkGreen animate-spin' />
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSaving}
              className='p-2 bg-gray-100 dark:bg-gray-700 rounded-full'
            >
              <Text className='text-gray-600 dark:text-gray-300 text-lg'>✕</Text>
            </TouchableOpacity>
          </View>

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
                • Understand this is a legally binding electronic signature under the Electronic
                Transactions Act of British Columbia
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • Agree this signature carries the same weight and legal effect as a handwritten
                signature
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • Consent to using electronic signatures for this transaction
              </Text>
            </View>
          </View>

          <TextInput
            className='px-4 py-3 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg'
            placeholder='Signer Name'
            placeholderTextColor='#9ca3af'
            value={signerName}
            onChangeText={setSignerName}
          />

          <View className='flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden'>
            <SignatureCanvas
              ref={signatureRef}
              onOK={handleSignature}
              descriptionText='Sign above'
              clearText='Clear'
              confirmText='Save'
              webStyle={`
                .m-signature-pad { box-shadow: none; border: none; }
                .m-signature-pad--body { border: none; }
                .m-signature-pad--footer { display: flex; }
                .m-signature-pad--footer .button { background: #f3f4f6; color: #111827; }
                .m-signature-pad--footer .button.save { background: #10B981; color: white; }
                .m-signature-pad--footer .button:disabled { background: #e5e7eb; color: #9ca3af; }
              `}
            />
          </View>

          <TouchableOpacity
            className={`py-4 rounded-lg items-center ${isSaving ? 'bg-gray-400' : 'bg-green-600'}`}
            disabled={isSaving}
            onPress={() => signatureRef.current?.readSignature()}
          >
            <Text className='text-white font-semibold text-lg'>
              {isSaving ? 'Processing signature...' : 'Save Signature'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
