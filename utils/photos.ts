import * as ImagePicker from 'expo-image-picker';
import { Platform, Alert, ToastAndroid } from 'react-native';

/**
 * Photo type interface used throughout the application
 */
export interface PhotoType {
  _id: string;
  id: string;
  url: string;
  type: 'before' | 'after' | 'signature';
  timestamp: string;
  status?: 'pending' | 'uploaded' | 'failed';
  technicianId: string;
  filename?: string; // Optional filename field
  attachmentId?: string; // ID of the attachment in the ATTACHMENT_TABLE
}

export interface SignatureType {
  id: string;
  url: string;
  timestamp: string;
  signerName: string;
  technicianId: string;
}

export interface PhotosData {
  photos: PhotoType[];
}

/**
 * Shows a toast message across platforms
 * @param message The message to display
 */
export const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // For iOS, use Alert
    Alert.alert('Success', message);
  }
};

/**
 * Requests camera or media library permissions
 * @param type Type of permission to request
 * @returns Whether permission was granted
 */
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

/**
 * Parse photos JSON from the database
 */
export const parsePhotosData = (data?: any): PhotosData => {
  if (!data) {
    return { photos: [] };
  }

  try {
    const photosString = data?.photos;

    if (!photosString) {
      return { photos: [] };
    }

    // Parse the photos string into an array of photo objects
    const photoArray =
      typeof photosString === 'string'
        ? JSON.parse(photosString)
        : photosString;

    // Ensure photoArray is an array, otherwise return empty arrays
    const photos = Array.isArray(photoArray) ? photoArray : [];

    return {
      photos,
    };
  } catch (error) {
    console.error('Error parsing photos data:', error);
    return { photos: [] };
  }
};

/**
 * Record a photo deletion operation in the insert-only table
 * @param tx PowerSync transaction
 * @param scheduleId Schedule ID
 * @param photoId Photo ID
 * @param technicianId Technician ID
 * @param photoType Type of photo (before/after)
 */
export const recordPhotoDeleteOperation = async (
  tx: any,
  scheduleId: string,
  photoId: string,
  technicianId: string,
  photoType: 'before' | 'after' | 'signature'
) => {
  await tx.execute(
    `INSERT INTO delete_photo_operations 
    (id, scheduleId, photoId, timestamp, technicianId, type) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    [
      `del_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      scheduleId,
      photoId,
      new Date().toISOString(),
      technicianId,
      photoType,
    ]
  );
};
