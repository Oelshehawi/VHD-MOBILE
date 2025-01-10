import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { toLocalTime } from '../../utils/date';

const SIDEBAR_WIDTH = Dimensions.get('window').width * 0.7;

interface CalendarLayoutProps {
  children: React.ReactNode;
  currentView: 'month' | 'week' | 'day';
  onViewChange: (view: 'month' | 'week' | 'day') => void;
}

export function CalendarLayout({
  children,
  currentView,
  onViewChange,
}: CalendarLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

  const toggleSidebar = () => {
    const toValue = sidebarOpen ? -SIDEBAR_WIDTH : 0;
    Animated.spring(slideAnim, {
      toValue,
      useNativeDriver: true,
    }).start();
    setSidebarOpen(!sidebarOpen);
  };

  const ViewOption = ({
    view,
    label,
  }: {
    view: 'month' | 'week' | 'day';
    label: string;
  }) => (
    <TouchableOpacity
      onPress={() => {
        onViewChange(view);
        toggleSidebar();
      }}
      className={`p-4 border-l-4 ${
        currentView === view
          ? 'border-l-darkGreen bg-gray-100 dark:bg-gray-800'
          : 'border-l-transparent'
      }`}
    >
      <Text
        className={`text-lg ${
          currentView === view
            ? 'text-darkGreen font-semibold'
            : 'text-gray-700 dark:text-gray-300'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View className='flex-1'>
      {/* Header */}
      <View className='flex-row items-center px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800'>
        <TouchableOpacity onPress={toggleSidebar} className='p-2'>
          <FontAwesome
            name='bars'
            size={24}
            color={currentView === 'month' ? '#0f766e' : '#374151'}
          />
        </TouchableOpacity>
        <Text className='ml-4 text-xl font-semibold text-gray-900 dark:text-white'>
          Calendar
        </Text>
      </View>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <TouchableOpacity
          className='absolute inset-0 bg-black/50 z-10'
          onPress={toggleSidebar}
          activeOpacity={1}
        />
      )}

      {/* Sidebar */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <View className='flex-1 bg-white dark:bg-gray-900'>
          <View className='py-4 px-4 border-b border-gray-200 dark:border-gray-800'>
            <Text className='text-xl font-bold text-gray-900 dark:text-white'>
              Calendar View
            </Text>
          </View>
          <ViewOption view='month' label='Month' />
          <ViewOption view='week' label='Week' />
          <ViewOption view='day' label='Day' />
        </View>
      </Animated.View>

      {/* Main Content */}
      <View className='flex-1'>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});
