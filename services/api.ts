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

const PROD_URL = process.env.EXPO_PUBLIC_API_URL || '';
const LOCAL_URL = 'http://192.168.1.128:3000'; // Replace with your machine's IP

// Environment configuration
const ENV = {
  PRODUCTION: {
    apiUrl: PROD_URL,
    powerSyncUrl: process.env.EXPO_PUBLIC_POWERSYNC_URL,
  },
  DEVELOPMENT: {
    apiUrl: LOCAL_URL,
    powerSyncUrl: 'http://192.168.1.128:8080',
  },
};

// Global setting to control which environment to use
let CURRENT_ENV: 'PRODUCTION' | 'DEVELOPMENT' = 'DEVELOPMENT'; // Set default to PRODUCTION for preview builds


// Function to get current PowerSync URL
export function getPowerSyncUrl() {
  // If PowerSync URL is empty or invalid, use the production URL as fallback
  if (!ENV[CURRENT_ENV].powerSyncUrl) {
    console.warn('PowerSync URL is empty, using production URL as fallback');
    return ENV.PRODUCTION.powerSyncUrl;
  }
  return ENV[CURRENT_ENV].powerSyncUrl;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly headers: Record<string, string>;

  constructor(token: string) {
    this.baseUrl = ENV[CURRENT_ENV].apiUrl;
    this.token = token;
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    console.log(`ApiClient initialized with baseUrl: ${this.baseUrl}`);
  }

  /**
   * Delete a photo from Cloudinary
   * @param photoUrl URL of the photo to delete
   * @param type Type of photo (before/after)
   * @param scheduleId ID of the schedule
   * @returns Delete result
   */
  async deletePhoto(
    photoUrl: string,
    type: 'before' | 'after',
    scheduleId: string
  ) {
    if (!photoUrl.startsWith('http')) {
      // For local photos, we don't need to delete from Cloudinary
      return { success: true };
    }

    try {
      // Make API call to delete photo - using DELETE method
      const response = await fetch(`${this.baseUrl}/api/deletePhoto`, {
        method: 'DELETE',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          photoUrl,
          type,
          scheduleId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText || `HTTP status ${response.status}` };
        }

        throw new Error(
          errorData.details ||
            errorData.error ||
            errorData.message ||
            `Delete failed with status ${response.status}`
        );
      }

      const result = await response.json();
      return result;
    } catch (error) {
      // For network errors, indicate that the operation should be retried
      if (
        error instanceof TypeError &&
        error.message.includes('Network request failed')
      ) {
        return {
          success: false,
          error: 'Network error, will retry later',
          shouldRetry: true,
        };
      }

      throw error;
    }
  }

  /**
   * Upload photos to Cloudinary
   */
  async uploadPhotos(
    images: string[],
    type: 'before' | 'after' | 'signature',
    technicianId: string,
    jobTitle: string,
    scheduleId: string,
    signerName?: string,
    photoId?: string
  ) {
    try {
      // Skip empty arrays
      if (!images || images.length === 0) {
        return { success: true, photos: [] };
      }

      // Ensure all data is properly initialized
      if (!technicianId) technicianId = 'unknown';
      if (!jobTitle) jobTitle = 'unknown';
      if (!scheduleId) scheduleId = 'unknown';

      const requestBody = {
        images,
        type,
        technicianId,
        jobTitle,
        scheduleId,
        signerName,
        photoId,
      };

      // Make API call
      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText || `HTTP status ${response.status}` };
        }

        throw new Error(
          errorData.details ||
            errorData.error ||
            errorData.message ||
            `Upload failed with status ${response.status}`
        );
      }

      const result = await response.json();
      return result;
    } catch (error) {
      // For network errors, indicate that the operation should be retried
      if (
        error instanceof TypeError &&
        error.message.includes('Network request failed')
      ) {
        return {
          success: false,
          error: 'Network error, will retry later',
          shouldRetry: true,
          photos: [],
        };
      }

      throw error;
    }
  }
}
