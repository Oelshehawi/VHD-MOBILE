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
const LOCAL_URL = 'http://192.168.1.128:3000'; // Replace with your machine's IP

// Environment configuration
const ENV = {
  PRODUCTION: {
    apiUrl: PROD_URL,
    powerSyncUrl:
      process.env.EXPO_PUBLIC_POWERSYNC_URL ||
      'https://679ff7c36bc62bf1f163ab46.powersync.journeyapps.com',
  },
  DEVELOPMENT: {
    apiUrl: LOCAL_URL,
    powerSyncUrl: 'http://192.168.1.128:8080', // Replace with your machine's IP
  },
};

// Global setting to control which environment to use
let CURRENT_ENV: 'PRODUCTION' | 'DEVELOPMENT' = 'DEVELOPMENT';

// Function to set which environment to use
export function setEnvironment(env: 'PRODUCTION' | 'DEVELOPMENT') {
  CURRENT_ENV = env;
  console.log(`Environment set to ${env}`);
  // Log the current URLs to help with debugging
  console.log(`API URL: ${ENV[CURRENT_ENV].apiUrl}`);
  console.log(`PowerSync URL: ${ENV[CURRENT_ENV].powerSyncUrl}`);
}

// Function to get current PowerSync URL
export function getPowerSyncUrl() {
  // If PowerSync URL is empty or invalid, use the production URL as fallback
  if (!ENV[CURRENT_ENV].powerSyncUrl) {
    console.warn('PowerSync URL is empty, using production URL as fallback');
    return ENV.PRODUCTION.powerSyncUrl;
  }
  return ENV[CURRENT_ENV].powerSyncUrl;
}

// Function to update local development IPs if needed
export function updateDevelopmentIPs(apiIp: string, powerSyncIp: string) {
  ENV.DEVELOPMENT.apiUrl = `http://${apiIp}:3000`;
  ENV.DEVELOPMENT.powerSyncUrl = `http://${powerSyncIp}:8080`;

  // If currently in development mode, log the updated URLs
  if (CURRENT_ENV === 'DEVELOPMENT') {
    console.log(`Updated Development API URL: ${ENV.DEVELOPMENT.apiUrl}`);
    console.log(
      `Updated Development PowerSync URL: ${ENV.DEVELOPMENT.powerSyncUrl}`
    );
  }
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

  async uploadPhotos(
    images: string[],
    type: 'before' | 'after' | 'signature',
    technicianId: string,
    jobTitle: string,
    scheduleId: string,
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
            scheduleId,
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
      throw error;
    }
  }
}
