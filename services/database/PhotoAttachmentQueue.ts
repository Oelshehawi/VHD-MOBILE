import * as FileSystem from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { AppConfig } from './AppConfig';
import {
  AbstractAttachmentQueue,
  ATTACHMENT_TABLE,
  AttachmentRecord,
  AttachmentState,
} from '@powersync/attachments';

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
      console.debug(
        'No Cloudinary API Key configured, skip setting up PhotoAttachmentQueue watches'
      );
      // Disable sync interval to prevent errors from trying to sync to a non-existent bucket
      this.options.syncInterval = 0;
      return;
    }

    await super.init();
  }

  onAttachmentIdsChange(onUpdate: (ids: string[]) => void): void {
    onUpdate([]);
    // this.powersync.watch(
    //   `SELECT id FROM ${SCHEDULES_TABLE} WHERE photos IS NOT NULL`,
    //   [],
    //   {
    //     onResult: (result) =>
    //       onUpdate(result.rows?._array.map((r) => r.id) ?? []),
    //   }
    // );
  }

  /**
   * Override saveToQueue to handle the custom scheduleId field
   */
  async saveToQueue(
    record: ExtendedAttachmentRecord
  ): Promise<ExtendedAttachmentRecord> {
    // First call the parent's implementation to save the standard fields
    const savedRecord = await super.saveToQueue(record);

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
      try {
        // Add the ID to params for the WHERE clause
        params.push(savedRecord.id);

        // Execute SQL to update the custom columns
        await this.powersync.execute(
          `UPDATE ${ATTACHMENT_TABLE} SET ${updates.join(', ')} WHERE id = ?`,
          params
        );

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
        console.error('Error updating attachment custom fields:', error);
      }
    }

    return savedRecord as ExtendedAttachmentRecord;
  }

  async newAttachmentRecord(
    record?: Partial<ExtendedAttachmentRecord>
  ): Promise<ExtendedAttachmentRecord> {
    const photoId = record?.id ?? randomUUID();
    const filename = record?.filename ?? `${photoId}.jpg`;

    return {
      id: photoId,
      filename,
      media_type: 'image/jpeg',
      state: AttachmentState.QUEUED_UPLOAD,
      scheduleId: record?.scheduleId,
      ...record,
    };
  }

  async savePhoto(base64Data: string): Promise<ExtendedAttachmentRecord> {
    try {
      // Create a new attachment record
      const photoAttachment = await this.newAttachmentRecord();

      // Set the local URI path
      photoAttachment.local_uri = this.getLocalFilePathSuffix(
        photoAttachment.filename
      );
      const localUri = this.getLocalUri(photoAttachment.local_uri);

      // Write the file to disk
      await this.storage.writeFile(localUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Get file info to update the record size
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) {
        photoAttachment.size = fileInfo.size;
      } else {
        console.warn('File was written but not found in getInfoAsync check');
      }

      // Save the attachment to the queue
      const savedAttachment = await this.saveToQueue(photoAttachment);
      return savedAttachment as ExtendedAttachmentRecord;
    } catch (error) {
      console.error('Error in PhotoAttachmentQueue.savePhoto:', error);
      throw error;
    }
  }

  /**
   * Save a photo from an existing file URI to the attachment queue
   * @param sourceUri URI of the existing image file
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
      // Create a new attachment record with scheduleId, jobTitle, and type
      const photoAttachment = await this.newAttachmentRecord({
        scheduleId,
        jobTitle,
        type,
        startDate,
        technicianId,
        signerName,
      });

      // Set the local URI path
      photoAttachment.local_uri = this.getLocalFilePathSuffix(
        photoAttachment.filename
      );
      const destinationUri = this.getLocalUri(photoAttachment.local_uri);

      // Copy the file directly instead of using base64
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destinationUri,
      });

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(destinationUri);
      if (fileInfo.exists) {
        photoAttachment.size = fileInfo.size;
      } else {
        console.warn('File was copied but not found in getInfoAsync check');
      }

      // Save to queue
      const savedAttachment = await this.saveToQueue(photoAttachment);
      return savedAttachment as ExtendedAttachmentRecord;
    } catch (error) {
      console.error('Error in PhotoAttachmentQueue.savePhotoFromUri:', error);
      throw error;
    }
  }

  async logAttachments() {
    try {
      const results = await this.powersync.getAll(
        `SELECT * FROM ${ATTACHMENT_TABLE}`
      );
      console.log(`Found ${results.length} attachments`);
      // Only log in development
      if (__DEV__) {
        results.forEach((attachment, index) => {
          console.log(
            `Attachment ${index + 1}:`,
            JSON.stringify(attachment, null, 2)
          );
        });
      }
    } catch (error) {
      console.error('Error logging attachments:', error);
    }
  }
}
