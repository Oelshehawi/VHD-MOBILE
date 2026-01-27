import * as ImagePicker from 'expo-image-picker';
import { Platform, Alert, ToastAndroid } from 'react-native';

export interface PhotoType {
  id: string;
  scheduleId: string;
  cloudinaryUrl: string | null;
  type: 'before' | 'after' | 'signature' | 'estimate';
  timestamp: string;
  technicianId: string;
  signerName?: string | null;
  local_uri?: string | null;
  filename?: string | null;
}

export const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('Success', message);
  }
};

export const requestMediaPermission = async (
  type: 'camera' | 'gallery'
): Promise<boolean> => {
  if (Platform.OS !== 'web') {
    const permissionResult =
      type === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.status !== 'granted') {
      Alert.alert(
        'Permission Required',
        `${
          type === 'camera' ? 'Camera' : 'Gallery'
        } access is needed to take photos.`
      );
      return false;
    }
    return true;
  }
  return true;
};
