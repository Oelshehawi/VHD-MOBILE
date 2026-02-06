import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_DIMENSION = 2560;

export type PreparedImageFormat = 'jpeg' | 'png';

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
  size: number;
}

export interface PrepareImageOptions {
  format?: PreparedImageFormat;
  /**
   * Compression factor for JPEG output (0-1). Ignored for PNG.
   * Defaults to 1.0 when not provided.
   */
  compress?: number;
}

/**
 * Resize image to 2560×2560 max while preserving aspect ratio.
 * Converts source into the requested output format.
 */
export async function prepareImageForUpload(
  sourceUri: string,
  options: PrepareImageOptions = {}
): Promise<PreparedImage> {
  const targetFormat: PreparedImageFormat = options.format ?? 'jpeg';

  // Determine original dimensions without applying transformations.
  const dimensions = await getImageDimensions(sourceUri);

  // Calculate resize scale (never upscale).
  const scale = Math.min(MAX_DIMENSION / dimensions.width, MAX_DIMENSION / dimensions.height, 1);

  const newWidth = Math.round(dimensions.width * scale);
  const newHeight = Math.round(dimensions.height * scale);

  // Resize while preserving quality.
  const context = ImageManipulator.manipulate(sourceUri);
  if (newWidth !== dimensions.width || newHeight !== dimensions.height) {
    context.resize({ width: newWidth, height: newHeight });
  }

  const imageRef = await context.renderAsync();
  const manipulated = await imageRef.saveAsync({
    compress: targetFormat === 'jpeg' ? (options.compress ?? 1.0) : 1.0,
    format: targetFormat === 'png' ? SaveFormat.PNG : SaveFormat.JPEG
  });

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
 * Helper to read image dimensions without writing a new file.
 */
async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri);
  const imageRef = await context.renderAsync();
  return { width: imageRef.width, height: imageRef.height };
}
