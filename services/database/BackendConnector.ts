import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  CrudEntry,
  UpdateType
} from '@powersync/react-native';
import { ApiClient, SyncOperationResult } from '../ApiClient';
import { getClerkInstance } from '@clerk/clerk-expo';
import { CloudinaryStorageAdapter } from '../storage/CloudinaryStorageAdapter';
import { System } from './System';
import { debugLogger } from '@/utils/DebugLogger';

type SyncMetricName =
  | 'sync_ack_success'
  | 'sync_ack_business_reject'
  | 'sync_retry_transient'
  | 'sync_auth_pause';

export class BackendConnector implements PowerSyncBackendConnector {
  private apiClient: ApiClient;
  storage: CloudinaryStorageAdapter;
  private endpoint: string = '';
  private readonly PHOTO_BATCH_SIZE = 10;
  private syncMetrics: Record<SyncMetricName, number> = {
    sync_ack_success: 0,
    sync_ack_business_reject: 0,
    sync_retry_transient: 0,
    sync_auth_pause: 0
  };

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

  private incrementSyncMetric(
    metric: SyncMetricName,
    amount = 1,
    context?: Record<string, unknown>
  ) {
    this.syncMetrics[metric] += amount;
    debugLogger.debug('SYNC', 'Sync metric incremented', {
      metric,
      amount,
      total: this.syncMetrics[metric],
      ...context
    });
  }

  private async handleSyncResult(
    result: SyncOperationResult,
    context: { table: string; id?: string },
    opCount = 1
  ) {
    const table = context.table;
    const id = context.id;

    if (result.outcome === 'success') {
      this.incrementSyncMetric('sync_ack_success', opCount, { table, id });
      return;
    }

    if (result.outcome === 'business_reject') {
      this.incrementSyncMetric('sync_ack_business_reject', opCount, { table, id });
      debugLogger.warn('SYNC', 'Sync business rejection (dropping op)', {
        table,
        id,
        error: result.error,
        message: result.message
      });
      return;
    }

    if (result.outcome === 'auth_pause') {
      this.incrementSyncMetric('sync_auth_pause', 1, { table, id });
      const refreshed = await this.fetchCredentials();
      debugLogger.warn('AUTH', 'Sync paused due to auth failure; will retry later', {
        table,
        id,
        httpStatus: result.httpStatus,
        refreshed: !!refreshed
      });
      throw new Error(
        `Sync auth pause: ${result.httpStatus} - ${
          result.error || result.message || 'Unauthorized'
        }`
      );
    }

    this.incrementSyncMetric('sync_retry_transient', 1, { table, id });
    throw new Error(
      `Sync transient failure: ${result.httpStatus} - ${result.error || result.message || 'Retry'}`
    );
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

        let result: SyncOperationResult;
        switch (op.op) {
          case UpdateType.PUT:
            result = await this.apiClient.upsert(record);
            break;
          case UpdateType.PATCH:
            result = await this.apiClient.update(record);
            break;
          case UpdateType.DELETE:
            result = await this.apiClient.delete({
              table: op.table,
              data: { id: op.id }
            });
            break;
        }

        await this.handleSyncResult(result!, { table: op.table, id: op.id });
        if (result!.outcome === 'success') {
          debugLogger.info('SYNC', `Synced ${op.table} record`, {
            id: op.id
          });
        }
      }

      if (photoPutOps.length > 0) {
        lastOp = photoPutOps[photoPutOps.length - 1] ?? lastOp;
        const records = photoPutOps.map((op) => ({
          ...op.opData,
          id: op.id
        }));

        for (let i = 0; i < records.length; i += this.PHOTO_BATCH_SIZE) {
          const chunk = records.slice(i, i + this.PHOTO_BATCH_SIZE);
          const result = await this.apiClient.batchUpsert('photos', chunk);
          const firstId = typeof chunk[0]?.id === 'string' ? chunk[0].id : undefined;
          await this.handleSyncResult(result, { table: 'photos', id: firstId }, chunk.length);
          if (result.outcome === 'success') {
            debugLogger.info('SYNC', 'Batch synced photo records', {
              count: chunk.length
            });
          }
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
          const result = await this.apiClient.batchPatch('photos', chunk);
          const firstId = typeof chunk[0]?.id === 'string' ? chunk[0].id : undefined;
          await this.handleSyncResult(result, { table: 'photos', id: firstId }, chunk.length);
          if (result.outcome === 'success') {
            debugLogger.info('SYNC', 'Batch patched photo records', {
              count: chunk.length
            });
          }
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      const errorMessage = ex?.message || '';
      debugLogger.error('SYNC', 'Upload error', {
        op: lastOp,
        error: errorMessage
      });
      throw ex;
    }
  }
}
