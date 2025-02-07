import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
} from '@powersync/react-native';
import { AppConfig } from '../AppConfig';
import { ApiClient } from '../api';
import { getClerkInstance } from '@clerk/clerk-expo';
import { Platform, ToastAndroid, Alert } from 'react-native';

// Toast utility function
const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // For iOS, you might want to use a custom toast component
    // For now, we'll use Alert
    Alert.alert('Success', message);
  }
};

export class BackendConnector implements PowerSyncBackendConnector {
  private apiClient: ApiClient | null = null;

  async fetchCredentials() {
    try {
      const clerk = getClerkInstance({
        publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      });
      if (!clerk?.session) {
        console.log('No Clerk session found');
        return null;
      }

      const token = await clerk.session?.getToken({
        template: 'Powersync',
      });

      if (!token) {
        console.log('No token available');
        return null;
      }

      this.apiClient = new ApiClient(token);

      return {
        endpoint: AppConfig.powersyncUrl,
        token,
      };
    } catch (error) {
      console.error('Error fetching credentials:', error);
      return null;
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch();
    if (!batch) return;

    try {
      if (!this.apiClient) {
        throw new Error('API client not initialized');
      }

      console.log('Processing batch with operations:', batch.crud.length);

      for (const op of batch.crud) {
        if (op.table === 'invoices' && op.opData?.photos) {
          const invoice = await database.get<{ jobTitle: string }>(
            'SELECT jobTitle FROM invoices WHERE id = ?',
            [op.id]
          );

          if (!invoice?.jobTitle) {
            console.log('No job title found for invoice:', op.id);
            continue;
          }

          let photos;
          try {
            photos =
              typeof op.opData.photos === 'string'
                ? JSON.parse(op.opData.photos)
                : op.opData.photos;

            // Ensure photos object and its arrays exist
            if (!photos || typeof photos !== 'object') {
              photos = { before: [], after: [], pendingOps: [] };
            }

            // Initialize arrays if they don't exist
            photos.before = Array.isArray(photos.before) ? photos.before : [];
            photos.after = Array.isArray(photos.after) ? photos.after : [];
            photos.pendingOps = Array.isArray(photos.pendingOps)
              ? photos.pendingOps
              : [];

            console.log('Photos object after initialization:', {
              beforeLength: photos.before.length,
              afterLength: photos.after.length,
              pendingOpsLength: photos.pendingOps.length,
              pendingOps: photos.pendingOps,
            });
          } catch (e) {
            console.error('Invalid photos data:', op.opData.photos);
            photos = { before: [], after: [], pendingOps: [] };
          }

          const pendingOps = photos.pendingOps;

          try {
            // Handle before photos
            if (Array.isArray(photos.before)) {
              console.log('Processing before photos:', {
                count: photos.before.length,
                sample: photos.before[0],
                pendingOps: pendingOps.filter(
                  (op: { type: string }) => op.type === 'add'
                ),
              });

              const newImages = photos.before
                .filter((p: any) => p && p.url && p.url.startsWith('data:'))
                .map((p: any) => p.url);

              const existingPhotos = photos.before
                .filter((p: any) => p && p.url && !p.url.startsWith('data:'))
                .map((p: any) => ({ ...p, type: 'before' }));

              // Get technicianId from pending ops first, then fall back to photo
              const addOp = pendingOps.find((op: any) => op.type === 'add');
              const techId =
                addOp?.technicianId ||
                photos.before[0]?.technicianId ||
                'deleted';

              console.log('Uploading before photos:', {
                newImagesCount: newImages.length,
                existingPhotosCount: existingPhotos.length,
                techId,
              });

              if (newImages.length > 0 || existingPhotos.length > 0) {
                const response = await this.apiClient.updatePhotos(
                  existingPhotos,
                  'before',
                  techId,
                  invoice.jobTitle,
                  op.id,
                  undefined,
                  newImages
                );

                // Update local status for uploaded photos
                if (response?.data?.length) {
                  const uploadedUrls = new Set(
                    response.data.map((p: any) => p.url)
                  );
                  const updatedPhotos = photos.before.map((p: any) => {
                    if (uploadedUrls.has(p.url)) {
                      return { ...p, status: 'uploaded' };
                    }
                    return p;
                  });

                  await database.execute(
                    `UPDATE invoices 
                     SET photos = json_set(photos, '$.before', ?)
                     WHERE id = ?`,
                    [JSON.stringify(updatedPhotos), op.id]
                  );
                }
              }
            }

            // Handle after photos
            if (Array.isArray(photos.after)) {
              console.log('Processing after photos:', {
                count: photos.after.length,
                sample: photos.after[0],
                pendingOps: pendingOps.filter(
                  (op: { type: string }) => op.type === 'add'
                ),
              });

              const newImages = photos.after
                .filter((p: any) => p && p.url && p.url.startsWith('data:'))
                .map((p: any) => p.url);

              const existingPhotos = photos.after
                .filter((p: any) => p && p.url && !p.url.startsWith('data:'))
                .map((p: any) => ({ ...p, type: 'after' }));

              // Get technicianId from pending ops first, then fall back to photo
              const addOp = pendingOps.find((op: any) => op.type === 'add');
              const techId =
                addOp?.technicianId ||
                photos.after[0]?.technicianId ||
                'deleted';

              console.log('Uploading after photos:', {
                newImagesCount: newImages.length,
                existingPhotosCount: existingPhotos.length,
                techId,
              });

              if (newImages.length > 0 || existingPhotos.length > 0) {
                const response = await this.apiClient.updatePhotos(
                  existingPhotos,
                  'after',
                  techId,
                  invoice.jobTitle,
                  op.id,
                  undefined,
                  newImages
                );

                // Update local status for uploaded photos
                if (response?.data?.length) {
                  const uploadedUrls = new Set(
                    response.data.map((p: any) => p.url)
                  );
                  const updatedPhotos = photos.after.map((p: any) => {
                    if (uploadedUrls.has(p.url)) {
                      return { ...p, status: 'uploaded' };
                    }
                    return p;
                  });

                  await database.execute(
                    `UPDATE invoices 
                     SET photos = json_set(photos, '$.after', ?)
                     WHERE id = ?`,
                    [JSON.stringify(updatedPhotos), op.id]
                  );
                }
              }
            }

            // Handle signature if present
            if (photos.signature) {
              const isNewSignature = photos.signature.url.startsWith('data:');
              const newImages = isNewSignature ? [photos.signature.url] : [];
              const existingSignature = isNewSignature
                ? []
                : [{ ...photos.signature, type: 'signature' }];

              await this.apiClient.updatePhotos(
                existingSignature,
                'signature',
                photos.signature.technicianId,
                invoice.jobTitle,
                op.id,
                photos.signature.signerName,
                newImages
              );
            }

            // Also log the complete photos object for context
            console.log('Complete photos object:', {
              before: photos.before,
              after: photos.after,
              signature: photos.signature,
              pendingOps,
            });

            // Show toasts for completed operations
            for (const pendingOp of pendingOps) {
              if (pendingOp.type === 'add') {
                showToast('Photo uploaded successfully');
              } else if (pendingOp.type === 'delete') {
                showToast('Photo deleted successfully');
              }
            }

            // Clear pending operations
            if (pendingOps.length > 0) {
              await database.execute(
                `UPDATE invoices 
                 SET photos = json_set(photos, '$.pendingOps', json_array()) 
                 WHERE id = ?`,
                [op.id]
              );
            }
          } catch (error) {
            console.error('Error processing photos:', error);
          }
        }
      }

      // Complete the batch only once after all operations
      await batch.complete();
    } catch (error) {
      console.error('Error in uploadData:', error);
      await batch.complete();
    }
  }
}
