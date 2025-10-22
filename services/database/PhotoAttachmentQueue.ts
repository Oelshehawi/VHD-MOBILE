import { File, Directory } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { AppConfig } from './AppConfig';
import {
  AbstractAttachmentQueue,
  ATTACHMENT_TABLE,
  AttachmentRecord,
  AttachmentState,
} from '@powersync/attachments';
import { logDatabase, logDatabaseError, logPhoto, logPhotoError } from '@/utils/DebugLogger';
import { prepareImageForUpload } from '@/utils/imagePrep';

// Extend AttachmentRecord to include the scheduleId property
export interface ExtendedAttachmentRecord extends AttachmentRecord {
  scheduleId?: string;
  jobTitle?: string;
  type?: 'before' | 'after' | 'signature';
  startDate?: string;
  technicianId?: string;
  signerName?: string;
}

export class PhotoAttachmentQueue extends AbstractAttachmentQueue {
  async init() {
    if (!AppConfig.cloudinaryApiKey) {
      // Set a reasonable interval instead of disabling
      this.options.syncInterval = 5000; // 5 seconds
      return;
    }

    // If syncInterval is set to 0, don't initialize automatic sync (manual mode)
    if (this.options.syncInterval === 0) {
      console.log('[PhotoAttachmentQueue] Manual sync mode enabled - automatic uploads disabled');
      return;
    }

    await super.init();
  }

  onAttachmentIdsChange(onUpdate: (ids: string[]) => void): void {
    // Watch the attachments table for ALL attachments with a scheduleId
    // This ensures we track all attachments related to schedules, regardless of state
    return;
  }

  /**
   * Override saveToQueue to handle the custom scheduleId field
   */
  async saveToQueue(
    record: ExtendedAttachmentRecord
  ): Promise<ExtendedAttachmentRecord> {
    logDatabase('Starting saveToQueue', {
      recordId: record.id,
      scheduleId: record.scheduleId,
      filename: record.filename,
      type: record.type
    });

    // Ensure state is QUEUED_UPLOAD to prevent download attempts
    record.state = AttachmentState.QUEUED_UPLOAD;

    try {
      // First call the parent's implementation to save the standard fields
      logDatabase('Calling parent saveToQueue');
      const savedRecord = await super.saveToQueue(record);
      logDatabase('Parent saveToQueue completed', { savedId: savedRecord.id });

      // Then explicitly update the custom fields if they're provided
      const updates = [];
      const params = [];

      if (record.scheduleId) {
        updates.push('scheduleId = ?');
        params.push(record.scheduleId);
      }

      if (record.jobTitle) {
        updates.push('jobTitle = ?');
        params.push(record.jobTitle);
      }

      if (record.type) {
        updates.push('type = ?');
        params.push(record.type);
      }

      if (record.startDate) {
        updates.push('startDate = ?');
        params.push(record.startDate);
      }

      if (record.technicianId) {
        updates.push('technicianId = ?');
        params.push(record.technicianId);
      }

      if (record.signerName) {
        updates.push('signerName = ?');
        params.push(record.signerName);
      }

      if (updates.length > 0) {
        logDatabase('Updating custom fields', {
          updates: updates.length,
          fields: updates
        });

        try {
          // Add the ID to params for the WHERE clause
          params.push(savedRecord.id);

          // Execute SQL to update the custom columns
          await this.powersync.execute(
            `UPDATE ${ATTACHMENT_TABLE} SET ${updates.join(', ')} WHERE id = ?`,
            params
          );

          logDatabase('Custom fields updated successfully');

          // Update the returned record object with all custom fields
          if (record.scheduleId) {
            (savedRecord as ExtendedAttachmentRecord).scheduleId =
              record.scheduleId;
          }

          if (record.jobTitle) {
            (savedRecord as ExtendedAttachmentRecord).jobTitle = record.jobTitle;
          }

          if (record.type) {
            (savedRecord as ExtendedAttachmentRecord).type = record.type;
          }

          if (record.startDate) {
            (savedRecord as ExtendedAttachmentRecord).startDate =
              record.startDate;
          }

          if (record.technicianId) {
            (savedRecord as ExtendedAttachmentRecord).technicianId =
              record.technicianId;
          }

          if (record.signerName) {
            (savedRecord as ExtendedAttachmentRecord).signerName =
              record.signerName;
          }
        } catch (error) {
          logDatabaseError('Failed to update custom fields', error);
          // Still return the saved record even if custom fields failed
        }
      }

      logDatabase('saveToQueue completed successfully', {
        finalId: savedRecord.id,
        state: savedRecord.state
      });

      return savedRecord as ExtendedAttachmentRecord;
    } catch (error) {
      logDatabaseError('saveToQueue failed', {
        recordId: record.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Batch save multiple attachments to the queue efficiently
   * @param records Array of attachment records to save
   * @returns Array of saved attachment records
   */
  async batchSaveToQueue(
    records: ExtendedAttachmentRecord[]
  ): Promise<ExtendedAttachmentRecord[]> {
    if (!records || records.length === 0) return [];

    const savedRecords: ExtendedAttachmentRecord[] = [];

    try {
      // Process each record individually instead of in a transaction
      // This avoids nested transaction issues if parent saveToQueue uses transactions
      for (const record of records) {
        try {
          // Ensure state is QUEUED_UPLOAD
          record.state = AttachmentState.QUEUED_UPLOAD;

          // Save using parent implementation
          const savedRecord = await this.saveToQueue(record);
          savedRecords.push(savedRecord as ExtendedAttachmentRecord);
        } catch (recordError) {
          // Continue with other records even if one fails
        }
      }
    } catch (error) {
      // Silent error handling
    }

    return savedRecords;
  }

  async newAttachmentRecord(
    record?: Partial<ExtendedAttachmentRecord>
  ): Promise<ExtendedAttachmentRecord> {
    const photoId = record?.id ?? randomUUID();
    const filename = record?.filename ?? `${photoId}.jpg`;

    // Always use QUEUED_UPLOAD state to prevent download attempts
    // Create a new object without the state property from record, if it exists
    const { state: _, ...restOfRecord } = record || {};

    return {
      id: photoId,
      filename,
      media_type: 'image/jpeg',
      state: AttachmentState.QUEUED_UPLOAD,
      scheduleId: record?.scheduleId,
      ...restOfRecord,
    };
  }

  /**
   * Batch save multiple photos from URIs
   * @param photoData Array of objects containing source URI and metadata
   * @returns Array of saved attachment records
   */
  async batchSavePhotosFromUri(
    photoData: Array<{
      sourceUri: string;
      scheduleId: string;
      jobTitle?: string;
      type?: 'before' | 'after' | 'signature';
      startDate?: string;
      technicianId?: string;
      signerName?: string;
    }>
  ): Promise<ExtendedAttachmentRecord[]> {
    logPhoto('Starting batchSavePhotosFromUri', {
      photoCount: photoData?.length || 0
    });

    if (!photoData || photoData.length === 0) {
      logPhoto('No photo data provided, returning empty array');
      return [];
    }

    const attachments: ExtendedAttachmentRecord[] = [];

    // First, create all the attachment records and copy files
    for (let i = 0; i < photoData.length; i++) {
      const photo = photoData[i];
      logPhoto(`Processing photo ${i + 1} of ${photoData.length}`, {
        sourceUri: photo.sourceUri,
        scheduleId: photo.scheduleId,
        type: photo.type
      });

      try {
        // Sanitize technicianId - ensure it's a string without array brackets or quotes
        let sanitizedTechnicianId = photo.technicianId || '';
        if (sanitizedTechnicianId) {
          // Remove array brackets, quotes, and backslashes if present
          sanitizedTechnicianId = sanitizedTechnicianId
            .replace(/^\[|\]$/g, '') // Remove brackets at start/end
            .replace(/^"|"$/g, '') // Remove quotes at start/end
            .replace(/\\/g, ''); // Remove backslashes
        }

        // Prepare image (resize to 2560×2560, quality 1.0)
        logPhoto(`Preparing image ${i + 1} for upload`, { sourceUri: photo.sourceUri });
        const prepared = await prepareImageForUpload(photo.sourceUri);
        logPhoto(`Image ${i + 1} prepared`, {
          size: prepared.size,
          dimensions: `${prepared.width}×${prepared.height}`
        });
        const processUri = prepared.uri;

        logPhoto(`Creating attachment record for photo ${i + 1}`);
        // Create a new attachment record with scheduleId, jobTitle, and type
        const photoAttachment = await this.newAttachmentRecord({
          scheduleId: photo.scheduleId,
          jobTitle: photo.jobTitle,
          type: photo.type,
          startDate: photo.startDate,
          technicianId: sanitizedTechnicianId,
          signerName: photo.signerName,
        });

        logPhoto(`Attachment record created for photo ${i + 1}`, {
          id: photoAttachment.id,
          filename: photoAttachment.filename
        });

        // Set the local URI path
        photoAttachment.local_uri = this.getLocalFilePathSuffix(
          photoAttachment.filename
        );
        const destinationUri = this.getLocalUri(photoAttachment.local_uri);

        logPhoto(`File paths set for photo ${i + 1}`, {
          localUri: photoAttachment.local_uri,
          destinationUri
        });

        // Verify prepared file exists using new File API
        logPhoto(`Checking prepared file exists for photo ${i + 1}`);
        try {
          const sourceFile = new File(processUri);
          if (!sourceFile.exists) {
            logPhotoError(`Prepared file does not exist for photo ${i + 1}`, {
              sourceUri: processUri
            });
            continue;
          }

          logPhoto(`Prepared file verified for photo ${i + 1}`, {
            size: sourceFile.size
          });
        } catch (sourceCheckError) {
          logPhotoError(`Failed to check prepared file for photo ${i + 1}`, {
            sourceUri: processUri,
            error: sourceCheckError instanceof Error ? sourceCheckError.message : String(sourceCheckError)
          });
          continue;
        }

        // Check destination directory exists and create if needed using new Directory API
        logPhoto(`Checking destination directory for photo ${i + 1}`, {
          destinationUri
        });
        try {
          const destinationDirPath = destinationUri.substring(0, destinationUri.lastIndexOf('/'));
          const destinationDir = new Directory(destinationDirPath);
          if (!destinationDir.exists) {
            logPhoto(`Creating destination directory: ${destinationDirPath}`);
            destinationDir.create();
            logPhoto(`Destination directory created successfully`);
          } else {
            logPhoto(`Destination directory exists`);
          }
        } catch (dirError) {
          logPhotoError(`Failed to prepare destination directory for photo ${i + 1}`, {
            destinationUri,
            error: dirError instanceof Error ? dirError.message : String(dirError)
          });
          continue;
        }

        // Copy the prepared file
        logPhoto(`Starting file copy for photo ${i + 1}`, {
          from: processUri,
          to: destinationUri
        });
        try {
          const sourceFile = new File(processUri);
          const destinationFile = new File(destinationUri);
          sourceFile.copy(destinationFile);
          logPhoto(`File copied successfully for photo ${i + 1}`);

          // Clean up temp file if different from original
          if (processUri !== photo.sourceUri) {
            try {
              const tempFile = new File(processUri);
              if (tempFile.exists) {
                tempFile.delete();
              }
            } catch {
              // Ignore cleanup errors
            }
          }
        } catch (copyError) {
          logPhotoError(`File copy failed for photo ${i + 1}`, {
            from: processUri,
            to: destinationUri,
            error: copyError instanceof Error ? copyError.message : String(copyError),
            errorName: copyError instanceof Error ? copyError.name : 'Unknown',
            stack: copyError instanceof Error ? copyError.stack : undefined
          });
          continue;
        }

        // Get file info and verify copy was successful using new File API
        logPhoto(`Verifying copied file for photo ${i + 1}`);
        try {
          const destinationFile = new File(destinationUri);
          if (destinationFile.exists) {
            photoAttachment.size = destinationFile.size ?? 0;
            logPhoto(`File info retrieved for photo ${i + 1}`, {
              size: destinationFile.size
            });
          } else {
            logPhotoError(`Destination file does not exist after copy for photo ${i + 1}`, {
              destinationUri
            });
            continue;
          }
        } catch (verifyError) {
          logPhotoError(`Failed to verify copied file for photo ${i + 1}`, {
            destinationUri,
            error: verifyError instanceof Error ? verifyError.message : String(verifyError)
          });
          continue;
        }

        attachments.push(photoAttachment);
        logPhoto(`Photo ${i + 1} processed successfully`);
      } catch (error) {
        logPhotoError(`Failed to process photo ${i + 1}`, {
          error: error instanceof Error ? error.message : String(error),
          sourceUri: photo.sourceUri
        });
        // Continue with other photos
      }
    }

    logPhoto('File processing complete', {
      processedCount: attachments.length,
      originalCount: photoData.length
    });

    // Then batch save all to queue
    logPhoto('Starting batch save to queue');
    const result = await this.batchSaveToQueue(attachments);
    logPhoto('Batch save completed', {
      savedCount: result.length
    });

    return result;
  }

  /**
   * Save a photo from a URI to the queue
   * @param sourceUri URI of the photo to save
   * @param scheduleId ID of the schedule this photo belongs to
   * @param jobTitle Title of the job
   * @param type Type of photo (before or after) or signature
   * @param startDate Date when the schedule starts
   * @param technicianId ID of the technician who took the photo
   * @param signerName Name of the person signing (for signature type only)
   * @returns Attachment record
   */
  async savePhotoFromUri(
    sourceUri: string,
    scheduleId: string,
    jobTitle?: string,
    type?: 'before' | 'after' | 'signature',
    startDate?: string,
    technicianId?: string,
    signerName?: string
  ): Promise<ExtendedAttachmentRecord> {
    try {
      // 1. Resize image to 2560×2560 max, quality 1.0
      logPhoto('Preparing image for upload', { sourceUri, scheduleId });
      const prepared = await prepareImageForUpload(sourceUri);
      logPhoto('Image prepared', {
        size: prepared.size,
        dimensions: `${prepared.width}×${prepared.height}`
      });

      // 2. Create attachment record
      const photoAttachment = await this.newAttachmentRecord({
        scheduleId,
        jobTitle,
        type,
        startDate,
        technicianId,
        signerName,
      });

      // 3. Set destination path
      photoAttachment.local_uri = this.getLocalFilePathSuffix(photoAttachment.filename);
      const destinationUri = this.getLocalUri(photoAttachment.local_uri);

      // 4. Ensure destination directory exists using new Directory API
      const destinationDirPath = destinationUri.substring(0, destinationUri.lastIndexOf('/'));
      const destinationDir = new Directory(destinationDirPath);
      if (!destinationDir.exists) {
        destinationDir.create();
      }

      // 5. Copy prepared file
      const preparedFile = new File(prepared.uri);
      const destFile = new File(destinationUri);
      preparedFile.copy(destFile);

      // 6. Clean up temp file
      if (prepared.uri !== sourceUri) {
        try {
          const tempFile = new File(prepared.uri);
          if (tempFile.exists) {
            tempFile.delete();
          }
        } catch {
          // Ignore cleanup errors
        }
      }

      // 7. Set file size using new File API
      const destinationFile = new File(destinationUri);
      if (destinationFile.exists) {
        photoAttachment.size = destinationFile.size ?? 0;
      }

      // 8. Save to queue
      const savedAttachment = await this.saveToQueue(photoAttachment);
      logPhoto('Photo saved to queue', { id: savedAttachment.id, size: savedAttachment.size });

      return savedAttachment as ExtendedAttachmentRecord;
    } catch (error) {
      logPhotoError('Failed to save photo', error);
      throw error;
    }
  }

  /**
   * Get the count of pending uploads in the queue
   * @returns The number of pending uploads
   */
  async getPendingCount(): Promise<number> {
    try {
      interface CountResult {
        count: number;
      }

      const pendingRecords = await this.powersync.getAll<CountResult>(
        `SELECT COUNT(*) as count FROM ${ATTACHMENT_TABLE} WHERE state = ?`,
        [AttachmentState.QUEUED_UPLOAD]
      );
      return pendingRecords[0]?.count || 0;
    } catch (error) {
      console.error('Error getting pending count:', error);
      return 0;
    }
  }
}
