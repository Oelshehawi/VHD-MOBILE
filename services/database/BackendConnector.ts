import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  CrudBatch,
} from '@powersync/react-native';
import { ApiClient } from '../api';
import { getClerkInstance } from '@clerk/clerk-expo';
import { PhotoType, PendingOp, parsePhotosData } from '@/utils/photos';

export class BackendConnector implements PowerSyncBackendConnector {
  private apiClient: ApiClient | null = null;
  private endpoint: string = '';

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
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

      console.log(`Processing CRUD batch with ${batch.crud.length} operations`);

      // Process each operation individually with better checkpointing
      let completedCount = 0;

      for (const op of batch.crud) {
        console.log(`Processing operation: table=${op.table}, id=${op.id}`);
        let operationSuccessful = false;

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
            console.log(
              `Skipping operation for schedule ${scheduleId} - no jobTitle found`
            );
            continue;
          }

          // Parse photos data
          const photosData = parsePhotosData(op.opData.photos);
          console.log(
            `Photos data for schedule ${scheduleId}:`,
            `before: ${photosData.before.length}`,
            `after: ${photosData.after.length}`,
            `pendingOps: ${photosData.pendingOps.length}`
          );

          if (photosData.pendingOps.length === 0) {
            // No pending ops, mark as successful
            operationSuccessful = true;
            continue;
          }

          try {
            // Process delete operations - one at a time
            const deleteOps = photosData.pendingOps.filter(
              (pendingOp) =>
                pendingOp.type === 'delete' &&
                pendingOp.url &&
                pendingOp.url.startsWith('http')
            );

            // Handle uploads
            const beforeUploads = photosData.before
              .filter((photo) => photo.url && photo.url.startsWith('data:'))
              .map((photo) => ({
                photoId: photo.id,
                url: photo.url,
                type: 'before' as const,
                technicianId: photo.technicianId,
              }));

            const afterUploads = photosData.after
              .filter((photo) => photo.url && photo.url.startsWith('data:'))
              .map((photo) => ({
                photoId: photo.id,
                url: photo.url,
                type: 'after' as const,
                technicianId: photo.technicianId,
              }));

            const pendingAdds = photosData.pendingOps
              .filter(
                (op) =>
                  op.type === 'add' && op.url && op.url.startsWith('data:')
              )
              .map((op) => ({
                photoId: op.photoId,
                url: op.url as string,
                type: op.photoType,
                technicianId: op.technicianId,
              }));

            // Combine all uploads, removing duplicates by photoId
            const uniqueUploads = new Map();
            [...beforeUploads, ...afterUploads, ...pendingAdds].forEach(
              (upload) => {
                if (!uniqueUploads.has(upload.photoId)) {
                  uniqueUploads.set(upload.photoId, upload);
                }
              }
            );

            const uploads = Array.from(uniqueUploads.values());
            console.log(
              `Found ${uploads.length} unique photos to upload and ${deleteOps.length} photos to delete`
            );

            // Process operations
            let allOperationsSuccessful = true;

            // First process deletes - one at a time
            for (const deleteOp of deleteOps) {
              if (!deleteOp.url) continue; // TypeScript safety check

              const photoType =
                deleteOp.photoType === 'before' ||
                deleteOp.photoType === 'after'
                  ? deleteOp.photoType
                  : 'before';

              try {
                const response = await this.apiClient.deletePhoto(
                  deleteOp.url,
                  photoType,
                  scheduleId
                );
                console.log(
                  `Successfully deleted photo ${deleteOp.photoId} from Cloudinary`
                );

                // Complete after each successful operation
                await batch.complete();
                console.log('Batch checkpoint advanced after delete operation');
              } catch (deleteError) {
                console.error(
                  `Error deleting photo ${deleteOp.photoId}:`,
                  deleteError
                );
                allOperationsSuccessful = false;
              }
            }

            // Then process uploads - one at a time with individual completion
            for (const upload of uploads) {
              try {
                console.log(
                  `Uploading '${upload.type}' photo (ID: ${upload.photoId})`
                );

                // Extract signerName for signature type
                let signerName: string | undefined;
                if (upload.type === 'signature') {
                  // First try to get it from the pending operation
                  const signatureOp = photosData.pendingOps.find(
                    (op) => op.type === 'add' && op.photoType === 'signature'
                  );

                  signerName = signatureOp?.signerName;
                }

                // Pass photoId for idempotency check
                const response = await this.apiClient.uploadPhotos(
                  [upload.url],
                  upload.type,
                  upload.technicianId || 'unknown',
                  schedule.jobTitle,
                  scheduleId,
                  signerName, // Pass extracted signerName
                  upload.photoId // photoId for idempotency
                );

                console.log(
                  `Successfully uploaded '${upload.type}' photo ${upload.photoId}`
                );

                // Complete batch after each successful upload to advance the checkpoint
                await batch.complete();
                console.log('Batch checkpoint advanced after upload operation');

                // Check if the response indicates the photo was already uploaded
                if (response?.alreadyUploaded) {
                  console.log(
                    `Photo ${upload.photoId} was already uploaded, skipping`
                  );
                }

                // Note: Even if we are reprocessing operations we've already done before,
                // we consider them successful since the server handled them correctly
              } catch (error) {
                console.error(
                  `Error uploading '${upload.type}' photo ${upload.photoId}:`,
                  error
                );
                allOperationsSuccessful = false;
              }
            }

            operationSuccessful = allOperationsSuccessful;
          } catch (error) {
            console.error('Error processing photos:', error);
            operationSuccessful = false;
          }
        } else {
          // For non-photo operations, consider them successful
          operationSuccessful = true;
        }

        if (operationSuccessful) {
          completedCount++;
        }
      }

      // Final batch completion
      console.log(
        `Completed ${completedCount}/${batch.crud.length} operations`
      );
      await batch.complete();
      console.log('CRUD batch completed successfully');
    } catch (error) {
      console.error('Error in uploadData:', error);
      // Complete the batch even if there are errors
      await batch.complete();
    }
  }
}
