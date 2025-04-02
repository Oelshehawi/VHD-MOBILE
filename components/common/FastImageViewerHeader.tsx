import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FastImageViewerHeaderProps {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  rightAction?: React.ReactNode;
}

/**
 * A reusable header component for the FastImageViewer
 * Provides a clean title, subtitle, and close button layout
 */
export const FastImageViewerHeader: React.FC<FastImageViewerHeaderProps> = ({
  title,
  subtitle,
  onClose,
  rightAction,
}) => {
  return (
    <SafeAreaView style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.titleContainer}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        <View style={styles.actionsContainer}>
          {rightAction}

          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
          >
            <Ionicons name='close' size={24} color='white' />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingBottom: 12,
    paddingHorizontal: 16,
    // Using platform-specific padding to account for notches and status bars on different devices
    paddingTop: Platform.OS === 'ios' ? 0 : 12, // SafeAreaView handles top padding on iOS
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    paddingRight: 16,
  },
  title: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  subtitle: {
    color: '#e5e7eb',
    fontSize: 14,
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    marginLeft: 8,
  },
});
