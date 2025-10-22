import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';

const MAX_DIMENSION = 2560;

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Resize image to 2560×2560 max, quality 1.0
 * Automatically converts HEIC → JPEG
 *
 * This reduces file sizes from MB to KB range while maintaining excellent quality,
 * matching Cloudinary's server-side transform (w_2560,h_2560,c_limit,q_auto:good,f_auto)
 *
 * @param sourceUri URI of the original image
 * @returns Prepared image with URI, dimensions, and size
 */
export async function prepareImageForUpload(sourceUri: string): Promise<PreparedImage> {
  // Get original dimensions
  const dimensions = await getImageDimensions(sourceUri);

  // Calculate resize to fit within MAX_DIMENSION (don't upscale)
  const scale = Math.min(
    MAX_DIMENSION / dimensions.width,
    MAX_DIMENSION / dimensions.height,
    1
  );

  const newWidth = Math.round(dimensions.width * scale);
  const newHeight = Math.round(dimensions.height * scale);

  // Resize (HEIC automatically converts to JPEG)
  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: newWidth, height: newHeight } }],
    {
      compress: 1.0,
      format: ImageManipulator.SaveFormat.JPEG
    }
  );

  // Get file size using new File API
  const file = new File(manipulated.uri);
  const size = file.size ?? 0;

  return {
    uri: manipulated.uri,
    width: manipulated.width,
    height: manipulated.height,
    size
  };
}

/**
 * Helper to get image dimensions without full manipulation
 */
async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  const result = await ImageManipulator.manipulateAsync(uri, [], {});
  return { width: result.width, height: result.height };
}
