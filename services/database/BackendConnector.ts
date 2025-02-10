import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
} from '@powersync/react-native';
import { AppConfig } from '../AppConfig';
import { ApiClient } from '../api';
import { getClerkInstance } from '@clerk/clerk-expo';
import { Platform, ToastAndroid, Alert } from 'react-native';

interface PhotoType {
  id?: string;
  _id?: string;
  url?: string;
  timestamp?: string;
  technicianId?: string;
  type?: 'before' | 'after' | 'signature';
  status?: string;
  signerName?: string;
}

interface PendingOp {
  type: 'add' | 'delete';
  photoId: string;
  photoType: 'before' | 'after' | 'signature';
  technicianId: string;
  timestamp: string;
  url?: string;
}

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
  // Track both uploads and deletes
  private processedOperations: Set<string> = new Set();

  // Helper to generate unique operation keys
  private getOperationKey(op: PendingOp, invoiceId: string): string {
    return `${invoiceId}-${op.photoId}-${op.type}-${op.photoType}`;
  }

  // Helper to check if operation was processed
  private isOperationProcessed(op: PendingOp, invoiceId: string): boolean {
    const key = this.getOperationKey(op, invoiceId);
    return this.processedOperations.has(key);
  }

  // Helper to mark operation as processed
  private markOperationProcessed(op: PendingOp, invoiceId: string): void {
    const key = this.getOperationKey(op, invoiceId);
    this.processedOperations.add(key);
    console.log('Marked operation as processed:', { key });
  }

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

      console.log('Processing batch operations:', {
        totalOperations: batch.crud.length,
        hasPhotoOperations: batch.crud.some(
          (op) => op.table === 'invoices' && op.opData?.photos
        ),
      });

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

            console.log('Processing photos operation:', {
              invoiceId: op.id,
              beforePhotos: photos.before?.length || 0,
              afterPhotos: photos.after?.length || 0,
              pendingOperations: photos.pendingOps?.length || 0,
            });

            // Process pending operations
            if (photos.pendingOps?.length > 0) {
              const newPendingOps: PendingOp[] = [];

              // Filter out already processed operations
              const unprocessedOps = photos.pendingOps.filter(
                (pendingOp: PendingOp) =>
                  !this.isOperationProcessed(pendingOp, op.id)
              );

              if (unprocessedOps.length === 0) {
                console.log(
                  'All operations already processed for invoice:',
                  op.id
                );
                continue;
              }

              // Group unprocessed operations by type
              const addOps = unprocessedOps.filter(
                (pendingOp: PendingOp) => pendingOp.type === 'add'
              );
              const deleteOps = unprocessedOps.filter(
                (pendingOp: PendingOp) => pendingOp.type === 'delete'
              );

              // Handle uploads
              if (addOps.length > 0) {
                // Handle signatures first
                const signatureOps = addOps.filter(
                  (op: PendingOp) => op.photoType === 'signature'
                );
                if (signatureOps.length > 0) {
                  const signatureData = photos.signature;
                  if (signatureData?.url?.startsWith('data:')) {
                    try {
                      await this.apiClient.uploadPhotos(
                        [signatureData.url],
                        'signature',
                        signatureOps[0].technicianId,
                        invoice.jobTitle,
                        op.id,
                        signatureData.signerName
                      );
                      // Mark signature as processed
                      signatureOps.forEach((pendingOp: PendingOp) => {
                        this.markOperationProcessed(pendingOp, op.id);
                      });
                    } catch (error) {
                      // Keep failed operations for retry
                      newPendingOps.push(...signatureOps);
                      throw error;
                    }
                  }
                }

                // Handle regular photos
                for (const photoType of ['before', 'after'] as const) {
                  const typeOps = addOps.filter(
                    (pendingOp: PendingOp) => pendingOp.photoType === photoType
                  );
                  if (typeOps.length > 0) {
                    const newImages = photos[photoType]
                      .filter(
                        (p: PhotoType) =>
                          p?.url?.startsWith('data:') &&
                          typeOps.some((op: PendingOp) => op.photoId === p.id)
                      )
                      .map((p: PhotoType) => p.url);

                    if (newImages.length > 0) {
                      try {
                        const response = await this.apiClient.uploadPhotos(
                          newImages,
                          photoType,
                          typeOps[0].technicianId,
                          invoice.jobTitle,
                          op.id
                        );

                        // Mark uploads as processed
                        typeOps.forEach((pendingOp: PendingOp) => {
                          this.markOperationProcessed(pendingOp, op.id);
                        });
                      } catch (error) {
                        // Keep failed operations for retry
                        newPendingOps.push(...typeOps);
                        throw error;
                      }
                    }
                  }
                }
              }

              // Handle deletes
              if (deleteOps.length > 0) {
                for (const deleteOp of deleteOps) {
                  if (deleteOp.url) {
                    try {
                      await this.apiClient.deletePhoto(
                        deleteOp.url,
                        deleteOp.photoType,
                        op.id
                      );

                      // Mark delete as processed
                      this.markOperationProcessed(deleteOp, op.id);
                    } catch (error) {
                      if (
                        error instanceof Error &&
                        !error.message.includes(
                          'Failed to delete from Cloudinary'
                        )
                      ) {
                        newPendingOps.push(deleteOp);
                      } else {
                        // If already deleted, mark as processed
                        this.markOperationProcessed(deleteOp, op.id);
                      }
                      throw error;
                    }
                  }
                }
              }

              // Update photos object with remaining pending operations
              if (newPendingOps.length !== photos.pendingOps.length) {
                const updatedPhotos = {
                  ...photos,
                  pendingOps: newPendingOps,
                };

                await database.execute(
                  `UPDATE invoices SET photos = ? WHERE id = ?`,
                  [JSON.stringify(updatedPhotos), op.id]
                );
              }
            }
          } catch (error) {
            console.error('Error processing photos:', error);
          }
        }
      }

      await batch.complete();
    } catch (error) {
      console.error('Error in uploadData:', error);
      await batch.complete();
    }
  }
}
