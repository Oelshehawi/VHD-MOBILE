import React, { useState } from 'react';
import { View, TouchableOpacity, Text, Alert } from 'react-native';
import { DebugPanel } from './DebugPanel';
import { debugLogger } from '@/utils/DebugLogger';

interface DebugButtonProps {
  // Position the button
  bottom?: number;
  right?: number;
  // Control visibility
  visible?: boolean;
}

export function DebugButton({ bottom = 100, right = 20, visible = true }: DebugButtonProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [taps, setTaps] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);

  if (!visible) return null;

  const handlePress = async () => {
    const now = Date.now();

    // Reset tap counter if more than 2 seconds have passed
    let newTapCount;
    if (now - lastTapTime > 2000) {
      newTapCount = 1;
      setTaps(1);
    } else {
      newTapCount = taps + 1;
      setTaps(newTapCount);
    }

    setLastTapTime(now);

    // Require 5 taps to open (prevent accidental opening)
    if (newTapCount >= 5) {
      setShowPanel(true);
      setTaps(0);

      // Log that debug panel was opened
      await debugLogger.info('DEBUG', 'Debug panel opened by user');
    } else {
      // Show hint after 2 taps
      if (newTapCount === 2) {
        Alert.alert('Debug Mode', `Tap ${5 - newTapCount} more times to open debug panel`, [
          { text: 'OK' }
        ]);
      }
    }
  };

  const getLogCount = async () => {
    try {
      const logs = await debugLogger.getRecentLogs(50);
      return logs.length;
    } catch {
      return 0;
    }
  };

  const [logCount, setLogCount] = useState(0);

  // Update log count periodically
  React.useEffect(() => {
    const updateCount = async () => {
      const count = await getLogCount();
      setLogCount(count);
    };

    updateCount();
    const interval = setInterval(updateCount, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <View
        style={{
          position: 'absolute',
          bottom,
          right,
          zIndex: 1000
        }}
      >
        <TouchableOpacity
          onPress={handlePress}
          className='bg-purple-600 rounded-full w-12 h-12 items-center justify-center shadow-lg'
          activeOpacity={0.7}
        >
          <Text className='text-white font-bold text-xs'>DBG</Text>
          {logCount > 0 && (
            <View className='absolute -top-1 -right-1 bg-red-500 rounded-full w-5 h-5 items-center justify-center'>
              <Text className='text-white text-xs font-bold'>
                {logCount > 99 ? '99+' : logCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <DebugPanel visible={showPanel} onClose={() => setShowPanel(false)} />
    </>
  );
}
