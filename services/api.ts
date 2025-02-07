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

  async updatePhotos(
    photos: PhotoRequest[],
    type: 'before' | 'after' | 'signature',
    technicianId: string,
    jobTitle: string,
    invoiceId: string,
    signerName?: string,
    newImages?: string[]
  ) {
    try {

      const response = await fetch(`${this.baseUrl}/api/photos`, {
        method: 'POST',
        headers: {
          ...this.headers,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          photos,
          newImages,
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
            errorData.error ||
            `Server returned HTTP ${response.status}`
        );
      }

      const data = await response.json();


      return data;
    } catch (error) {
      console.error('❌ Error updating photos:', error);
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

      const data = await response.json();

      if (!response.ok) {
        console.error('Delete photo failed:', {
          status: response.status,
          error: data.error,
          details: data.details,
        });
        throw new Error(
          data.details ||
            data.error ||
            `Server returned HTTP ${response.status}`
        );
      }

      return data;
    } catch (error) {
      console.error('❌ Error deleting photo:', error);
      throw error;
    }
  }
}
