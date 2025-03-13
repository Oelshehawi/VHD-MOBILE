import { usePowerSync } from '@powersync/react-native';
import { PhotoType, PhotosData } from '@/types';

export async function updatePhotos(
  powerSync: ReturnType<typeof usePowerSync>,
  invoiceId: string,
  newPhotos: PhotosData & { pendingOps: any[] }
) {
  await powerSync.execute(`UPDATE invoices SET photos = ? WHERE id = ?`, [
    JSON.stringify(newPhotos),
    invoiceId,
  ]);
}

export async function getInvoicePhotos(
  powerSync: ReturnType<typeof usePowerSync>,
  invoiceId: string
) {
  const result = await powerSync.get<{ photos: string }>(
    'SELECT photos FROM invoices WHERE id = ?',
    [invoiceId]
  );

  if (!result?.photos) {
    return { photos: [], pendingOps: [] };
  }

  try {
    const parsedData = JSON.parse(result.photos);

    // Support for legacy data structure (before/after arrays)
    if (parsedData.before || parsedData.after) {
      const beforePhotos = Array.isArray(parsedData.before)
        ? parsedData.before
        : [];
      const afterPhotos = Array.isArray(parsedData.after)
        ? parsedData.after
        : [];

      // Ensure type field is set on all photos
      const typedBeforePhotos = beforePhotos.map((photo: any) => ({
        ...photo,
        type: photo.type || 'before',
      }));

      const typedAfterPhotos = afterPhotos.map((photo: any) => ({
        ...photo,
        type: photo.type || 'after',
      }));

      return {
        photos: [...typedBeforePhotos, ...typedAfterPhotos],
        pendingOps: Array.isArray(parsedData.pendingOps)
          ? parsedData.pendingOps
          : [],
      };
    }

    // New structure with single photos array
    return {
      photos: Array.isArray(parsedData.photos) ? parsedData.photos : [],
      pendingOps: Array.isArray(parsedData.pendingOps)
        ? parsedData.pendingOps
        : [],
    };
  } catch (error) {
    console.error('Error parsing invoice photos:', error);
    return { photos: [], pendingOps: [] };
  }
}
