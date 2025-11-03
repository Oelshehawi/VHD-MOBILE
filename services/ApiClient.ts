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
const LOCAL_URL = 'http://192.168.1.131:3000'; // Replace with your machine's IP

// Environment configuration
const ENV = {
  PRODUCTION: {
    apiUrl: PROD_URL,
    powerSyncUrl: process.env.EXPO_PUBLIC_POWERSYNC_URL,
  },
  DEVELOPMENT: {
    apiUrl: LOCAL_URL,
    powerSyncUrl: process.env.EXPO_PUBLIC_POWERSYNC_URL,
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
  private token: string;
  private headers: Record<string, string>;
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
    options: {
      body: {
        fileName: string;
        jobTitle: string;
        type: string;
        startDate: string;
        mediaType?: string;
      };
    }
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/cloudinaryUpload`, {
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
    options: { body: { cloudinaryUrl: string } }
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
          // Special handling for add_photo_operations - use the update-photos endpoint
          if (table === 'add_photo_operations') {
            return await this.processPhotoAddOperation(record);
          }

          // Special handling for delete_photo_operations - use the delete-photo endpoint
          if (table === 'delete_photo_operations') {
            return await this.processPhotoDeleteOperation(record);
          }

          // Special handling for availability table
          if (table === 'availabilities') {
            return await this.updateAvailability(
              record.technicianId || '',
              {
                availabilityId: record.id,
                startTime: record.startTime || '',
                endTime: record.endTime || '',
                isFullDay: record.isFullDay ? true : false,
                isRecurring: record.isRecurring ? true : false,
                dayOfWeek: record.dayOfWeek,
                specificDate: record.specificDate,
              }
            );
          }

          // Special handling for timeoffRequests table
          if (table === 'timeoffrequests') {
            return await this.requestTimeOff(
              record.technicianId || '',
              record.startDate || '',
              record.endDate || '',
              record.reason || ''
            );
          }

          // Default handling for other tables
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
              // Special handling for schedules table with technician notes updates
              if (table === 'schedules' && data.technicianNotes !== undefined) {
                return await this.updateTechnicianNotes(
                  value,
                  data.technicianNotes
                );
              }

              // Special handling for availability updates - use unified endpoint
              if (table === 'availabilities') {
                const response = await fetch(`${this.baseUrl}/api/availability`, {
                  method: 'PATCH',
                  headers: this.headers,
                  body: JSON.stringify({ ...data, id: value }),
                });

                if (!response.ok) {
                  return { error: `HTTP error: ${response.status}` };
                }

                return await response.json();
              }

              // Special handling for timeoffRequests updates - use unified endpoint
              if (table === 'timeoffrequests') {
                const response = await fetch(`${this.baseUrl}/api/timeoff`, {
                  method: 'PATCH',
                  headers: this.headers,
                  body: JSON.stringify({ ...data, id: value }),
                });

                if (!response.ok) {
                  return { error: `HTTP error: ${response.status}` };
                }

                return await response.json();
              }

              // Default handling for other updates
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
              // Special handling for availability deletes - use unified endpoint
              if (table === 'availabilities') {
                const response = await fetch(`${this.baseUrl}/api/availability`, {
                  method: 'DELETE',
                  headers: this.headers,
                  body: JSON.stringify({ id: value }),
                });

                if (!response.ok) {
                  return { error: `HTTP error: ${response.status}` };
                }

                return await response.json();
              }

              // Special handling for timeoffRequests deletes - use unified endpoint
              if (table === 'timeoffrequests') {
                const response = await fetch(`${this.baseUrl}/api/timeoff`, {
                  method: 'DELETE',
                  headers: this.headers,
                  body: JSON.stringify({ id: value }),
                });

                if (!response.ok) {
                  return { error: `HTTP error: ${response.status}` };
                }

                return await response.json();
              }

              // Default handling for other deletes
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
   * Update photos in the database after they've been uploaded to Cloudinary
   * @param cloudinaryUrl URL of the uploaded photo
   * @param type Type of photo (before/after)
   * @param scheduleId ID of the schedule to update
   * @param technicianId ID of the technician who took the photo
   * @param timestamp When the photo was taken
   * @returns Result of the update operation
   */
  async updatePhotos(
    cloudinaryUrl: string,
    type: 'before' | 'after',
    scheduleId: string,
    technicianId: string,
    timestamp: string,
    signerName?: string
  ) {
    try {
      if (!cloudinaryUrl || !scheduleId) {
        return { success: false, error: 'Missing required fields' };
      }

      const requestBody = {
        scheduleId,
        cloudinaryUrl,
        type,
        technicianId,
        timestamp,
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
        };
      }

      throw error;
    }
  }

  // Add method to update token
  setToken(newToken: string) {
    this.token = newToken;
    this.headers = {
      ...this.headers,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  /**
   * Process a record from the add_photo_operations table
   * This method translates the add_photo_operations record into a call to updatePhotos
   * @param record The record from add_photo_operations table
   * @returns Result of the update operation
   */
  async processPhotoAddOperation(record: any) {
    try {
      if (!record.scheduleId || !record.cloudinaryUrl || !record.type) {
        return {
          success: false,
          error: 'Missing required fields in record',
        };
      }

      // Simply pass the fields directly to updatePhotos
      return await this.updatePhotos(
        record.cloudinaryUrl,
        record.type as 'before' | 'after',
        record.scheduleId,
        record.technicianId || '',
        record.timestamp || new Date().toISOString(),
        record.signerName || ''
      );
    } catch (error) {
      console.error('Error processing photo add operation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process a record from the delete_photo_operations table
   * This method sends a delete request to the delete-photo endpoint
   * which handles both Cloudinary and database deletion
   * @param record The record from delete_photo_operations table
   * @returns Result of the delete operation
   */
  async processPhotoDeleteOperation(record: any) {
    try {
      if (!record.scheduleId || !record.remote_uri) {
        return {
          success: false,
          error: 'Missing required fields in record',
        };
      }

      // Send the delete request to the unified endpoint
      const response = await fetch(`${this.baseUrl}/api/deletePhoto`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          scheduleId: record.scheduleId,
          cloudinaryUrl: record.remote_uri,
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

      console.error('Error processing photo delete operation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send invoice via email
   * @param scheduleId ID of the schedule
   * @param invoiceRef Reference to the invoice
   * @param invoiceData Invoice data object
   * @param technicianId ID of the technician
   * @param isComplete Whether work documentation is complete
   * @returns Result of the send operation
   */
  async sendInvoice(
    scheduleId: string,
    invoiceRef: string,
    invoiceData: any,
    technicianId: string,
    isComplete: boolean
  ) {
    try {
      if (!scheduleId || !invoiceRef) {
        return { success: false, error: 'Missing required fields' };
      }

      const requestBody = {
        scheduleId,
        invoiceRef,
        invoiceData,
        technicianId,
        isComplete,
      };

      // Make API call to send invoice
      const response = await fetch(`${this.baseUrl}/api/send-invoice`, {
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
          errorData.message ||
            errorData.error ||
            errorData.details ||
            `Send failed with status ${response.status}`
        );
      }

      const result = await response.json();
      return { success: true, ...result };
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
   * Update technician notes for a schedule
   * @param scheduleId ID of the schedule to update
   * @param technicianNotes New technician notes content
   * @returns Result of the update operation
   */
  async updateTechnicianNotes(scheduleId: string, technicianNotes: string) {
    try {
      if (!scheduleId) {
        return { success: false, error: 'Missing required fields' };
      }

      const requestBody = {
        scheduleId,
        technicianNotes,
      };

      // Make API call to update technician notes
      const response = await fetch(
        `${this.baseUrl}/api/updateTechnicianNotes`,
        {
          method: 'POST',
          headers: {
            ...this.headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

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
        };
      }

      throw error;
    }
  }

  /**
   * Update technician availability
   * @param technicianId ID of the technician
   * @param availabilityData Availability data including times and recurrence pattern
   * @returns Result of the update operation
   */
  async updateAvailability(
    technicianId: string,
    availabilityData: {
      availabilityId?: string;
      startTime: string;
      endTime: string;
      isFullDay: boolean;
      isRecurring: boolean;
      dayOfWeek?: number;
      specificDate?: string;
    }
  ) {
    try {
      if (!technicianId || !availabilityData.startTime || !availabilityData.endTime) {
        return { success: false, error: 'Missing required fields' };
      }

      const requestBody = {
        technicianId,
        ...availabilityData,
      };

      // Make API call to update availability
      const response = await fetch(`${this.baseUrl}/api/availability`, {
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
      return { success: true, ...result };
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
   * Request time off
   * @param technicianId ID of the technician
   * @param startDate Start date in ISO format
   * @param endDate End date in ISO format
   * @param reason Reason for time off request
   * @returns Result of the request operation
   */
  async requestTimeOff(
    technicianId: string,
    startDate: string,
    endDate: string,
    reason: string
  ) {
    try {
      if (!technicianId || !startDate || !endDate || !reason) {
        return { success: false, error: 'Missing required fields' };
      }

      const requestBody = {
        technicianId,
        startDate,
        endDate,
        reason,
      };

      // Make API call to request time off
      const response = await fetch(`${this.baseUrl}/api/timeoff`, {
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
            `Request failed with status ${response.status}`
        );
      }

      const result = await response.json();
      return { success: true, ...result };
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
}
