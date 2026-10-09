import * as ImagePicker from 'expo-image-picker';
import { requestMediaPermission } from '@/utils/photos';
import { parseExifTakenAt, type ImportCandidate } from '@/utils/photoImport';
import { debugLogger } from '@/utils/DebugLogger';

export function pickerAssetToCandidate(asset: ImagePicker.ImagePickerAsset): ImportCandidate {
  return {
    id: asset.assetId ?? asset.uri,
    uri: asset.uri,
    assetId: asset.assetId ?? null,
    takenAt: parseExifTakenAt(asset.exif as Record<string, unknown> | null | undefined),
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize ?? null,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    source: 'picker'
  };
}

/** Opens the OS photo picker (multi-select, with EXIF). Returns null when cancelled. */
export async function pickWithSystemPicker(): Promise<ImportCandidate[] | null> {
  const hasPermission = await requestMediaPermission('gallery');
  if (!hasPermission) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 1,
    allowsEditing: false,
    exif: true,
    allowsMultipleSelection: true,
    orderedSelection: true
  });

  void debugLogger.info('PHOTO', 'Photo picker returned result', {
    canceled: result.canceled,
    assetCount: result.assets?.length ?? 0
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets.map(pickerAssetToCandidate);
}
