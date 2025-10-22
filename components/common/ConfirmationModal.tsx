import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';

export interface ConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  showCancelButton?: boolean;
}

/**
 * A reusable confirmation modal component that can be used throughout the app
 * @param visible - Whether the modal is visible
 * @param onClose - Function to call when the modal is closed
 * @param onConfirm - Function to call when the confirm button is pressed
 * @param title - The title of the modal
 * @param message - The message to display in the modal
 * @param confirmText - Text for the confirm button (defaults to "Confirm")
 * @param cancelText - Text for the cancel button (defaults to "Cancel")
 * @param isLoading - Whether the modal is in a loading state
 * @param showCancelButton - Whether to show the cancel button (defaults to true)
 */
export function ConfirmationModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  showCancelButton = true,
}: ConfirmationModalProps) {
  return (
    <Modal
      animationType='fade'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className='flex-1 justify-center items-center bg-black/50'>
        <View className='bg-white dark:bg-gray-800 rounded-xl w-[90%] max-w-md p-5'>
          <Text className='text-xl font-bold text-gray-900 dark:text-white mb-2'>
            {title}
          </Text>
          <Text className='text-gray-700 dark:text-gray-300 mb-5'>
            {message}
          </Text>
          <View className='flex-row justify-end gap-3'>
            {showCancelButton && (
              <TouchableOpacity
                onPress={onClose}
                className='px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg'
                disabled={isLoading}
              >
                <Text className='text-gray-700 dark:text-gray-300 font-medium'>
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onConfirm}
              className='px-4 py-2 bg-[#22543D] rounded-lg'
              disabled={isLoading}
            >
              <Text className='text-white font-medium'>
                {isLoading ? 'Saving...' : confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
