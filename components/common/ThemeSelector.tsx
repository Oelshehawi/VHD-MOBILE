import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme as _useColorScheme } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';

type ColorSchemeType = 'light' | 'dark' | 'system';

interface ThemeSelectorProps {
  onClose?: () => void;
}

/**
 * A component that allows users to select their preferred theme
 */
export function ThemeSelector({ onClose }: ThemeSelectorProps) {
  const systemTheme = _useColorScheme();
  const { colorScheme, setColorScheme, theme } = useTheme();

  // Select theme function
  const selectTheme = async (newTheme: ColorSchemeType) => {
    try {
      setColorScheme(newTheme);
      if (onClose) {
        setTimeout(onClose, 500); // Close after a short delay to show selection
      }
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  return (
    <View className='p-4 bg-white dark:bg-gray-800 rounded-lg'>
      <Text className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>Select Theme</Text>

      <TouchableOpacity
        className={`flex-row items-center p-3 rounded-lg mb-2 ${
          theme === 'light' ? 'bg-blue-50 dark:bg-blue-900/20' : ''
        }`}
        onPress={() => selectTheme('light')}
      >
        <View className='bg-gray-100 dark:bg-gray-700 p-2 rounded-full mr-3'>
          <Ionicons name='sunny' size={22} color='#FFB700' />
        </View>
        <View>
          <Text className='font-medium text-gray-900 dark:text-white'>Light Mode</Text>
          <Text className='text-sm text-gray-500 dark:text-gray-400'>Light appearance</Text>
        </View>
        {theme === 'light' && (
          <View className='ml-auto'>
            <Ionicons name='checkmark-circle' size={24} color='#10B981' />
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        className={`flex-row items-center p-3 rounded-lg mb-2 ${
          theme === 'dark' ? 'bg-blue-50 dark:bg-blue-900/20' : ''
        }`}
        onPress={() => selectTheme('dark')}
      >
        <View className='bg-gray-100 dark:bg-gray-700 p-2 rounded-full mr-3'>
          <Ionicons name='moon' size={22} color='#6366F1' />
        </View>
        <View>
          <Text className='font-medium text-gray-900 dark:text-white'>Dark Mode</Text>
          <Text className='text-sm text-gray-500 dark:text-gray-400'>Dark appearance</Text>
        </View>
        {theme === 'dark' && (
          <View className='ml-auto'>
            <Ionicons name='checkmark-circle' size={24} color='#10B981' />
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        className={`flex-row items-center p-3 rounded-lg ${
          theme === 'system' ? 'bg-blue-50 dark:bg-blue-900/20' : ''
        }`}
        onPress={() => selectTheme('system')}
      >
        <View className='bg-gray-100 dark:bg-gray-700 p-2 rounded-full mr-3'>
          <Ionicons name='settings' size={22} color='#8B5CF6' />
        </View>
        <View>
          <Text className='font-medium text-gray-900 dark:text-white'>System Default</Text>
          <Text className='text-sm text-gray-500 dark:text-gray-400'>
            Current system theme: {systemTheme || 'light'}
          </Text>
        </View>
        {theme === 'system' && (
          <View className='ml-auto'>
            <Ionicons name='checkmark-circle' size={24} color='#10B981' />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
