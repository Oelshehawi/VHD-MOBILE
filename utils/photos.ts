import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform, Alert, ToastAndroid } from 'react-native';
import { randomUUID } from 'expo-crypto';

/**
 * Photo type interface used throughout the application
 */
export interface PhotoType {
  id: string;
  url: string;
  timestamp: string;
  technicianId: string;
  type: 'before' | 'after' | 'signature';
  status?: 'pending' | 'uploaded' | 'failed';
  signerName?: string;
  _id?: string | { $oid: string }; // Support for MongoDB ObjectId format
  processed?: boolean; // Add this to track if a photo has been processed for upload
}

export interface PendingOp {
  type: 'add' | 'delete';
  photoId: string;
  photoType: 'before' | 'after' | 'signature';
  technicianId: string;
  timestamp: string;
  url?: string;
  scheduleId?: string;
  signerName?: string;
}

export interface PhotosData {
  before: PhotoType[];
  after: PhotoType[];
  pendingOps: PendingOp[];
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
 * Compresses an image and returns its base64 data
 * @param uri URI of the image to compress
 * @returns Base64 string of the compressed image
 */
export const compressImage = async (uri: string): Promise<string> => {
  try {
    // Single point of compression with better quality settings
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 2048 } }], // Keep 2K resolution for good detail
      {
        compress: 0.9, // Increase quality to 90% (less compression)
        format: SaveFormat.JPEG,
        base64: true,
      }
    );

    return result.base64 || '';
  } catch (error) {
    console.error('Error compressing image:', error);

    // Fallback to FileSystem if compression fails
    try {
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (fallbackError) {
      console.error('Fallback to FileSystem failed:', fallbackError);
      throw new Error('Failed to process image');
    }
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
 * Creates a new photo object with the given parameters
 * @param base64Data Base64 data of the image
 * @param technicianId ID of the technician
 * @param type Type of photo (before/after/signature)
 * @param signerName Optional name of the signer (for signatures)
 * @returns PhotoType object with appropriate metadata
 */
export const createPhotoObject = (
  base64Data: string,
  technicianId: string,
  type: 'before' | 'after' | 'signature',
  signerName?: string
): PhotoType => {
  const photoId = randomUUID();

  return {
    id: photoId,
    url: `data:image/jpeg;base64,${base64Data}`,
    timestamp: new Date().toISOString(),
    technicianId,
    type,
    status: 'pending',
    ...(signerName && { signerName }),
  };
};

/**
 * Extracts base64 data from an ImagePicker result
 * @param result Result from ImagePicker
 * @returns Array of base64 strings
 */
export const extractBase64FromPickerResult = async (
  result: ImagePicker.ImagePickerResult
): Promise<string[]> => {
  if (result.canceled || !result.assets?.length) {
    return [];
  }

  console.log(`Processing ${result.assets.length} selected photos`);

  // Map to store unique URIs to avoid duplicates
  const uniqueUris = new Map<string, string>();

  // Log each asset in the result for debugging
  result.assets.forEach((asset, index) => {
    // Use only the last part of the URI to avoid logging long paths
    const uriPart = asset.uri.split('/').pop() || '';
    console.log(
      `Asset ${index + 1}: URI=${uriPart}, width=${asset.width}, height=${
        asset.height
      }`
    );

    // Add to unique URIs map using URI as key
    uniqueUris.set(asset.uri, asset.uri);
  });

  // Create array from unique URIs
  const uniqueAssets = Array.from(uniqueUris.values())
    .map((uri) => {
      return result.assets.find((asset) => asset.uri === uri);
    })
    .filter(Boolean) as ImagePicker.ImagePickerAsset[];

  console.log(
    `Processing ${uniqueAssets.length} unique photos (removed ${
      result.assets.length - uniqueAssets.length
    } duplicates)`
  );

  const base64Promises = uniqueAssets.map(async (asset, index) => {
    try {
      console.log(`Processing asset ${index + 1}/${uniqueAssets.length}`);

      if (asset.base64) {
        console.log(`Asset ${index + 1} already has base64 data`);
        return asset.base64;
      }

      // If base64 is not already available, compress and extract it
      console.log(`Compressing asset ${index + 1}`);
      return await compressImage(asset.uri);
    } catch (error) {
      console.error(`Error processing asset ${index + 1}:`, error);
      throw error;
    }
  });

  return Promise.all(base64Promises);
};

/**
 * Create a new pending operation for photo uploads or deletions
 */
export const createPendingOp = (
  type: 'add' | 'delete',
  photo: PhotoType | Partial<PhotoType>,
  scheduleId?: string,
  forcedPhotoType?: 'before' | 'after' | 'signature'
): PendingOp => {
  // Generate a photoId if one doesn't exist
  const photoId =
    photo.id ||
    `generated_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Use forced photoType or photo.type, or default to 'before'
  const photoType = forcedPhotoType || photo.type || 'before';

  // Create the base pending operation
  const pendingOp: PendingOp = {
    type,
    photoId,
    photoType,
    technicianId: photo.technicianId || '',
    timestamp: new Date().toISOString(),
    url: photo.url,
    scheduleId,
  };

  // For signature type, include the signerName if available
  if (photoType === 'signature' && photo.signerName) {
    (pendingOp as any).signerName = photo.signerName;
  }

  return pendingOp;
};

/**
 * Parse photos JSON from the database
 */
export const parsePhotosData = (photosJson?: string): PhotosData => {
  if (!photosJson) {
    return { before: [], after: [], pendingOps: [] };
  }

  try {
    const parsedData = JSON.parse(photosJson);

    // Ensure all required arrays exist
    return {
      before: Array.isArray(parsedData.before) ? parsedData.before : [],
      after: Array.isArray(parsedData.after) ? parsedData.after : [],
      pendingOps: Array.isArray(parsedData.pendingOps)
        ? parsedData.pendingOps
        : [],
    };
  } catch (error) {
    return { before: [], after: [], pendingOps: [] };
  }
};

/**
 * Find a photo by id, _id, or url in a collection
 */
export const findPhotoInCollection = (
  collection: PhotoType[],
  photoToFind: { id: string; url: string }
): PhotoType | null => {
  if (!collection || !Array.isArray(collection)) {
    return null;
  }

  // First try to find by exact ID match
  for (const photo of collection) {
    // Check direct id match
    if (photo.id === photoToFind.id) {
      return photo;
    }

    // Check _id match (handling MongoDB ObjectId format)
    if (photo._id) {
      // Handle case where _id is an object with $oid property (MongoDB format)
      const photoId =
        typeof photo._id === 'object' && photo._id.$oid
          ? photo._id.$oid
          : typeof photo._id === 'string'
          ? photo._id
          : null;

      if (photoId && photoId === photoToFind.id) {
        return photo;
      }
    }
  }

  // If not found by ID, try URL match as fallback
  if (photoToFind.url) {
    const matchByUrl = collection.find((p) => p.url === photoToFind.url);
    if (matchByUrl) {
      return matchByUrl;
    }
  }

  // If still not found, try to extract ID from URL for both the photo to find and collection photos
  if (photoToFind.url) {
    const urlIdToFind = extractIdFromUrl(photoToFind.url);
    if (urlIdToFind) {
      for (const photo of collection) {
        if (photo.url) {
          const photoUrlId = extractIdFromUrl(photo.url);
          if (photoUrlId && photoUrlId === urlIdToFind) {
            return photo;
          }
        }
      }
    }
  }

  return null;
};

/**
 * Extract an ID from a URL (typically for Cloudinary URLs)
 */
export const extractIdFromUrl = (url: string): string | null => {
  if (!url) return null;

  try {
    // For Cloudinary URLs, the format is typically:
    // https://res.cloudinary.com/[cloud_name]/image/upload/v[version]/[public_id].[extension]
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];

    // Extract the ID part before the extension
    if (lastPart.includes('.')) {
      return lastPart.split('.')[0];
    }

    return lastPart;
  } catch (error) {
    return null;
  }
};

/**
 * Create a new optimistic photo object for immediate UI updates
 */
export const createOptimisticPhoto = (
  base64Data: string,
  technicianId: string,
  type: 'before' | 'after' | 'signature',
  signerName?: string
): PhotoType => {
  const photoId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return {
    id: photoId,
    url: base64Data.startsWith('data:')
      ? base64Data
      : `data:image/jpeg;base64,${base64Data}`,
    timestamp: new Date().toISOString(),
    technicianId,
    type,
    status: 'pending',
    signerName,
    processed: false,
  };
};
