import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  CrudEntry,
  UpdateType
} from '@powersync/react-native';
import { ApiClient } from '../ApiClient';
import { getClerkInstance } from '@clerk/clerk-expo';
import { CloudinaryStorageAdapter } from '../storage/CloudinaryStorageAdapter';
import { System } from './System';
import { debugLogger } from '@/utils/DebugLogger';

/// HTTP status codes that indicate non-retryable errors
const FATAL_HTTP_STATUS_PATTERN = /: (401|403|404|422) -/;

export class BackendConnector implements PowerSyncBackendConnector {
  private apiClient: ApiClient;
  storage: CloudinaryStorageAdapter;
  private endpoint: string = '';
  private readonly PHOTO_BATCH_SIZE = 10;

  constructor(protected system: System) {
    this.apiClient = new ApiClient();
    this.storage = new CloudinaryStorageAdapter(this.apiClient);
  }

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
  }

  async fetchCredentials(retryCount = 0): Promise<{ endpoint: string; token: string } | null> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    debugLogger.debug(
      'AUTH',
      `fetchCredentials started (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`
    );

    try {
      const clerk = getClerkInstance({
        publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
      });

      if (!clerk?.session) {
        debugLogger.warn('AUTH', 'No Clerk session available');
        if (retryCount < MAX_RETRIES) {
          debugLogger.debug('AUTH', `Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return this.fetchCredentials(retryCount + 1);
        }
        debugLogger.error('AUTH', 'No Clerk session after max retries');
        return null;
      }

      debugLogger.debug('AUTH', 'Fetching token from Clerk');
      const token = await clerk.session.getToken({
        template: 'Powersync',
        skipCache: false
      });

      if (!token) {
        debugLogger.warn('AUTH', 'No token received from Clerk');
        if (retryCount < MAX_RETRIES) {
          debugLogger.debug('AUTH', `Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return this.fetchCredentials(retryCount + 1);
        }
        debugLogger.error('AUTH', 'No token after max retries');
        return null;
      }

      if (__DEV__) {
        debugLogger.debug('AUTH', 'Clerk token', { token });
      }

      if (!this.endpoint) {
        debugLogger.error('AUTH', 'No endpoint configured');
        return null;
      }

      this.apiClient.setToken(token);

      debugLogger.info('AUTH', 'fetchCredentials success');
      return {
        endpoint: this.endpoint,
        token
      };
    } catch (error) {
      debugLogger.error('AUTH', 'fetchCredentials error', {
        error: error instanceof Error ? error.message : String(error)
      });
      if (retryCount < MAX_RETRIES) {
        debugLogger.debug('AUTH', `Retrying after error in ${RETRY_DELAY_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return this.fetchCredentials(retryCount + 1);
      }
      return null;
    }
  }

  /**
   * Parse JSON string fields in reports back to objects for MongoDB
   */
  private parseReportJsonFields<T extends Record<string, any>>(data: T): T {
    const result: Record<string, any> = { ...data };

    // Parse cleaningDetails if it's a string
    if (typeof result.cleaningDetails === 'string') {
      try {
        result.cleaningDetails = JSON.parse(result.cleaningDetails);
      } catch {
        debugLogger.warn('SYNC', 'Failed to parse cleaningDetails JSON');
      }
    }

    // Parse inspectionItems if it's a string
    if (typeof result.inspectionItems === 'string') {
      try {
        result.inspectionItems = JSON.parse(result.inspectionItems);
      } catch {
        debugLogger.warn('SYNC', 'Failed to parse inspectionItems JSON');
      }
    }

    return result as T;
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastOp: CrudEntry | null = null;
    const photoPutOps: CrudEntry[] = [];
    const photoPatchOps: CrudEntry[] = [];

    try {
      for (const op of transaction.crud) {
        lastOp = op;
        if (op.table === 'photos' && op.op === UpdateType.PUT) {
          photoPutOps.push(op);
          continue;
        }
        if (op.table === 'photos' && op.op === UpdateType.PATCH) {
          photoPatchOps.push(op);
          continue;
        }

        // Parse JSON fields for reports table before sending to backend
        let data = { ...op.opData, id: op.id };
        if (op.table === 'reports') {
          data = this.parseReportJsonFields(data);
        }

        const record = {
          table: op.table,
          data
        };

        switch (op.op) {
          case UpdateType.PUT:
            await this.apiClient.upsert(record);
            break;
          case UpdateType.PATCH:
            await this.apiClient.update(record);
            break;
          case UpdateType.DELETE:
            await this.apiClient.delete({
              table: op.table,
              data: { id: op.id }
            });
            break;
        }

        debugLogger.info('SYNC', `Synced ${op.table} record`, {
          id: op.id
        });
      }

      if (photoPutOps.length > 0) {
        lastOp = photoPutOps[photoPutOps.length - 1] ?? lastOp;
        const records = photoPutOps.map((op) => ({
          ...op.opData,
          id: op.id
        }));

        for (let i = 0; i < records.length; i += this.PHOTO_BATCH_SIZE) {
          const chunk = records.slice(i, i + this.PHOTO_BATCH_SIZE);
          await this.apiClient.batchUpsert('photos', chunk);
          debugLogger.info('SYNC', 'Batch synced photo records', {
            count: chunk.length
          });
        }
      }

      if (photoPatchOps.length > 0) {
        lastOp = photoPatchOps[photoPatchOps.length - 1] ?? lastOp;
        const records = photoPatchOps.map((op) => ({
          ...op.opData,
          id: op.id
        }));

        for (let i = 0; i < records.length; i += this.PHOTO_BATCH_SIZE) {
          const chunk = records.slice(i, i + this.PHOTO_BATCH_SIZE);
          await this.apiClient.batchPatch('photos', chunk);
          debugLogger.info('SYNC', 'Batch patched photo records', {
            count: chunk.length
          });
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      const errorMessage = ex?.message || '';
      debugLogger.error('SYNC', 'Upload error', {
        op: lastOp,
        error: errorMessage
      });

      // Check for fatal HTTP errors that shouldn't retry (400, 401, 403, 404, 422)
      if (FATAL_HTTP_STATUS_PATTERN.test(errorMessage)) {
        debugLogger.error('SYNC', 'Fatal HTTP error - discarding transaction');
        await transaction.complete();
      } else {
        // Retryable error (network issues, 500s, etc.)
        throw ex;
      }
    }
  }
}
