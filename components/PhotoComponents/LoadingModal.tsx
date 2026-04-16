import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';

/**
 * LoadingModal component to display processing state without nesting modals.
 */
interface LoadingModalProps {
  visible: boolean;
  type: 'before' | 'after';
  title?: string;
  detail?: string;
  current?: number;
  total?: number;
}

export function LoadingModal({ visible, type, title, detail, current, total }: LoadingModalProps) {
  if (!visible) return null;

  const accentColor = type === 'before' ? '#3b82f6' : '#10b981';
  const showProgress = current !== undefined && total !== undefined && total > 0;
  const progress = showProgress ? Math.min(Math.max(current / total, 0), 1) : 0;

  return (
    <View pointerEvents='auto' style={styles.overlay}>
      <View style={styles.content}>
        <ActivityIndicator size='large' color={accentColor} />
        <Text className='text-base font-semibold mt-3 mb-1'>
          {title ?? 'Processing photos'}
        </Text>
        <Text className='text-sm text-gray-500 text-center'>
          {detail ?? 'Please wait while we prepare your photos.'}
        </Text>
        {showProgress && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: accentColor,
                    width: `${progress * 100}%`
                  }
                ]}
              />
            </View>
            <Text className='text-xs text-gray-400 mt-2'>
              {current} of {total}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 10
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 10
  },
  progressContainer: {
    width: '100%',
    marginTop: 16,
    alignItems: 'center'
  },
  progressTrack: {
    height: 6,
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999
  }
});
