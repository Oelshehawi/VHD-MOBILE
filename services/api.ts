import { PhotoType } from '@/types';
import Constants from 'expo-constants';

// Extend PhotoType to include signature-specific fields
export interface PhotoRequest {
  _id?: string;
  id?: string;
  url: string;
  timestamp: string | Date;
  technicianId: string;
  type: 'before' | 'after' | 'signature';
  status?: string;
  signerName?: string;
}

const PROD_URL = 'https://vhd-psi.vercel.app';

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly headers: Record<string, string>;

  constructor(token: string) {
    this.baseUrl = PROD_URL;
    this.token = token;
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  async uploadPhotos(
    images: string[],
    type: 'before' | 'after' | 'signature',
    technicianId: string,
    jobTitle: string,
    invoiceId: string,
    signerName?: string
  ) {
    try {
      // Split images into smaller batches of 2 to avoid 413 errors
      const BATCH_SIZE = 2;
      const batches = [];
      for (let i = 0; i < images.length; i += BATCH_SIZE) {
        batches.push(images.slice(i, i + BATCH_SIZE));
      }

      const allResults = [];
      for (const [index, batch] of batches.entries()) {
        const response = await fetch(`${this.baseUrl}/api/upload`, {
          method: 'POST',
          headers: {
            ...this.headers,
            Accept: 'application/json',
          },
          body: JSON.stringify({
            images: batch,
            type,
            technicianId,
            jobTitle,
            invoiceId,
            ...(signerName && { signerName }),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.details ||
              errorData.error?.message ||
              `Server returned HTTP ${response.status}`
          );
        }

        const result = await response.json();
        allResults.push(result);
      }

      // Combine all batch results
      return {
        data: allResults.flatMap((r) => r.data || []),
        success: true,
      };
    } catch (error) {
      console.error('Error uploading photos:', error);
      throw error;
    }
  }

  async deletePhoto(
    photoUrl: string,
    type: 'before' | 'after',
    invoiceId: string
  ) {
    try {
      const response = await fetch(`${this.baseUrl}/api/deletePhoto`, {
        method: 'DELETE',
        headers: this.headers,
        body: JSON.stringify({
          photoUrl,
          type,
          invoiceId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.details ||
            errorData.error ||
            `Server returned HTTP ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error deleting photo:', error);
      throw error;
    }
  }
}
