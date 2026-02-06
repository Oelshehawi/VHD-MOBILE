import { File, Directory, Paths } from 'expo-file-system';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { StorageAdapter } from '@powersync/attachments';
import { ApiClient } from '../ApiClient';

interface CloudinaryUpload {
  apiKey: string;
  timestamp: string;
  signature: string;
  cloudName: string;
  folderPath: string;
}

export class CloudinaryStorageAdapter implements StorageAdapter {
  constructor(public client: ApiClient) {}

  async getSignedUploadUrl(fileName: string, mediaType?: string): Promise<CloudinaryUpload> {
    const response = await this.client.getUploadUrl<CloudinaryUpload>('cloudinary-upload', {
      body: {
        fileName,
        mediaType,
        jobTitle: '',
        type: '',
        startDate: ''
      }
    });

    if (response.error || !response.data) {
      throw new Error(response.error || 'Failed to fetch upload URL');
    }

    return response.data;
  }

  async uploadFile(
    filename: string,
    _data: ArrayBuffer,
    _options?: { mediaType?: string }
  ): Promise<void> {
    throw new Error(`Direct uploads are handled by PhotoAttachmentQueue (file: ${filename})`);
  }

  async downloadFile(filePath: string): Promise<Blob> {
    const response = await fetch(filePath, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    return await response.blob();
  }

  async deleteFile(uri: string): Promise<void> {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  }

  async readFile(
    fileURI: string,
    options?: { encoding?: 'utf8' | 'base64'; mediaType?: string }
  ): Promise<ArrayBuffer> {
    const { encoding = 'utf8' } = options ?? {};
    const file = new File(fileURI);
    if (!file.exists) {
      throw new Error(`File does not exist: ${fileURI}`);
    }
    const fileContent = await file.text();
    if (encoding === 'base64') {
      return await this.base64ToArrayBuffer(fileContent);
    }
    return await this.stringToArrayBuffer(fileContent);
  }

  async writeFile(
    fileURI: string,
    base64Data: string,
    options?: { encoding?: 'utf8' | 'base64' }
  ): Promise<void> {
    const { encoding = 'utf8' } = options ?? {};
    const file = new File(fileURI);
    file.write(base64Data, { encoding });
  }

  async fileExists(fileURI: string): Promise<boolean> {
    return new File(fileURI).exists;
  }

  async makeDir(uri: string): Promise<void> {
    const directory = new Directory(uri);
    if (!directory.exists) {
      directory.create();
    }
  }

  async copyFile(sourceUri: string, targetUri: string): Promise<void> {
    const sourceFile = new File(sourceUri);
    const targetFile = new File(targetUri);
    sourceFile.copy(targetFile);
  }

  getUserStorageDirectory(): string {
    return Paths.document.uri;
  }

  async stringToArrayBuffer(str: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer as ArrayBuffer;
  }

  async base64ToArrayBuffer(base64: string): Promise<ArrayBuffer> {
    return decodeBase64(base64);
  }
}
