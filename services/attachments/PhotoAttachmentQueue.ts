import * as FileSystem from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import {
  AbstractAttachmentQueue,
  AttachmentRecord,
  AttachmentState,
} from '@powersync/attachments';
import { CloudinaryStorageAdapter } from '../storage/CloudinaryStorageAdapter';

/**
 * Extended AttachmentRecord interface with metadata properties.
 * Note: These fields are now encoded in the filename rather than stored in database columns.
 * The filename format is: type_technicianId_scheduleId_jobTitle.jpg
 * Special case: technicianId is expected to be in the format "user_USERID"
 */
export interface PhotoAttachmentRecord extends AttachmentRecord {
  // Custom fields for metadata (not stored in database anymore)
  type?: string;
  technician_id?: string;
  schedule_id?: string;
  job_title?: string;
  signer_name?: string;
  timestamp_str?: string;
  local_uri?: string; // This one is handled by PowerSync
}

/**
 * Queue for managing photo attachments
 * Currently used in upload-only mode to avoid download overhead
 */
export class PhotoAttachmentQueue extends AbstractAttachmentQueue {
  // Declare protected properties to fix TypeScript errors

  /**
   * Initialize the attachment queue
   */
  async init() {
    await super.init();
  }

  /**
   * Watch for photo ID changes in the schedules table
   * Currently returns empty array to disable downloading/syncing existing photos
   * This optimizes the app to use attachments system for uploads only
   */
  onAttachmentIdsChange(onUpdate: (ids: string[]) => void): void {
    // Return empty array to disable automatic photo tracking and downloading
    // This means we're only using the attachment system for uploads
    onUpdate([]);

    // The commented watch query below is the original implementation
    // Kept for reference but not used in upload-only mode
    // this.powersync.watch(
    //   `SELECT id, photos FROM schedules WHERE photos IS NOT NULL`,
    //   [],
    //   {
    //     onResult: (result) => {
    //       try {
    //         const photoIds: string[] = [];

    //         if (result.rows?._array) {
    //           for (const row of result.rows._array) {
    //             try {
    //               if (row.photos && typeof row.photos === 'string') {
    //                 const photosObj = JSON.parse(row.photos);

    //                 // Extract IDs from before photos
    //                 if (Array.isArray(photosObj.before)) {
    //                   const beforeIds = photosObj.before
    //                     .map((photo: any) => photo.id || photo._id)
    //                     .filter(Boolean);
    //                   photoIds.push(...beforeIds);
    //                 }

    //                 // Extract IDs from after photos
    //                 if (Array.isArray(photosObj.after)) {
    //                   const afterIds = photosObj.after
    //                     .map((photo: any) => photo.id || photo._id)
    //                     .filter(Boolean);
    //                   photoIds.push(...afterIds);
    //                 }
    //               }
    //             } catch (e) {
    //               console.warn(
    //                 `Error parsing photos for schedule ${row.id}:`,
    //                 e
    //               );
    //             }
    //           }
    //         }

    //         // Return unique IDs
    //         const uniqueIds = [...new Set(photoIds)];
    //         onUpdate(uniqueIds);
    //       } catch (error) {
    //         console.error('Error in photo ID change watcher:', error);
    //         onUpdate([]);
    //       }
    //     },
    //   }
    // );
  }

  /**
   * Create a new attachment record with our custom fields
   */
  async newAttachmentRecord(
    record?: Partial<PhotoAttachmentRecord>
  ): Promise<PhotoAttachmentRecord> {
    // Generate unique ID
    const photoId = record?.id ?? randomUUID();

    // Get custom field values, ensuring they're properly initialized
    const type = record?.type || 'before';
    const technician_id = record?.technician_id || 'unknown';
    const schedule_id = record?.schedule_id || 'unknown';
    const job_title = record?.job_title || 'unknown';
    const signer_name = record?.signer_name || undefined;
    const timestamp_str = record?.timestamp_str || new Date().toISOString();

    // Sanitize values for the filename - remove problematic characters but keep underscore in technicianId
    // For technician_id we're more careful to preserve the user_ prefix
    const sanitizedType = type.replace(/[^\w-]/g, '');
    // We expect technician_id to be in the format "user_ID", so we only strip problematic chars but not underscores
    const sanitizedTechId = technician_id.replace(/[^\w_-]/g, '');
    // For scheduleId - it needs to be a valid MongoDB ObjectId (24 character hex)
    const sanitizedScheduleId = schedule_id.replace(/[^\w-]/g, '');
    // Sanitize job title and replace spaces with hyphens
    const sanitizedJobTitle = job_title
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    // Create a filename that encodes metadata that the CloudinaryStorageAdapter can read
    // Format: type_techId_scheduleId_jobTitle.jpg
    const filename =
      record?.filename ||
      `${sanitizedType}_${sanitizedTechId}_${sanitizedScheduleId}_${sanitizedJobTitle}.jpg`;

    // Return a complete record with all required fields
    return {
      id: photoId,
      filename,
      media_type: 'image/jpeg',
      state: AttachmentState.QUEUED_UPLOAD,
      timestamp: Date.now(),
      size: 0,
      technician_id,
      schedule_id,
      job_title,
      type,
      signer_name,
      timestamp_str,
      ...record,
    };
  }

  /**
   * Save a photo from base64 data with metadata
   */
  async savePhoto(
    base64Data: string,
    type: 'before' | 'after' | 'signature',
    technicianId: string,
    scheduleId: string,
    jobTitle: string,
    signerName?: string,
    customId?: string
  ): Promise<PhotoAttachmentRecord> {
    // Validate inputs
    if (!scheduleId || scheduleId === 'unknown') {
      console.error('Invalid scheduleId in savePhoto:', scheduleId);
      throw new Error('Invalid scheduleId');
    }

    if (!technicianId || technicianId === 'unknown') {
      console.error('Invalid technicianId in savePhoto:', technicianId);
      throw new Error('Invalid technicianId');
    }

    console.log(`Creating photo with metadata:`, {
      customId: customId ? 'Provided' : 'Not provided',
      type,
      technicianId: technicianId.substring(0, 15) + '...', // Truncate for privacy
      scheduleId,
      jobTitle,
      signerName: signerName ? 'Present' : 'None',
    });

    try {
      // Create a new attachment record with metadata
      const photoAttachment = await this.newAttachmentRecord({
        type,
        technician_id: technicianId,
        schedule_id: scheduleId,
        job_title: jobTitle,
        signer_name: signerName,
        timestamp_str: new Date().toISOString(),
      });

      // Set the local URI
      const localPath = this.getLocalFilePathSuffix(photoAttachment.filename);
      photoAttachment.local_uri = localPath;

      // Get the full local URI
      const localUri = this.getLocalUri(localPath);

      // Ensure directory exists
      const directory = localUri.substring(0, localUri.lastIndexOf('/'));
      await this.storage.makeDir(directory);

      // Check if we have valid base64 data
      if (!base64Data || base64Data.length < 100) {
        console.error(
          'Invalid base64Data received in savePhoto, length:',
          base64Data?.length
        );
        throw new Error('Invalid base64 image data');
      }

      console.log(`Writing file to local storage: ${photoAttachment.filename}`);

      // Write the file
      await this.storage.writeFile(localUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Update file size if available
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists && fileInfo.size !== undefined) {
        photoAttachment.size = fileInfo.size;
        console.log(`File saved with size: ${fileInfo.size} bytes`);
      } else {
        console.warn(`File not found or size unknown: ${localUri}`);
      }

      // Queue for upload - this will be processed by the queue service
      console.log(`Queueing file for upload: ${photoAttachment.id}`);
      const savedAttachment = (await this.saveToQueue(
        photoAttachment
      )) as PhotoAttachmentRecord;

      console.log(`Successfully queued photo: ${savedAttachment.id}`);
      return savedAttachment;
    } catch (error) {
      console.error('Error in savePhoto:', error);
      throw error;
    }
  }
}
