import React from 'react';
import { Modal, View, TouchableOpacity, Text } from 'react-native';
import { ThemeSelector } from './ThemeSelector';

interface ThemeSelectorModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * A modal that displays the theme selector
 */
export function ThemeSelectorModal({
  visible,
  onClose,
}: ThemeSelectorModalProps) {
  return (
    <Modal
      animationType='fade'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className='flex-1 justify-center items-center bg-black/50'>
        <View className='w-[90%] max-w-md'>
          <View className='bg-white dark:bg-gray-800 rounded-xl overflow-hidden'>
            <View className='flex-row justify-between items-center border-b border-gray-200 dark:border-gray-700 p-4'>
              <Text className='text-xl font-bold text-gray-900 dark:text-white'>
                Appearance
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
            <ThemeSelector onClose={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
