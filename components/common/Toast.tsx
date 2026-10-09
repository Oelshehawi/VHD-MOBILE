import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { toastBus, type ToastTone } from '@/utils/toastBus';

interface ToastViewportProps {
  placement?: 'top' | 'bottom';
  /** Extra distance from the safe-area edge, e.g. to clear camera controls. */
  offset?: number;
}

const TONE_STYLES: Record<ToastTone, { container: string; icon: 'checkmark-circle' | 'alert-circle' | 'information-circle' }> = {
  success: { container: 'bg-gray-900 dark:bg-gray-800', icon: 'checkmark-circle' },
  error: { container: 'bg-red-600 dark:bg-red-700', icon: 'alert-circle' },
  info: { container: 'bg-gray-900 dark:bg-gray-800', icon: 'information-circle' }
};

/**
 * Renders toasts from `toastBus`. Mount one per native Modal layer: viewports
 * form a stack and only the most recently mounted one renders, because a toast
 * mounted at the root would sit behind full-screen Modals.
 */
export function ToastViewport({ placement = 'top', offset = 0 }: ToastViewportProps) {
  const insets = useSafeAreaInsets();
  const [viewportId, setViewportId] = useState<number | null>(null);
  const { toast, topViewportId } = useSyncExternalStore(toastBus.subscribe, toastBus.getState);

  useEffect(() => {
    const { id, unregister } = toastBus.registerViewport();
    setViewportId(id);
    return unregister;
  }, []);

  if (!toast || viewportId === null || topViewportId !== viewportId) {
    return null;
  }

  const tone = TONE_STYLES[toast.tone];
  const edgeStyle =
    placement === 'top'
      ? { top: Math.max(insets.top + 8, 48) + offset }
      : { bottom: insets.bottom + 16 + offset };

  return (
    <View pointerEvents='box-none' className='absolute left-4 right-4 z-50' style={edgeStyle}>
      <Animated.View key={toast.id} entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(150)}>
        <Pressable
          onPress={() => toastBus.dismiss(toast.id)}
          accessibilityRole='alert'
          className={`flex-row items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${tone.container}`}
        >
          <Ionicons name={tone.icon} size={20} color='#FFFFFF' />
          <Text className='flex-1 text-sm font-semibold text-white'>{toast.message}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
