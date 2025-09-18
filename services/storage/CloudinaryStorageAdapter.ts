import * as FileSystem from 'expo-file-system';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { StorageAdapter, ATTACHMENT_TABLE } from '@powersync/attachments';
import { ApiClient } from '../ApiClient';

interface CloudinaryUpload {
  message: string;
  apiKey: string;
  timestamp: string;
  signature: string;
  cloudName: string;
  folderPath: string;
}

interface CloudinaryDownload {
  message: string;
  downloadUrl: string;
}

export class CloudinaryStorageAdapter implements StorageAdapter {
  private powersync: any = null;

  constructor(public client: ApiClient) {}

  /**
   * Set the PowerSync instance for querying attachment metadata
   */
  setPowerSync(powersync: any) {
    this.powersync = powersync;
  }

  /**
   * Direct upload method for concurrent processing
   * Bypasses PowerSync sequential processing
   */
  async uploadFileDirectly(
    attachmentRecord: any,
    options?: {
      mediaType?: string;
      onProgress?: (progress: number) => void;
    }
  ): Promise<{ success: boolean; error?: string; cloudinaryUrl?: string }> {
    try {
      const filename = attachmentRecord.filename;
      const localFileUri = `${this.getUserStorageDirectory()}attachments/${filename}`;

      // Verify the file exists
      const fileInfo = await FileSystem.getInfoAsync(localFileUri);
      if (!fileInfo.exists) {
        return { success: false, error: `Local file does not exist: ${localFileUri}` };
      }

      // Get upload URL from API
      const response = await this.client.getUploadUrl<CloudinaryUpload>(
        'cloudinary-upload',
        {
          body: {
            fileName: filename,
            jobTitle: attachmentRecord.jobTitle || '',
            type: attachmentRecord.type || '',
            startDate: attachmentRecord.startDate || '',
            mediaType: options?.mediaType,
          },
        }
      );

      if (response.error || !response.data) {
        return {
          success: false,
          error: `Failed to get upload URL: ${response.error}`,
        };
      }

      const { apiKey, timestamp, signature, cloudName, folderPath } = response.data;
      const url = 'https://api.cloudinary.com/v1_1/' + cloudName + '/upload';

      // Use streaming upload for better memory efficiency
      const mimeType = options?.mediaType || this.getMimeTypeFromFilename(filename);

      // Use FormData with file URI for streaming upload (better compatibility)
      const formData = new FormData();

      // Add the file directly from URI (React Native handles this as a stream)
      formData.append('file', {
        uri: localFileUri,
        type: mimeType,
        name: filename,
      } as any);

      // Add parameters to FormData
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folderPath || 'vhd-app/powersync-attachments');

      // Make the streaming POST request
      const uploadResponse = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        return {
          success: false,
          error: `Upload failed with status ${uploadResponse.status}: ${errorText}`,
        };
      }

      // Parse the Cloudinary response
      const cloudinaryData = await uploadResponse.json();
      const secureUrl = cloudinaryData.secure_url;

      if (!secureUrl) {
        return {
          success: false,
          error: 'No secure URL returned from Cloudinary',
        };
      }

      // Update PowerSync with the result
      if (this.powersync) {
        await this.updateAttachmentRecord(attachmentRecord, secureUrl);
      }

      return {
        success: true,
        cloudinaryUrl: secureUrl,
      };
    } catch (error) {
      console.error('Error in uploadFileDirectly:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update attachment record with Cloudinary URL and add to operations table
   */
  private async updateAttachmentRecord(
    attachmentRecord: any,
    cloudinaryUrl: string
  ): Promise<void> {
    try {
      const isSignature = attachmentRecord.type === 'signature';

      // Prepare columns and values for add_photo_operations
      const columns = [
        'scheduleId',
        'timestamp',
        'technicianId',
        'type',
        'cloudinaryUrl',
        'attachmentId',
      ];

      const values = [
        attachmentRecord.scheduleId || '',
        attachmentRecord.timestamp || new Date().toISOString(),
        attachmentRecord.technicianId || '',
        attachmentRecord.type || '',
        cloudinaryUrl,
        attachmentRecord.id || '',
      ];

      // Add signerName for signature type
      if (isSignature && attachmentRecord.signerName) {
        columns.push('signerName');
        values.push(attachmentRecord.signerName);
      }

      // Insert into add_photo_operations
      await this.powersync.execute(
        `INSERT INTO add_photo_operations (${columns.join(
          ', '
        )}) VALUES (${columns.map(() => '?').join(', ')})`,
        values
      );

      console.log(
        `Added Cloudinary URL to add_photo_operations table for ${
          isSignature ? 'signature' : 'photo'
        }`
      );
    } catch (error) {
      console.error('Error updating attachment record:', error);
      throw error;
    }
  }

  async uploadFile(
    filename: string,
    data: ArrayBuffer,
    options?: {
      mediaType?: string;
    }
  ): Promise<void> {
    try {
      // Retrieve attachment metadata from the database
      const attachmentData = await this.powersync.getAll(
        `SELECT id, scheduleId, jobTitle, type, startDate, timestamp, technicianId, signerName FROM ${ATTACHMENT_TABLE} WHERE filename = ?`,
        [filename]
      );

      const response = await this.client.getUploadUrl<CloudinaryUpload>(
        'cloudinary-upload',
        {
          body: {
            fileName: filename,
            jobTitle: attachmentData[0]?.jobTitle || '',
            type: attachmentData[0]?.type || '',
            startDate: attachmentData[0]?.startDate || '',
            mediaType: options?.mediaType,
          },
        }
      );

      if (response.error || !response.data) {
        throw new Error(
          `Failed to reach upload edge function, code=${response.error}`
        );
      }

      const { apiKey, timestamp, signature, cloudName, folderPath } =
        response.data;

      const url = 'https://api.cloudinary.com/v1_1/' + cloudName + '/upload';

      // Get the local file URI from PowerSync's attachment directory
      const localFileUri = `${this.getUserStorageDirectory()}attachments/${filename}`;

      // Verify the file exists
      const fileInfo = await FileSystem.getInfoAsync(localFileUri);
      if (!fileInfo.exists) {
        throw new Error(`Local file does not exist: ${localFileUri}`);
      }

      // Use streaming upload instead of base64 conversion for better memory efficiency
      const mimeType =
        options?.mediaType || this.getMimeTypeFromFilename(filename);

      // Create FormData with file URI directly (streaming)
      const formData = new FormData();

      // Add the file directly from URI (this streams the file instead of loading into memory)
      formData.append('file', {
        uri: localFileUri,
        type: mimeType,
        name: filename,
      } as any);

      // Add parameters to FormData
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folderPath || 'vhd-app/powersync-attachments');

      // Make the streaming POST request
      const uploadResponse = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Cloudinary error response:', errorText);
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      // Parse the Cloudinary response
      const cloudinaryData = await uploadResponse.json();

      // Extract the secure_url from the Cloudinary response
      const secureUrl = cloudinaryData.secure_url;

      // If we have attachment data and a secure URL, add to add_photo_operations table
      if (attachmentData.length > 0 && secureUrl && this.powersync) {
        const attachment = attachmentData[0];
        const isSignature = attachment.type === 'signature';

        // Prepare columns and values based on whether it's a signature or regular photo
        const columns = [
          'scheduleId',
          'timestamp',
          'technicianId',
          'type',
          'cloudinaryUrl',
          'attachmentId',
        ];

        const values = [
          attachment.scheduleId || '',
          attachment.timestamp || new Date().toISOString(),
          attachment.technicianId || '',
          attachment.type || '',
          secureUrl,
          attachment.id || '',
        ];

        // Add signerName for signature type
        if (isSignature && attachment.signerName) {
          columns.push('signerName');
          values.push(attachment.signerName);
        }

        // Insert into add_photo_operations
        await this.powersync.execute(
          `INSERT INTO add_photo_operations (${columns.join(
            ', '
          )}) VALUES (${columns.map(() => '?').join(', ')})`,
          values
        );

        console.log(
          `Added Cloudinary URL to add_photo_operations table for ${
            isSignature ? 'signature' : 'photo'
          }`
        );
      }
    } catch (error) {
      console.error('Error in uploadFile:', error);
      throw error;
    }
  }

  // Helper method to guess mime type from filename
  getMimeTypeFromFilename(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  async downloadFile(filePath: string): Promise<Blob> {
    const response = await this.client.getDownloadUrl<CloudinaryDownload>(
      'cloudinary-download',
      {
        body: {
          fileName: filePath,
        },
      }
    );

    if (response.error || !response.data) {
      throw new Error(
        `Failed to reach download edge function, code=${response.error}`
      );
    }

    const { downloadUrl } = response.data;

    try {
      const downloadResponse = await fetch(downloadUrl, {
        method: 'GET',
      });

      if (!downloadResponse.ok) {
        throw new Error(
          `Download failed with status ${downloadResponse.status}`
        );
      }

      return await downloadResponse.blob();
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  async deleteFile(
    uri: string,
    options?: {
      filename?: string;
      scheduleId?: string;
      cloudinaryUrl?: string;
    }
  ): Promise<void> {
    try {
      // Delete the file locally if it exists
      if (await this.fileExists(uri)) {
        await FileSystem.deleteAsync(uri);
      }
    } catch (error) {
      console.error(`Error in deleteFile:`, error);
      throw error;
    }
  }

  async readFile(
    fileURI: string,
    options?: { encoding?: FileSystem.EncodingType; mediaType?: string }
  ): Promise<ArrayBuffer> {
    const { encoding = FileSystem.EncodingType.UTF8 } = options ?? {};
    const { exists } = await FileSystem.getInfoAsync(fileURI);
    if (!exists) {
      throw new Error(`File does not exist: ${fileURI}`);
    }
    const fileContent = await FileSystem.readAsStringAsync(fileURI, options);
    if (encoding === FileSystem.EncodingType.Base64) {
      return await this.base64ToArrayBuffer(fileContent);
    }
    const buffer = await this.stringToArrayBuffer(fileContent);
    return buffer;
  }

  async writeFile(
    fileURI: string,
    base64Data: string,
    options?: {
      encoding?: FileSystem.EncodingType;
    }
  ): Promise<void> {
    const { encoding = FileSystem.EncodingType.UTF8 } = options ?? {};
    await FileSystem.writeAsStringAsync(fileURI, base64Data, { encoding });
  }

  async fileExists(fileURI: string): Promise<boolean> {
    const { exists } = await FileSystem.getInfoAsync(fileURI);
    return exists;
  }

  async makeDir(uri: string): Promise<void> {
    const { exists } = await FileSystem.getInfoAsync(uri);
    if (!exists) {
      await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    }
  }

  async copyFile(sourceUri: string, targetUri: string): Promise<void> {
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  }

  getUserStorageDirectory(): string {
    return FileSystem.documentDirectory!;
  }

  async stringToArrayBuffer(str: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer as ArrayBuffer;
  }

  /**
   * Converts a base64 string to an ArrayBuffer
   */
  async base64ToArrayBuffer(base64: string): Promise<ArrayBuffer> {
    return decodeBase64(base64);
  }
}
