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
  return result?.photos
    ? JSON.parse(result.photos)
    : { before: [], after: [], pendingOps: [] };
}
