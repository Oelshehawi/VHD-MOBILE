import { File, Paths } from 'expo-file-system';
import { buildCloudinaryUrlMobile } from '@/utils/cloudinaryUrl.native';
import { AppConfig } from '@/services/database/AppConfig';
import type { PhotoType } from '@/utils/photos';

const CLOUD_NAME = AppConfig.cloudinaryCloudName || '';

interface LocalUriResolver {
  getLocalUri(path: string): string;
}

type ResolvablePhoto = Pick<PhotoType, 'cloudinaryUrl' | 'local_uri' | 'filename'>;

/**
 * Display URI for a photo row: the local attachment file until Cloudinary has
 * it, then the Cloudinary URL (width-bounded when `width` is given).
 */
export function resolvePhotoUri(
  photo: ResolvablePhoto,
  queue: LocalUriResolver | null | undefined,
  options: { width?: number } = {}
): string {
  if (!photo.cloudinaryUrl) {
    if (!queue) return '';
    if (photo.local_uri) return queue.getLocalUri(photo.local_uri);
    if (photo.filename) return new File(Paths.document, 'attachments', photo.filename).uri;
    return '';
  }

  if (options.width) {
    return buildCloudinaryUrlMobile({
      urlOrPublicId: photo.cloudinaryUrl,
      cloudName: CLOUD_NAME,
      width: options.width
    });
  }

  return photo.cloudinaryUrl;
}
