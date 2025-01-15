import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  SafeAreaView,
} from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import { SignatureType, InvoiceType } from '../../types';
import { formatDateReadable } from '../../utils/date';
import { createInvoicesApi } from '../../services/api';
import { useAuth } from '@clerk/clerk-expo';

interface SignatureCaptureProps {
  onSignatureCapture: (signature: SignatureType) => void;
  technicianId: string;
  invoice: InvoiceType;
  isLoading?: boolean;
  visible: boolean;
  onClose: () => void;
}

export function SignatureCapture({
  onSignatureCapture,
  technicianId,
  invoice,
  isLoading = false,
  visible,
  onClose,
}: SignatureCaptureProps) {
  const signatureRef = useRef<any>(null);
  const [signerName, setSignerName] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const { getToken } = useAuth();

  const handleSignature = async (signature: string) => {
    if (!signerName.trim()) {
      Alert.alert('Error', "Please enter the signer's name");
      return;
    }

    try {
      setUploadLoading(true);
      const token = await getToken();
      const api = createInvoicesApi(token);
      if (!api) throw new Error('Failed to create API client');

      const signatureData = await api.uploadSignature(
        signature,
        technicianId,
        signerName.trim(),
        invoice.jobTitle,
        invoice._id
      );

      onSignatureCapture(signatureData.data);
      onClose();
    } catch (error) {
      console.error('Signature upload error:', error);
      Alert.alert('Error', 'Failed to save signature. Please try again.');
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <Modal
      animationType='slide'
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView className='flex-1 bg-white dark:bg-gray-900'>
        <View className='flex-1 p-4 flex flex-col gap-4'>
          {/* Header */}
          <View className='flex-row justify-between items-center'>
            <Text className='text-xl font-bold text-gray-900 dark:text-white'>
              Customer Signature
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className='p-2 bg-gray-100 dark:bg-gray-700 rounded-full'
            >
              <Text className='text-gray-600 dark:text-gray-300 text-lg'>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          {/* Consent Statement */}
          <View className='bg-gray-100 dark:bg-gray-800 rounded-lg p-4'>
            <Text className='text-gray-900 dark:text-white font-medium mb-3'>
              Work Completion & Payment Authorization
            </Text>
            <View className='flex flex-col gap-2'>
              <Text className='text-gray-700 dark:text-gray-300'>
                By signing below, I confirm that:
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • All work has been completed to my satisfaction
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • I have reviewed and approve all charges
              </Text>
              <Text className='text-gray-700 dark:text-gray-300'>
                • I authorize payment for the services rendered
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

          {/* Signature Area */}
          <View className='flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'>
            <SignatureCanvas
              ref={signatureRef}
              onOK={handleSignature}
              onEmpty={() => console.log('Empty')}
              descriptionText=''
              clearText='Clear'
              confirmText='Save'
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
                }
              `}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
