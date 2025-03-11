import * as FileSystem from 'expo-file-system';
import { ApiClient } from '../api';
import { StorageAdapter } from '@powersync/attachments';

interface DownloadResponse {
  message: string;
  downloadUrl: string;
  photoData: any;
}

/**
 * Storage adapter for Cloudinary
 */
export class CloudinaryStorageAdapter implements StorageAdapter {
  constructor(public apiClient: ApiClient) {}

  // Extract metadata from the filename if possible
  private extractMetadataFromFilename(filename: string): {
    type?: 'before' | 'after' | 'signature';
    technicianId?: string;
    scheduleId?: string;
    jobTitle?: string;
  } {
    const result: {
      type?: 'before' | 'after' | 'signature';
      technicianId?: string;
      scheduleId?: string;
      jobTitle?: string;
    } = {};

    // Simple pattern matching for known filename patterns
    if (
      filename.includes('_before_') ||
      filename.includes('_after_') ||
      filename.includes('_signature_')
    ) {
      const parts = filename.split('_');
      if (parts.length >= 4) {
        // Extract photo type
        if (parts.includes('before')) {
          result.type = 'before';
        } else if (parts.includes('after')) {
          result.type = 'after';
        } else if (parts.includes('signature')) {
          result.type = 'signature';
        }

        // Extract IDs from parts - specific positions may vary
        for (let i = 0; i < parts.length; i++) {
          if (parts[i] === 'tech' && i + 1 < parts.length) {
            result.technicianId = parts[i + 1];
          }
          if (parts[i] === 'schedule' && i + 1 < parts.length) {
            result.scheduleId = parts[i + 1];
          }
        }

        // Job title is often the remaining parts, joined with underscores
        const typeIndex = parts.findIndex(
          (p) => p === 'before' || p === 'after' || p === 'signature'
        );
        if (typeIndex >= 0 && typeIndex < parts.length - 1) {
          result.jobTitle = parts
            .slice(typeIndex + 1)
            .join('_')
            .replace(/-/g, ' ');
        }
      }
    }

    return result;
  }

  /**
   * Upload a file to Cloudinary
   */
  async uploadFile(
    filename: string,
    data: ArrayBuffer,
    options?: {
      mediaType?: string;
    }
  ): Promise<void> {
    try {
      // Convert the ArrayBuffer to base64
      const base64Data = this.arrayBufferToBase64(data);

      // Extract photo type from filename if possible
      let type: 'before' | 'after' | 'signature' = 'before';
      let technicianId = '';
      let scheduleId = '';
      let jobTitle = '';
      let signerName = '';

      // Extract metadata from the filename if possible
      if (filename) {
        try {
          const metadata = this.extractMetadataFromFilename(filename);
          if (metadata.type) {
            type = metadata.type;
          }
          if (metadata.technicianId) {
            technicianId = metadata.technicianId;
          }
          if (metadata.scheduleId) {
            scheduleId = metadata.scheduleId;
          }
          if (metadata.jobTitle) {
            jobTitle = metadata.jobTitle;
          }
        } catch (e) {
          // Continue with defaults if extraction fails
        }
      }

      // Call the upload API with the extracted metadata
      await this.apiClient.uploadPhotos(
        [base64Data],
        type,
        technicianId,
        scheduleId,
        jobTitle,
        signerName
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Download a file from Cloudinary
   */
  async downloadFile(fileUri: string): Promise<Blob> {
    try {
      const response = await fetch(fileUri);

      if (!response.ok) {
        throw new Error(
          `Failed to download file: ${response.status} ${response.statusText}`
        );
      }

      return await response.blob();
    } catch (error) {
      throw new Error(
        `Error downloading file: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Delete a file from Cloudinary
   */
  async deleteFile(
    uri: string,
    options?: { filename?: string }
  ): Promise<void> {
    // Only handle http/https URLs
    if (!uri.startsWith('http')) {
      return;
    }

    try {
      // Extract scheduleId and type from options or filename
      let scheduleId = '';
      let type: 'before' | 'after' = 'before'; // Default to before

      if (options?.filename) {
        const metadata = this.extractMetadataFromFilename(options.filename);
        if (metadata.scheduleId) {
          scheduleId = metadata.scheduleId;
        }
        if (metadata.type === 'before' || metadata.type === 'after') {
          type = metadata.type;
        }
      }

      // If scheduleId is still empty, try to extract from URI
      if (!scheduleId) {
        // Simple extraction from URI if it contains schedule ID
        const match = uri.match(/schedule[_-]([^_-]+)/i);
        if (match && match[1]) {
          scheduleId = match[1];
        }
      }

      // If type is still default, try to detect from URI
      if (type === 'before') {
        if (uri.includes('_after_') || uri.includes('-after-')) {
          type = 'after';
        }
      }

      // Call the API to delete the photo
      await this.apiClient.deletePhoto(uri, type, scheduleId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Write a file to local storage
   */
  async writeFile(
    fileUri: string,
    data: string | ArrayBuffer,
    options?: { encoding?: FileSystem.EncodingType }
  ): Promise<void> {
    const { encoding = FileSystem.EncodingType.UTF8 } = options ?? {};

    // Create directory if needed
    const dir = fileUri.substring(0, fileUri.lastIndexOf('/'));
    if (dir) {
      await this.makeDir(dir);
    }

    if (typeof data === 'string') {
      await FileSystem.writeAsStringAsync(fileUri, data, { encoding });
    } else {
      const base64 = this.arrayBufferToBase64(data);
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  }

  /**
   * Read a file from storage
   */
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
      return this.base64ToArrayBuffer(fileContent);
    }
    return this.stringToArrayBuffer(fileContent);
  }

  /**
   * Check if a file exists
   */
  async fileExists(fileUri: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists;
  }

  /**
   * Create a directory
   */
  async makeDir(uri: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Copy a file
   */
  async copyFile(sourceUri: string, targetUri: string): Promise<void> {
    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });
  }

  /**
   * Get local URI from attachment path
   */
  getLocalUri(localPath: string): string {
    // If it's already a full URI, return as is
    if (localPath.startsWith('file://')) {
      return localPath;
    }

    return `${this.getUserStorageDirectory()}/${localPath}`;
  }

  /**
   * Get the storage directory for user data
   */
  getUserStorageDirectory(): string {
    return `${FileSystem.documentDirectory}attachments`;
  }

  /**
   * Convert string to ArrayBuffer
   */
  async stringToArrayBuffer(str: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(str);
    return uint8Array.buffer as ArrayBuffer;
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  async base64ToArrayBuffer(base64: string): Promise<ArrayBuffer> {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const binary = [];
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary.push(String.fromCharCode(bytes[i]));
    }
    return btoa(binary.join(''));
  }
}
