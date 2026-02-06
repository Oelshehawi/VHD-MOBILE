/**
 * Cloudinary URL transformation helper for mobile
 * Ensures images are served at appropriate sizes to reduce bandwidth usage
 */

export interface CloudinaryTransformOptions {
  urlOrPublicId: string;
  cloudName: string;
  width: number; // Target width: 240, 480, 720, 1080, 1440
  quality?: string;
  format?: string;
  crop?: string;
}

/**
 * Builds an optimized Cloudinary URL for mobile with width-bounded transforms
 *
 * @param options Transform options
 * @returns Transformed Cloudinary URL
 *
 * @example
 * buildCloudinaryUrlMobile({
 *   urlOrPublicId: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
 *   cloudName: 'demo',
 *   width: 720
 * })
 * // Returns: 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_720/sample.jpg'
 */
export function buildCloudinaryUrlMobile({
  urlOrPublicId,
  cloudName,
  width,
  quality = 'q_auto',
  format = 'f_auto',
  crop = 'c_limit'
}: CloudinaryTransformOptions): string {
  // Skip transformation for non-Cloudinary URLs
  if (!urlOrPublicId || typeof urlOrPublicId !== 'string') {
    return urlOrPublicId || '';
  }

  // Skip transformation for local files, data URIs, etc.
  if (
    urlOrPublicId.startsWith('file:') ||
    urlOrPublicId.startsWith('data:') ||
    urlOrPublicId.startsWith('content:') ||
    urlOrPublicId.startsWith('blob:')
  ) {
    return urlOrPublicId;
  }

  // Only transform Cloudinary URLs
  if (!urlOrPublicId.includes('res.cloudinary.com')) {
    return urlOrPublicId;
  }

  // Build the transformation string
  const transform = `${format},${quality},${crop},w_${width}`;
  const uploadMarker = '/image/upload/';
  const idx = urlOrPublicId.indexOf(uploadMarker);

  if (idx !== -1) {
    const prefix = urlOrPublicId.slice(0, idx + uploadMarker.length);
    const suffix = urlOrPublicId.slice(idx + uploadMarker.length);
    const parts = suffix.split('/');

    // Check if first part already contains transformations
    // If so, replace them; otherwise, prepend our transformation
    if (parts[0] && (parts[0].includes(',') || /(?:^|,)w_|q_|f_|c_|g_|dpr_/.test(parts[0]))) {
      // Replace existing transformation
      parts[0] = transform;
      return `${prefix}${parts.join('/')}`;
    }

    // Prepend transformation
    return `${prefix}${transform}/${suffix}`;
  }

  // Fallback: construct URL from public ID
  const cleaned = urlOrPublicId.replace(/^\/+/, '');
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transform}/${cleaned}`;
}

/**
 * Pick appropriate width breakpoint for device
 *
 * @param deviceWidth Current device width in pixels
 * @returns Appropriate Cloudinary width breakpoint
 */
export function pickCloudinaryWidth(deviceWidth: number): number {
  if (deviceWidth <= 360) return 320;
  if (deviceWidth <= 540) return 480;
  if (deviceWidth <= 800) return 720;
  if (deviceWidth <= 1200) return 1080;
  return 1440;
}

/**
 * Generate stable cache key for transformed image
 *
 * @param originalUrl Original image URL
 * @param width Transform width applied
 * @returns Stable cache key string
 */
export function getCloudinaryCacheKey(originalUrl: string, width: number): string {
  return `${originalUrl}__w${width}`;
}
