import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
} from '@powersync/react-native';
import { ApiClient } from '../api';
import { getClerkInstance } from '@clerk/clerk-expo';
import { PhotoType, PendingOp, parsePhotosData } from '@/utils/photos';

export class BackendConnector implements PowerSyncBackendConnector {
  private apiClient: ApiClient | null = null;
  // Track processed operations by their unique keys
  private processedOperations: Set<string> = new Set();
  private endpoint: string = '';
  private retryCount: Map<string, number> = new Map();
  private MAX_RETRIES = 3;

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
  }

  // Helper to generate unique operation keys
  private getOperationKey(op: PendingOp, scheduleId: string): string {
    // Create a unique key that includes all relevant information
    const baseKey = `${scheduleId}-${op.photoId}-${op.type}-${op.photoType}`;

    // For deletes, also include the URL to ensure uniqueness
    if (op.type === 'delete' && op.url) {
      return `${baseKey}-${op.url.substring(op.url.lastIndexOf('/') + 1)}`;
    }

    return baseKey;
  }

  // Mark operation as processed to avoid duplicates
  private markOperationProcessed(op: PendingOp, scheduleId: string): void {
    const key = this.getOperationKey(op, scheduleId);
    this.processedOperations.add(key);
    this.retryCount.delete(key); // Clear retry count since it's now processed
  }

  // Check if an operation has already been processed
  private isOperationProcessed(op: PendingOp, scheduleId: string): boolean {
    const key = this.getOperationKey(op, scheduleId);
    const isProcessed = this.processedOperations.has(key);

    // If it's processed, return true
    if (isProcessed) {
      return true;
    }

    // Check if we've exceeded max retries
    const retries = this.retryCount.get(key) || 0;
    if (retries >= this.MAX_RETRIES) {
      this.processedOperations.add(key);
      return true;
    }

    return false;
  }

  // Increment retry count for an operation
  private incrementRetryCount(op: PendingOp, scheduleId: string): void {
    const key = this.getOperationKey(op, scheduleId);
    const currentCount = this.retryCount.get(key) || 0;
    this.retryCount.set(key, currentCount + 1);
  }

  // Clear processed operations periodically to avoid memory leaks
  private cleanupProcessedOperations(): void {
    // Keep only the last 1000 operations
    if (this.processedOperations.size > 1000) {
      const entries = Array.from(this.processedOperations);
      const newSet = new Set<string>();

      // Keep only the 500 most recent operations
      for (let i = entries.length - 500; i < entries.length; i++) {
        newSet.add(entries[i]);
      }

      this.processedOperations = newSet;
    }
  }

  async fetchCredentials() {
    try {
      const clerk = getClerkInstance({
        publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      });
      if (!clerk?.session) {
        return null;
      }

      const token = await clerk.session?.getToken({
        template: 'Powersync',
      });

      if (!token) {
        return null;
      }

      if (!this.endpoint) {
        return null;
      }

      this.apiClient = new ApiClient(token);

      return {
        endpoint: this.endpoint,
        token,
      };
    } catch (error) {
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

      // Clean up processed operations to avoid memory leaks
      this.cleanupProcessedOperations();

      for (const op of batch.crud) {
        // Only handle schedules table operations that have photos
        if (op.table === 'schedules' && op.opData?.photos) {
          const scheduleId = op.id;

          // Get schedule details for metadata
          const schedule = await database.get<{
            jobTitle: string;
            invoiceRef: string;
          }>('SELECT jobTitle, invoiceRef FROM schedules WHERE id = ?', [
            scheduleId,
          ]);

          if (!schedule?.jobTitle) {
            continue;
          }

          // Parse photos data
          const photosData = parsePhotosData(op.opData.photos);

          // If there are no pending operations, continue to next record
          if (!photosData.pendingOps || photosData.pendingOps.length === 0) {
            continue;
          }

          // Initialize array for tracking operations that need to remain
          const remainingOps: PendingOp[] = [];

          // Process each pending operation
          for (const pendingOp of photosData.pendingOps) {
            // Set scheduleId on the operation for tracking
            pendingOp.scheduleId = scheduleId;

            // Skip already processed operations
            if (this.isOperationProcessed(pendingOp, scheduleId)) {
              continue;
            }

            try {
              if (pendingOp.type === 'add') {
                // Handle photo uploads
                if (['before', 'after'].includes(pendingOp.photoType)) {
                  // Find the corresponding photo in the photos array
                  const photo = photosData[
                    pendingOp.photoType as 'before' | 'after'
                  ].find((p) => p.id === pendingOp.photoId);

                  if (photo && photo.url?.startsWith('data:')) {
                    await this.apiClient.uploadPhotos(
                      [photo.url],
                      pendingOp.photoType as 'before' | 'after',
                      pendingOp.technicianId,
                      schedule.jobTitle,
                      scheduleId
                    );

                    // Mark as processed
                    this.markOperationProcessed(pendingOp, scheduleId);
                  }
                }
                // Handle signature uploads
                else if (
                  pendingOp.photoType === 'signature' &&
                  op.opData.signature
                ) {
                  const signatureData =
                    typeof op.opData.signature === 'string'
                      ? (JSON.parse(op.opData.signature) as PhotoType)
                      : (op.opData.signature as PhotoType);

                  if (signatureData?.url?.startsWith('data:')) {
                    await this.apiClient.uploadPhotos(
                      [signatureData.url],
                      'signature',
                      pendingOp.technicianId,
                      schedule.jobTitle,
                      scheduleId,
                      signatureData.signerName
                    );

                    // Mark as processed
                    this.markOperationProcessed(pendingOp, scheduleId);
                  }
                }
              } else if (pendingOp.type === 'delete') {
                // Handle photo deletions - make sure we have a URL and a valid photo type
                if (pendingOp.url) {
                  // Make sure photoType is a valid type, default to pendingOp.photoType or 'before'
                  const photoType =
                    pendingOp.photoType === 'before' ||
                    pendingOp.photoType === 'after'
                      ? pendingOp.photoType
                      : 'before';

                  try {
                    // Only process HTTP URLs (skip local files)
                    if (!pendingOp.url.startsWith('http')) {
                      this.markOperationProcessed(pendingOp, scheduleId);
                      continue;
                    }

                    // Explicitly call with valid photoType
                    await this.apiClient.deletePhoto(
                      pendingOp.url,
                      photoType,
                      scheduleId
                    );

                    // Mark as processed on success
                    this.markOperationProcessed(pendingOp, scheduleId);
                  } catch (error) {
                    // Increment retry count
                    this.incrementRetryCount(pendingOp, scheduleId);

                    // Only keep the operation for retry if it's not a "photo not found" error
                    if (
                      error instanceof Error &&
                      !error.message.includes(
                        'Failed to delete from Cloudinary'
                      ) &&
                      !error.message.includes('Photo not found')
                    ) {
                      remainingOps.push(pendingOp);
                    } else {
                      // For photo not found errors, mark as processed to avoid retrying
                      this.markOperationProcessed(pendingOp, scheduleId);
                    }
                  }
                } else {
                  // Skip operations without URL since they can't be processed
                  this.markOperationProcessed(pendingOp, scheduleId);
                }
              }
            } catch (error) {
              // Increment retry count
              this.incrementRetryCount(pendingOp, scheduleId);

              // Keep operation for retry if it failed and hasn't exceeded max retries
              if (!this.isOperationProcessed(pendingOp, scheduleId)) {
                remainingOps.push(pendingOp);
              }
            }
          }

          // Update photos data if we processed any operations
          if (remainingOps.length !== photosData.pendingOps.length) {
            // Update the photos object with remaining pending operations
            photosData.pendingOps = remainingOps;

            await database.execute(
              `UPDATE schedules SET photos = ? WHERE id = ?`,
              [JSON.stringify(photosData), scheduleId]
            );
          }
        }
      }

      // Complete the batch
      await batch.complete();
    } catch (error) {
      // Still complete the batch to avoid blocking the queue
      await batch.complete();
    }
  }
}
