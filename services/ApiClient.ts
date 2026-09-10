import { debugLogger } from '@/utils/DebugLogger';
import { getPersistentClerk } from './background/clerkBootstrap';
import { refreshBackgroundToken } from './background/BackgroundAuth';
import type { FetchLike, TokenProvider } from './network/types';
import type { MobileLocationEvent } from '@/types/locationTracking';

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

export interface LocationEventPostResult {
  eventId?: string;
  code?: string;
  retryAfterMs?: number;
  success: boolean;
  error?: string;
  statusCode?: number;
  retryable?: boolean;
  scheduleId?: string;
  jobDepartureConfirmed?: boolean;
  scheduleTrackingClosed?: boolean;
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
  private readonly fetchImpl: FetchLike;
  private readonly tokenProvider?: TokenProvider;
  private headers: Record<string, string>;

  constructor(
    token: string = '',
    options?: {
      fetchImpl?: FetchLike;
      tokenProvider?: TokenProvider;
    }
  ) {
    this.baseUrl = getApiUrl();
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.tokenProvider = options?.tokenProvider;
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
    if (this.tokenProvider) {
      try {
        const providedToken = await this.tokenProvider();
        if (providedToken) {
          this.headers.Authorization = `Bearer ${providedToken}`;
          debugLogger.debug('AUTH', 'ApiClient auth header set from token provider');
          return this.headers;
        }
      } catch {
        debugLogger.warn('AUTH', 'ApiClient token provider failed');
      }
      delete this.headers.Authorization;
      return { ...this.headers };
    }

    try {
      const clerk = getPersistentClerk();
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

  private isDroppableExpoPushTokenReject(table: string, error?: string, message?: string): boolean {
    if (table !== 'expopushtokens') return false;

    const normalizedMessage = (message || '').toLowerCase();
    return (
      error === 'STALE_PUSH_TOKEN_USER_MISMATCH' ||
      normalizedMessage.includes('userid must match the authenticated user') ||
      normalizedMessage.includes('your own push token')
    );
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
      const response = await this.fetchImpl(`${this.baseUrl}/api/sync`, {
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
      if (this.isDroppableExpoPushTokenReject(table, error, message)) {
        outcome = 'business_reject';
      } else if (response.status === 401 || response.status === 403) {
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

  // ============ LOCATION TRACKING EVENTS ============

  async postLocationEvent(event: MobileLocationEvent): Promise<LocationEventPostResult> {
    const [result] = await this.postLocationEventPayload(event, [event]);
    return result;
  }

  /**
   * Posts a whole batch in one request. Returns one result per input event,
   * aligned by index, so the caller can retry only the events that failed.
   * A backfilled trail is dozens of events; serial posting from a phone on a
   * weak connection is where those events get lost.
   */
  async postLocationEvents(events: MobileLocationEvent[]): Promise<LocationEventPostResult[]> {
    if (events.length === 0) {
      return [];
    }

    if (events.length === 1) {
      // Single-event body keeps the cheapest path unchanged.
      return this.postLocationEventPayload(events[0], events);
    }

    return this.postLocationEventPayload({ events }, events);
  }

  private async postLocationEventPayload(
    body: unknown,
    events: MobileLocationEvent[]
  ): Promise<LocationEventPostResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      let headers = await this.ensureAuthHeaders();
      if (!headers.Authorization) {
        return events.map(event => ({ eventId: event.eventId, success: false, retryable: true,
          statusCode: 0, code: 'AUTH_UNAVAILABLE', error: 'Waiting for authentication' }));
      }
      const send = () => this.fetchImpl(`${this.baseUrl}/api/mobile/location-events`, {
        method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal
      });
      let response = await send();
      if (response.status === 401) {
        const token = await refreshBackgroundToken();
        if (token) {
          // Recheck the outbox owner's provider after refreshing. A sign-in
          // change must never send the previous account's events as a new user.
          headers = this.tokenProvider ? await this.ensureAuthHeaders() : { ...headers, Authorization: `Bearer ${token}` };
          if (headers.Authorization) response = await send();
        }
      }
      let parsed: Record<string, unknown> | null = null;
      try {
        const value: unknown = JSON.parse(await response.text());
        if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>;
      } catch { /* An incomplete acknowledgement is retryable. */ }
      const retryHeader = response.headers?.get?.('Retry-After');
      const retryAfterMs = retryHeader ? (/^\d+$/.test(retryHeader)
        ? Number(retryHeader) * 1000 : Math.max(0, Date.parse(retryHeader) - Date.now())) : undefined;
      const batch = Array.isArray(parsed?.results) ? parsed.results : null;
      return events.map((event, index) => {
        const item: unknown = batch?.[index] ?? (events.length === 1 ? parsed : null);
        const result = item && typeof item === 'object' ? item as Record<string, unknown> : null;
        const matchesId = !event.eventId || result?.eventId === event.eventId;
        const acknowledged = result && matchesId && !result.error &&
          (result.stored === true || result.deduped === true || (!event.eventId && result.success === true));
        if (acknowledged) return {
          eventId: event.eventId, success: true, statusCode: response.status,
          scheduleId: typeof result.scheduleId === 'string' ? result.scheduleId : event.scheduleId,
          jobDepartureConfirmed: result.jobDepartureConfirmed === true,
          scheduleTrackingClosed: result.scheduleTrackingClosed === true
        };
        const status = typeof result?.status === 'number' ? result.status : response.status;
        const knownRejection = matchesId && typeof result?.error === 'string' && result.retryable === false;
        const httpPermanent = !response.ok && [400, 403, 404, 413, 422].includes(response.status) && !batch;
        return {
          eventId: event.eventId, success: false, statusCode: status,
          retryable: !(knownRejection || httpPermanent),
          code: typeof result?.code === 'string' ? result.code : `HTTP_${response.status}`,
          error: typeof result?.error === 'string' ? result.error : 'Missing or invalid location acknowledgement',
          retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined
        };
      });
    } catch (error) {
      return events.map(event => ({ eventId: event.eventId, success: false, retryable: true,
        statusCode: 0, code: 'TRANSPORT_ERROR',
        error: error instanceof Error ? error.message : 'Location upload failed' }));
    } finally { clearTimeout(timer); }
  }

  // ============ CLOUDINARY UPLOAD URL ============

  async postTrackingHealth(snapshot: unknown): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      let headers = await this.ensureAuthHeaders();
      if (!headers.Authorization) return false;
      const send = () => this.fetchImpl(`${this.baseUrl}/api/mobile/tracking-health`, {
        method: 'POST', headers, body: JSON.stringify(snapshot), signal: controller.signal
      });
      let response = await send();
      if (response.status === 401) {
        await refreshBackgroundToken();
        headers = await this.ensureAuthHeaders();
        if (!headers.Authorization) return false;
        response = await send();
      }
      return response.ok && (JSON.parse(await response.text()) as { success?: boolean }).success === true;
    } catch { return false; }
    finally { clearTimeout(timer); }
  }

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
      const response = await this.fetchImpl(`${this.baseUrl}/api/cloudinaryUpload`, {
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
    technicianId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!scheduleId || !technicianId) {
        return { success: false, error: 'Missing required fields' };
      }

      const headers = await this.ensureAuthHeaders();
      const response = await this.fetchImpl(`${this.baseUrl}/api/send-invoice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          scheduleId,
          technicianId
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
