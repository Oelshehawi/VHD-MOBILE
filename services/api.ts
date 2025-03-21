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

// Interface for API responses
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  statusCode?: number;
}

// Interface for CloudinaryStorageAdapter
export interface CloudinaryStorageOptions {
  auth?: {
    persistSession: boolean;
    storage: any; // KVStorage interface
  };
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

// Determine if running in preview build or development
// For preview builds, use PRODUCTION, otherwise default to DEVELOPMENT
function isPreviewBuild(): boolean {
  // Check if running in EAS build environment or if the manifest indicates a preview build
  // Usually preview builds have specific environment variables or settings
  return (
    process.env.EAS_BUILD === 'true' ||
    process.env.EXPO_PUBLIC_RELEASE_CHANNEL?.includes('preview') ||
    process.env.EXPO_PUBLIC_APP_VARIANT?.includes('preview') ||
    // Check if we have production URLs configured but not local ones
    (!!process.env.EXPO_PUBLIC_API_URL && !__DEV__)
  );
}

// Global setting to control which environment to use - based on preview detection
let CURRENT_ENV: 'PRODUCTION' | 'DEVELOPMENT' = isPreviewBuild()
  ? 'PRODUCTION'
  : 'DEVELOPMENT';

// Function to explicitly set the environment (useful for testing)
export function setEnvironment(env: 'PRODUCTION' | 'DEVELOPMENT') {
  CURRENT_ENV = env;
  console.log(`Environment set to ${env}`);
  console.log(`API URL: ${ENV[CURRENT_ENV].apiUrl}`);
  console.log(`PowerSync URL: ${ENV[CURRENT_ENV].powerSyncUrl}`);
}

// Log environment on initialization
console.log(`App initialized in ${CURRENT_ENV} environment`);
console.log(`API URL: ${ENV[CURRENT_ENV].apiUrl}`);
console.log(`PowerSync URL: ${ENV[CURRENT_ENV].powerSyncUrl}`);

// Function to get current PowerSync URL
export function getPowerSyncUrl() {
  // If PowerSync URL is empty or invalid, use the production URL as fallback
  if (!ENV[CURRENT_ENV].powerSyncUrl) {
    console.warn('PowerSync URL is empty, using production URL as fallback');
    return ENV.PRODUCTION.powerSyncUrl;
  }
  return ENV[CURRENT_ENV].powerSyncUrl;
}

// Function to get API URL
export function getApiUrl() {
  return ENV[CURRENT_ENV].apiUrl;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly headers: Record<string, string>;
  private readonly cloudinaryUrl?: string;
  private readonly storageOptions?: CloudinaryStorageOptions;

  constructor(
    tokenOrCloudinaryUrl: string,
    options?: CloudinaryStorageOptions
  ) {
    this.baseUrl = ENV[CURRENT_ENV].apiUrl;

    // If options are provided, we're in CloudinaryStorageAdapter context
    if (options) {
      this.cloudinaryUrl = tokenOrCloudinaryUrl;
      this.token = ''; // Will be set later via fetchCredentials
      this.storageOptions = options;
      this.headers = {
        'Content-Type': 'application/json',
      };
    } else {
      // Regular API client with token
      this.token = tokenOrCloudinaryUrl;
      this.headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      };
    }

    console.log(`ApiClient initialized with baseUrl: ${this.baseUrl}`);
  }

  // Method for CloudinaryStorageAdapter to get upload URL
  async getUploadUrl<T>(
    path: string,
    options: { body: { fileName: string; mediaType?: string } }
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/cloudinary-upload`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(options.body),
      });

      if (!response.ok) {
        return {
          error: `HTTP error: ${response.status}`,
          statusCode: response.status,
        };
      }

      const data = await response.json();
      return { data: data as T };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Method for CloudinaryStorageAdapter to get download URL
  async getDownloadUrl<T>(
    path: string,
    options: { body: { fileName: string } }
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/cloudinary-download`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(options.body),
      });

      if (!response.ok) {
        return {
          error: `HTTP error: ${response.status}`,
          statusCode: response.status,
        };
      }

      const data = await response.json();
      return { data: data as T };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Method for CloudinaryStorageAdapter to get delete URL
  async getDeleteUrl<T>(
    path: string,
    options: { body: { fileName: string } }
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/cloudinary-delete`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(options.body),
      });

      if (!response.ok) {
        return {
          error: `HTTP error: ${response.status}`,
          statusCode: response.status,
        };
      }

      const data = await response.json();
      return { data: data as T };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Method for use in BackendConnector
  from(table: string) {
    // Simple implementation to match BackendConnector's usage
    return {
      upsert: async (record: any) => {
        try {
          // Implementation will depend on your backend API
          const response = await fetch(`${this.baseUrl}/api/${table}`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(record),
          });

          if (!response.ok) {
            return { error: `HTTP error: ${response.status}` };
          }

          return await response.json();
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
      update: (data: any) => {
        return {
          eq: async (field: string, value: string) => {
            try {
              const response = await fetch(
                `${this.baseUrl}/api/${table}?${field}=${value}`,
                {
                  method: 'PATCH',
                  headers: this.headers,
                  body: JSON.stringify(data),
                }
              );

              if (!response.ok) {
                return { error: `HTTP error: ${response.status}` };
              }

              return await response.json();
            } catch (error) {
              return {
                error: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          },
        };
      },
      delete: () => {
        return {
          eq: async (field: string, value: string) => {
            try {
              const response = await fetch(
                `${this.baseUrl}/api/${table}?${field}=${value}`,
                {
                  method: 'DELETE',
                  headers: this.headers,
                }
              );

              if (!response.ok) {
                return { error: `HTTP error: ${response.status}` };
              }

              return await response.json();
            } catch (error) {
              return {
                error: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          },
        };
      },
      select: (columns: string) => {
        return {
          eq: async (field: string, value: string) => {
            try {
              const response = await fetch(
                `${this.baseUrl}/api/${table}?${field}=${value}&select=${columns}`,
                {
                  method: 'GET',
                  headers: this.headers,
                }
              );

              if (!response.ok) {
                return {
                  error: `HTTP error: ${response.status}`,
                  data: null,
                };
              }

              const data = await response.json();
              return { data, error: null };
            } catch (error) {
              return {
                error: error instanceof Error ? error.message : 'Unknown error',
                data: null,
              };
            }
          },
          single: function () {
            return this; // Just return the same object with eq method
          },
        };
      },
    };
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

  /**
   * Update photos in the database after they've been uploaded to Cloudinary
   * @param photos Array of photo objects with URLs and metadata
   * @param type Type of photos (before/after/signature)
   * @param scheduleId ID of the schedule to update
   * @param signerName Optional signer name for signature types
   * @returns Result of the update operation
   */
  async updatePhotos(
    photos: Array<{
      id: string;
      url: string;
      timestamp: string | Date;
      technicianId: string;
      type: 'before' | 'after' | 'signature';
    }>,
    type: 'before' | 'after' | 'signature',
    scheduleId: string,
    signerName?: string
  ) {
    try {
      // Skip empty arrays
      if (!photos || photos.length === 0) {
        return { success: true, photos: [] };
      }

      const requestBody = {
        scheduleId,
        photos,
        type,
        signerName,
      };

      // Make API call to update photos
      const response = await fetch(`${this.baseUrl}/api/update-photos`, {
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
            `Update failed with status ${response.status}`
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
