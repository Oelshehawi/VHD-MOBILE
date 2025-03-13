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
  type: 'before' | 'after';
  status?: 'pending' | 'uploaded' | 'failed';
  _id?: string | { $oid: string };
  processed?: boolean;
  attachmentId?: string;
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

export interface SignatureType {
  id: string;
  url: string;
  timestamp: string;
  signerName: string;
  technicianId: string;
}

export interface PhotosData {
  photos: PhotoType[];
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
): PhotoType | SignatureType => {
  const photoId = randomUUID();

  // If it's a signature type, return a SignatureType object
  if (type === 'signature' && signerName) {
    return {
      id: photoId,
      url: `data:image/jpeg;base64,${base64Data}`,
      timestamp: new Date().toISOString(),
      technicianId,
      signerName,
    };
  }

  // Otherwise, return a PhotoType object
  return {
    id: photoId,
    url: `data:image/jpeg;base64,${base64Data}`,
    timestamp: new Date().toISOString(),
    technicianId,
    type: type as 'before' | 'after', // Cast to before/after only
    status: 'pending',
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
 * Parse photos JSON from the database
 */
export const parsePhotosData = (data?: any): PhotosData => {
  if (!data) {
    return { photos: [], pendingOps: [] };
  }

  try {
    const photosString = data?.photos;

    if (!photosString) {
      return { photos: [], pendingOps: [] };
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
      pendingOps: [], // We're not dealing with pendingOps in this context
    };
  } catch (error) {
    console.error('Error parsing photos data:', error);
    return { photos: [], pendingOps: [] };
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
): PhotoType | SignatureType => {
  const photoId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // If it's a signature, return a SignatureType
  if (type === 'signature' && signerName) {
    return {
      id: photoId,
      url: base64Data.startsWith('data:')
        ? base64Data
        : `data:image/jpeg;base64,${base64Data}`,
      timestamp: new Date().toISOString(),
      technicianId,
      signerName,
    };
  }

  // Otherwise return a PhotoType
  return {
    id: photoId,
    url: base64Data.startsWith('data:')
      ? base64Data
      : `data:image/jpeg;base64,${base64Data}`,
    timestamp: new Date().toISOString(),
    technicianId,
    type: type as 'before' | 'after', // Cast to restrict to before/after only
    status: 'pending',
    processed: false,
  };
};

/**
 * Record a photo addition operation in the insert-only table
 * @param tx PowerSync transaction
 * @param scheduleId Schedule ID
 * @param photoId Photo ID
 * @param technicianId Technician ID
 * @param photoType Type of photo (before/after)
 * @param cloudinaryUrl The final URL returned from Cloudinary after upload
 * @param attachmentId Optional attachment ID
 */
export const recordPhotoAddOperation = async (
  tx: any,
  scheduleId: string,
  photoId: string,
  technicianId: string,
  photoType: 'before' | 'after' | 'signature',
  cloudinaryUrl: string,
  attachmentId?: string
) => {
  await tx.execute(
    `INSERT INTO add_photo_operations 
    (id, scheduleId, photoId, timestamp, technicianId, type, cloudinaryUrl, attachmentId) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `add_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      scheduleId,
      photoId,
      new Date().toISOString(),
      technicianId,
      photoType,
      cloudinaryUrl,
      attachmentId || null,
    ]
  );
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

/**
 * Helper function to create a unique operation ID
 * @param prefix Prefix for the ID
 * @returns A unique operation ID
 */
export const createOperationId = (prefix: string = 'op'): string => {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
};
