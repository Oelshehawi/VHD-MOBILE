import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTo12Hour } from '../../utils/availabilityValidation';
import { SafeAreaView } from 'react-native-safe-area-context';

interface TimePickerInputProps {
  value: string; // HH:mm format (24-hour storage)
  onChange: (time: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
}

/**
 * TimePickerInput Component
 * Allows users to select time in 12-hour format with AM/PM picker using Modal
 * Internally stores time in 24-hour HH:mm format
 */
export const TimePickerInput: React.FC<TimePickerInputProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select time',
  error,
}) => {
  const [showPicker, setShowPicker] = useState(false);

  // Parse 24-hour time to 12-hour + AM/PM
  const parseTime = (timeStr: string) => {
    const [hourStr, minStr] = timeStr.split(':');
    const hour24 = parseInt(hourStr);
    const minute = parseInt(minStr);

    const isPM = hour24 >= 12;
    let hour12 = hour24 % 12;
    if (hour12 === 0) hour12 = 12;

    return { hour12, minute, isPM };
  };

  // Convert 12-hour + AM/PM back to 24-hour format
  const convertTo24Hour = (hour12: number, minute: number, isPM: boolean): string => {
    let hour24 = hour12;
    if (hour12 === 12) {
      hour24 = isPM ? 12 : 0;
    } else if (isPM) {
      hour24 = hour12 + 12;
    }
    return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const initialTime = value || '09:00';
  const [hour12, setHour12] = useState(parseTime(initialTime).hour12);
  const [minute, setMinute] = useState(parseTime(initialTime).minute);
  const [isPM, setIsPM] = useState(parseTime(initialTime).isPM);

  const handleTimeSelect = () => {
    const timeStr = convertTo24Hour(hour12, minute, isPM);
    onChange(timeStr);
    setShowPicker(false);
  };

  const displayValue = value ? formatTo12Hour(value) : placeholder;

  return (
    <View className='mb-4'>
      {label && (
        <Text className='text-gray-700 dark:text-gray-300 font-semibold mb-2'>
          {label}
        </Text>
      )}

      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        className={`flex-row items-center justify-between bg-white dark:bg-gray-700 p-4 rounded-lg border ${
          error ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
        }`}
      >
        <Text
          className={`${
            value ? 'text-gray-900 dark:text-white' : 'text-gray-500'
          }`}
        >
          {displayValue}
        </Text>
        <Ionicons
          name='time-outline'
          size={20}
          color={error ? '#ef4444' : '#666'}
        />
      </TouchableOpacity>

      {error && <Text className='text-red-500 text-sm mt-2'>{error}</Text>}

      <Modal
        visible={showPicker}
        transparent
        animationType='slide'
        onRequestClose={() => setShowPicker(false)}
      >
        <SafeAreaView className='flex-1 bg-black/50 justify-end'>
          <View className='bg-white dark:bg-gray-800 rounded-t-xl p-6'>
            <View className='flex-row justify-between items-center mb-6'>
              <Text className='text-lg font-bold text-gray-900 dark:text-white'>
                Select Time
              </Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Ionicons name='close' size={24} color='#666' />
              </TouchableOpacity>
            </View>

            <View className='flex-row justify-center gap-4 mb-6'>
              {/* Hours (1-12) */}
              <View className='flex-col items-center flex-1'>
                <Text className='text-gray-500 dark:text-gray-400 text-sm mb-2 font-semibold'>
                  Hour
                </Text>
                <ScrollView
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: 200 }}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setHour12(h)}
                      className={`p-3 rounded ${
                        hour12 === h
                          ? 'bg-blue-500'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      <Text
                        className={`text-lg font-semibold text-center ${
                          hour12 === h
                            ? 'text-white'
                            : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {String(h).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Text className='text-2xl font-bold text-gray-900 dark:text-white'>
                :
              </Text>

              {/* Minutes */}
              <View className='flex-col items-center flex-1'>
                <Text className='text-gray-500 dark:text-gray-400 text-sm mb-2 font-semibold'>
                  Minute
                </Text>
                <ScrollView
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: 200 }}
                >
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setMinute(m)}
                      className={`p-3 rounded ${
                        minute === m
                          ? 'bg-blue-500'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      <Text
                        className={`text-lg font-semibold text-center ${
                          minute === m
                            ? 'text-white'
                            : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {String(m).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* AM/PM Toggle */}
              <View className='flex-col items-center gap-2'>
                <Text className='text-gray-500 dark:text-gray-400 text-sm font-semibold'>
                  Period
                </Text>
                <TouchableOpacity
                  onPress={() => setIsPM(false)}
                  className={`py-2 px-3 rounded ${
                    !isPM
                      ? 'bg-blue-500'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <Text
                    className={`font-semibold text-center ${
                      !isPM
                        ? 'text-white'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    AM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsPM(true)}
                  className={`py-2 px-3 rounded ${
                    isPM
                      ? 'bg-blue-500'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <Text
                    className={`font-semibold text-center ${
                      isPM
                        ? 'text-white'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className='flex-row gap-3'>
              <TouchableOpacity
                onPress={() => setShowPicker(false)}
                className='flex-1 bg-gray-300 dark:bg-gray-600 p-4 rounded-lg'
              >
                <Text className='text-center font-semibold text-gray-900 dark:text-white'>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleTimeSelect}
                className='flex-1 bg-blue-500 p-4 rounded-lg'
              >
                <Text className='text-center font-semibold text-white'>
                  Select
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};
