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

interface CloudinaryDelete {
  message: string;
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
        `SELECT id, scheduleId, jobTitle, type, startDate, timestamp, technicianId FROM ${ATTACHMENT_TABLE} WHERE filename = ?`,
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

      // Read the file as base64
      const base64Data = await FileSystem.readAsStringAsync(localFileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Create data URI from base64 data
      const mimeType =
        options?.mediaType || this.getMimeTypeFromFilename(filename);
      const dataUri = `data:${mimeType};base64,${base64Data}`;

      // Create FormData
      const formData = new FormData();

      // Add the file as a data URI to FormData
      formData.append('file', dataUri);

      // Add parameters to FormData
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folderPath || 'vhd-app/powersync-attachments');

      // Make the POST request
      const uploadResponse = await fetch(url, {
        method: 'POST',
        body: formData,
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

        // Insert into add_photo_operations
        await this.powersync.execute(
          `INSERT INTO add_photo_operations (
            scheduleId, 
            timestamp, 
            technicianId, 
            type, 
            cloudinaryUrl
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            attachment.scheduleId || '',
            attachment.timestamp || new Date().toISOString(),
            attachment.technicianId || '',
            attachment.type || '',
            secureUrl,
          ]
        );

        console.log('Added Cloudinary URL to add_photo_operations table');
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
    options?: { filename?: string }
  ): Promise<void> {
    if (await this.fileExists(uri)) {
      await FileSystem.deleteAsync(uri);
    }

    const { filename } = options ?? {};
    if (!filename) {
      return;
    }

    try {
      const response = await this.client.getDeleteUrl<CloudinaryDelete>(
        'cloudinary-delete',
        {
          body: {
            fileName: filename,
          },
        }
      );

      if (response.error || !response.data) {
        throw new Error(
          `Failed to reach delete edge function, code=${response.error}`
        );
      }

      const { message } = response.data;
      console.log(message);
    } catch (error) {
      console.error(`Error deleting ${filename}:`, error);
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
