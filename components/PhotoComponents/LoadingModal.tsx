import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';

/**
 * LoadingModal component to display processing state without nesting modals.
 */
interface LoadingModalProps {
  visible: boolean;
  type: 'before' | 'after';
}

export function LoadingModal({ visible, type }: LoadingModalProps) {
  if (!visible) return null;

  return (
    <View pointerEvents='auto' style={styles.overlay}>
      <View style={styles.content}>
        <ActivityIndicator
          size='large'
          color={type === 'before' ? '#3b82f6' : '#10b981'}
        />
        <Text className='text-base font-semibold mt-3 mb-1'>Processing...</Text>
        <Text className='text-sm text-gray-500 text-center'>
          Please wait while we process your photos.
        </Text>
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
    zIndex: 10,
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
    elevation: 10,
  },
});
