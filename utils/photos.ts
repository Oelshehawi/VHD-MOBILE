import type { PhotoCategoryKind } from '@/types';
import * as ImagePicker from 'expo-image-picker';
import { Platform, Alert, ToastAndroid } from 'react-native';
import { toastBus, type ToastTone } from '@/utils/toastBus';

export interface PhotoType {
  id: string;
  scheduleId: string;
  cloudinaryUrl: string | null;
  type: 'before' | 'after' | 'signature' | 'estimate';
  timestamp: string;
  technicianId: string;
  signerName?: string | null;
  photoCategoryKey?: string | null;
  photoCategoryLabel?: string | null;
  photoCategoryKind?: PhotoCategoryKind | null;
  local_uri?: string | null;
  filename?: string | null;
  failedAt?: number | null;
  lastError?: string | null;
  errorCategory?: string | null;
}

export const showToast = (message: string, options?: { tone?: ToastTone }) => {
  if (toastBus.hasViewport()) {
    toastBus.show(message, options);
    return;
  }

  // Before any viewport mounts, fall back to the platform toast; never block with an Alert.
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
};

export const requestMediaPermission = async (type: 'camera' | 'gallery'): Promise<boolean> => {
  // The iOS system photo picker (with editing disabled) grants access to selected photos itself.
  if (Platform.OS === 'ios' && type === 'gallery') return true;

  if (Platform.OS !== 'web') {
    const permissionResult =
      type === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.status !== 'granted') {
      Alert.alert(
        'Permission Required',
        `${type === 'camera' ? 'Camera' : 'Gallery'} access is needed to take photos.`
      );
      return false;
    }
    return true;
  }
  return true;
};
