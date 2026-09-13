import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';

/**
 * Size-stable stand-in for content whose first local PowerSync read hasn't
 * landed yet. Rendering a real empty state ("No jobs today") while `isLoading`
 * is still true tells the user something false and then shifts the layout when
 * the data arrives — these blocks occupy the same space instead.
 */
type LoadingPlaceholderProps = {
  /** Number of stacked blocks. */
  rows?: number;
  /** Height of each block, in points. Match the real row it stands in for. */
  rowHeight?: number;
  /** Vertical gap between blocks, in points. */
  gap?: number;
  className?: string;
  style?: ViewStyle;
};

export function LoadingPlaceholder({
  rows = 1,
  rowHeight = 84,
  gap = 12,
  className,
  style
}: LoadingPlaceholderProps) {
  const pulse = useSharedValue(0.45);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.85, { duration: 750, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View accessibilityLabel='Loading' className={className} style={[{ gap }, style]}>
      {Array.from({ length: rows }).map((_, index) => (
        <Animated.View
          key={index}
          style={[{ height: rowHeight }, animatedStyle]}
          className='rounded-2xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/10'
        />
      ))}
    </View>
  );
}
