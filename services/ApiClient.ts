import { debugLogger } from '@/utils/DebugLogger';
import { getClerkInstance } from '@clerk/clerk-expo';

// API Response interface
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  statusCode?: number;
}

interface SyncResponseBody {
  success?: boolean;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
}

type SyncHttpMethod = 'PUT' | 'PATCH' | 'DELETE' | 'POST';

export type SyncOutcome = 'success' | 'business_reject' | 'retryable_error' | 'auth_pause';

export interface SyncOperationResult {
  outcome: SyncOutcome;
  method: SyncHttpMethod;
  table: string;
  id?: string;
  httpStatus: number;
  success?: boolean;
  error?: string;
  message?: string;
}

const PROD_URL = process.env.EXPO_PUBLIC_API_URL || '';

export function getApiUrl() {
  return PROD_URL;
}

export function getPowerSyncUrl() {
  return process.env.EXPO_PUBLIC_POWERSYNC_URL || '';
}

export class ApiClient {
  private readonly baseUrl: string;
  private headers: Record<string, string>;

  constructor(token: string = '') {
    this.baseUrl = getApiUrl();
    this.headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };

    debugLogger.info('NETWORK', 'ApiClient initialized', {
      baseUrl: this.baseUrl
    });
  }

  setToken(token: string) {
    this.headers.Authorization = `Bearer ${token}`;
  }

  private async ensureAuthHeaders(): Promise<Record<string, string>> {
    try {
      const clerk = getClerkInstance({
        publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
      });
      const token = await clerk?.session?.getToken({
        template: 'Powersync',
        skipCache: false
      });
      if (token) {
        this.headers.Authorization = `Bearer ${token}`;
        debugLogger.debug('AUTH', 'ApiClient auth header set');
      } else {
        debugLogger.warn('AUTH', 'ApiClient missing auth token');
      }
    } catch {
      // If token fetch fails, proceed without auth header.
      debugLogger.warn('AUTH', 'ApiClient token fetch failed');
    }

    return this.headers;
  }

  // ============ SYNC OPERATIONS (PowerSync canonical pattern) ============

  private parseSyncBody(text: string): SyncResponseBody {
    if (!text) return {};

    try {
      const parsed = JSON.parse(text) as SyncResponseBody;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return { message: text };
    }
  }

  private getSyncId(payload: { data?: any }): string | undefined {
    if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      return typeof payload.data.id === 'string' ? payload.data.id : undefined;
    }

    if (Array.isArray(payload?.data) && payload.data.length > 0) {
      const firstId = payload.data[0]?.id;
      return typeof firstId === 'string' ? firstId : undefined;
    }

    return undefined;
  }

  private logSyncFailure(result: SyncOperationResult) {
    debugLogger.warn('SYNC', 'Sync API non-success response', {
      method: result.method,
      table: result.table,
      id: result.id,
      httpStatus: result.httpStatus,
      success: result.success,
      error: result.error,
      message: result.message
    });
  }

  private async requestSync(
    method: SyncHttpMethod,
    payload: {
      table: string;
      data: any;
      operation?: string;
    }
  ): Promise<SyncOperationResult> {
    const table = payload.table;
    const id = this.getSyncId(payload);

    try {
      const headers = await this.ensureAuthHeaders();
      const response = await fetch(`${this.baseUrl}/api/sync`, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      const rawBody = await response.text();
      const parsedBody = this.parseSyncBody(rawBody);
      const success = parsedBody.success;
      const error = parsedBody.error;
      const message = parsedBody.message;

      let outcome: SyncOutcome = 'success';
      if (response.status === 401 || response.status === 403) {
        outcome = 'auth_pause';
      } else if (response.status === 429 || response.status >= 500) {
        outcome = 'retryable_error';
      } else if (response.ok) {
        outcome = success === false ? 'business_reject' : 'success';
      } else if (response.status >= 400 && response.status < 500) {
        outcome = 'business_reject';
      } else {
        outcome = 'retryable_error';
      }

      const result: SyncOperationResult = {
        outcome,
        method,
        table,
        id,
        httpStatus: response.status,
        success,
        error: error || (!response.ok ? `HTTP ${response.status}` : undefined),
        message: message || (!response.ok ? rawBody || 'Request failed' : undefined)
      };

      if (result.outcome !== 'success') {
        this.logSyncFailure(result);
      }

      return result;
    } catch (error) {
      const result: SyncOperationResult = {
        outcome: 'retryable_error',
        method,
        table,
        id,
        httpStatus: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Network or transport failure'
      };
      this.logSyncFailure(result);
      return result;
    }
  }

  async upsert(record: { table: string; data: any }): Promise<SyncOperationResult> {
    return this.requestSync('PUT', record);
  }

  async update(record: { table: string; data: any }): Promise<SyncOperationResult> {
    return this.requestSync('PATCH', record);
  }

  async delete(record: { table: string; data: { id: string } }): Promise<SyncOperationResult> {
    return this.requestSync('DELETE', record);
  }

  async batchUpsert(
    table: string,
    records: Record<string, unknown>[]
  ): Promise<SyncOperationResult> {
    return this.requestSync('POST', {
      table,
      operation: 'batchPut',
      data: records
    });
  }

  async batchPatch(
    table: string,
    records: Record<string, unknown>[]
  ): Promise<SyncOperationResult> {
    return this.requestSync('PATCH', {
      table,
      operation: 'batchPatch',
      data: records
    });
  }

  // ============ CLOUDINARY UPLOAD URL ============

  async getUploadUrl<T>(
    _path: string,
    options: {
      body: {
        fileName: string;
        jobTitle?: string;
        type?: string;
        startDate?: string;
        mediaType?: string;
      };
    }
  ): Promise<ApiResponse<T>> {
    try {
      const headers = await this.ensureAuthHeaders();
      const response = await fetch(`${this.baseUrl}/api/cloudinaryUpload`, {
        method: 'POST',
        headers,
        body: JSON.stringify(options.body)
      });

      if (!response.ok) {
        return {
          error: `HTTP error: ${response.status}`,
          statusCode: response.status
        };
      }

      const data = await response.json();
      return { data: data as T };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============ INVOICE OPERATIONS ============

  async sendInvoice(
    scheduleId: string,
    invoiceRef: string,
    invoiceData: any,
    technicianId: string,
    isComplete: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!scheduleId || !invoiceRef) {
        return { success: false, error: 'Missing required fields' };
      }

      const headers = await this.ensureAuthHeaders();
      const response = await fetch(`${this.baseUrl}/api/send-invoice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          scheduleId,
          invoiceRef,
          invoiceData,
          technicianId,
          isComplete
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = {
            error: errorText || `HTTP status ${response.status}`
          };
        }

        return {
          success: false,
          error:
            errorData.message ||
            errorData.error ||
            errorData.details ||
            `Send failed with status ${response.status}`
        };
      }

      const result = await response.json();
      return { success: true, ...result };
    } catch (error) {
      // For network errors, indicate retry
      if (error instanceof TypeError && error.message.includes('Network request failed')) {
        return {
          success: false,
          error: 'Network error, will retry later'
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
