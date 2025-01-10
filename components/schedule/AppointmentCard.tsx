import React from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { format } from 'date-fns';

interface AppointmentCardProps {
  id: string;
  startTime: Date;
  endTime: Date;
  clientName: string;
  serviceType: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  onPress: (id: string) => void;
  style?: any;
}

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 dark:bg-blue-900',
  completed: 'bg-green-100 dark:bg-green-900',
  cancelled: 'bg-red-100 dark:bg-red-900',
};

const STATUS_TEXT_COLORS = {
  scheduled: 'text-blue-800 dark:text-blue-200',
  completed: 'text-green-800 dark:text-green-200',
  cancelled: 'text-red-800 dark:text-red-200',
};

export function AppointmentCard({
  id,
  startTime,
  endTime,
  clientName,
  serviceType,
  status,
  onPress,
  style,
}: AppointmentCardProps) {
  const scale = new Animated.Value(1);

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={() => onPress(id)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale }],
          },
        ]}
        className={`p-2 rounded-lg shadow-sm ${STATUS_COLORS[status]}`}
      >
        <View className='flex-row justify-between items-start mb-1'>
          <Text className='text-xs font-medium text-gray-600 dark:text-gray-300'>
            {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
          </Text>
          <View className={`px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
            <Text
              className={`text-xs font-medium capitalize ${STATUS_TEXT_COLORS[status]}`}
            >
              {status}
            </Text>
          </View>
        </View>

        <Text
          className='text-base font-semibold text-gray-900 dark:text-white mb-0.5'
          numberOfLines={1}
        >
          {clientName}
        </Text>

        <Text
          className='text-sm text-gray-600 dark:text-gray-300'
          numberOfLines={1}
        >
          {serviceType}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
