import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  CrudEntry,
  UpdateType
} from '@powersync/react-native';
import { ApiClient, SyncOperationResult } from '../ApiClient';
import { getPersistentClerk } from '@/services/background/clerkBootstrap';
import { CloudinaryStorageAdapter } from '../storage/CloudinaryStorageAdapter';
import type { System } from './System';
import { debugLogger } from '@/utils/DebugLogger';
import { cacheBackgroundToken } from '@/services/background/BackgroundAuth';
import { hasPowerSyncStaffIdentityClaims } from '@/utils/powerSyncToken';
import { SyncEventBus } from '@/services/sync/SyncEventBus';
import type { TokenProvider } from '../network/types';
import { getMobileScheduleUploadData } from './scheduleUpload';

type SyncMetricName =
  | 'sync_ack_success'
  | 'sync_ack_business_reject'
  | 'sync_retry_transient'
  | 'sync_auth_pause';

type PendingCrudTransaction = NonNullable<
  Awaited<ReturnType<AbstractPowerSyncDatabase['getNextCrudTransaction']>>
>;

interface BackendConnectorOptions {
  apiClient?: ApiClient;
  tokenProvider?: TokenProvider;
}

type QueuedOp = Pick<CrudEntry, 'table' | 'id' | 'op' | 'opData'>;

interface QuarantinedWrite {
  id: string;
  tableName: string;
  rowId: string;
  op: string;
  data: string | null;
}

export class BackendConnector implements PowerSyncBackendConnector {
  private apiClient: ApiClient;
  private readonly tokenProvider?: TokenProvider;
  storage: CloudinaryStorageAdapter;
  private endpoint: string = '';
  private readonly PHOTO_BATCH_SIZE = 10;
  private syncMetrics: Record<SyncMetricName, number> = {
    sync_ack_success: 0,
    sync_ack_business_reject: 0,
    sync_retry_transient: 0,
    sync_auth_pause: 0
  };

  constructor(protected system: System | null = null, options?: BackendConnectorOptions) {
    this.apiClient = options?.apiClient ?? new ApiClient();
    this.tokenProvider = options?.tokenProvider;
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
      if (this.tokenProvider) {
        const token = await this.tokenProvider();

        if (!token || !hasPowerSyncStaffIdentityClaims(token)) {
          debugLogger.warn('AUTH', 'Token provider returned no valid staff identity token');
          return null;
        }

        await cacheBackgroundToken(token);

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
      }

      const clerk = getPersistentClerk();

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
        skipCache: true
      });

      if (!token || !hasPowerSyncStaffIdentityClaims(token)) {
        debugLogger.warn('AUTH', 'Fresh Clerk token missing PowerSync staff identity claims');
        if (retryCount < MAX_RETRIES) {
          debugLogger.debug('AUTH', `Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return this.fetchCredentials(retryCount + 1);
        }
        debugLogger.error('AUTH', 'No token after max retries');
        return null;
      }

      await cacheBackgroundToken(token);

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
    const canonicalInspectionKeys = [
      'hoodInteriorCleaned',
      'plenumCleaned',
      'filtersCleanedScope',
      'ductCleaned',
      'adequateAccessPanels',
      'exhaustFanCleaned',
      'fireSuppressionNozzlesClear'
    ] as const;
    const parseJsonField = (field: string) => {
      if (typeof result[field] !== 'string') return;
      try {
        result[field] = JSON.parse(result[field]);
      } catch {
        debugLogger.warn('SYNC', `Failed to parse ${field} JSON`);
      }
    };

    parseJsonField('cleaningDetails');
    parseJsonField('inspectionItems');
    parseJsonField('deficiencies');

    const inspectionItems =
      result.inspectionItems &&
      typeof result.inspectionItems === 'object' &&
      !Array.isArray(result.inspectionItems)
        ? result.inspectionItems
        : {};
    const cleaningDetails =
      result.cleaningDetails &&
      typeof result.cleaningDetails === 'object' &&
      !Array.isArray(result.cleaningDetails)
        ? result.cleaningDetails
        : {};

    result.inspectionItems = {
      hoodInteriorCleaned: this.mapLegacyReportBoolean(
        inspectionItems.hoodInteriorCleaned ?? cleaningDetails.hoodCleaned
      ),
      plenumCleaned: this.mapLegacyReportBoolean(inspectionItems.plenumCleaned),
      filtersCleanedScope: this.mapLegacyReportBoolean(
        inspectionItems.filtersCleanedScope ?? cleaningDetails.filtersCleaned
      ),
      ductCleaned: this.mapLegacyReportBoolean(
        inspectionItems.ductCleaned ?? cleaningDetails.ductworkCleaned
      ),
      adequateAccessPanels: this.mapLegacyReportBoolean(inspectionItems.adequateAccessPanels),
      exhaustFanCleaned: this.mapLegacyReportBoolean(
        inspectionItems.exhaustFanCleaned ?? cleaningDetails.fanCleaned
      ),
      fireSuppressionNozzlesClear: this.mapLegacyReportBoolean(
        inspectionItems.fireSuppressionNozzlesClear
      )
    };

    for (const key of Object.keys(result.inspectionItems)) {
      if (!canonicalInspectionKeys.includes(key as (typeof canonicalInspectionKeys)[number])) {
        delete result.inspectionItems[key];
      }
    }

    if (!result.recommendations && typeof result.comments === 'string') {
      result.recommendations = result.comments;
    }

    delete result.comments;
    delete result.cleaningDetails;
    delete result.equipmentDetails;
    delete result.cookingVolume;

    return result as T;
  }

  private mapLegacyReportBoolean(value: unknown): 'Yes' | 'No' | 'N/A' {
    if (value === 'Yes' || value === 'No' || value === 'N/A') return value;
    if (value === true || value === 1 || value === '1') return 'Yes';
    if (value === false || value === 0 || value === '0') return 'No';
    return 'N/A';
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
    context: {
      table: string;
      id?: string;
      ops: QueuedOp[];
      database: AbstractPowerSyncDatabase;
    },
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
      const serverMessage = result.message || result.error || 'Server rejected the change';
      if (table === 'expopushtokens') {
        // A stale device token belongs to another account; dropping it is intended.
        debugLogger.warn('SYNC', 'Sync business rejection (dropping push token op)', {
          id,
          error: result.error,
          message: result.message
        });
        return;
      }

      // Saved before the transaction completes. If the insert fails it throws,
      // the transaction stays queued, and PowerSync retries it.
      await this.quarantineOps(context.database, context.ops, result);
      debugLogger.warn('SYNC', 'Sync business rejection (quarantined op)', {
        table,
        id,
        opCount: context.ops.length,
        error: result.error,
        message: result.message
      });

      SyncEventBus.emit({
        type: 'business_reject',
        table,
        id,
        message: serverMessage
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

  private async quarantineOps(
    database: AbstractPowerSyncDatabase,
    ops: QueuedOp[],
    result: SyncOperationResult
  ) {
    const quarantinedAt = new Date().toISOString();
    for (const op of ops) {
      await database.execute(
        'INSERT INTO sync_quarantine (id, tableName, rowId, op, data, httpStatus, error, quarantinedAt) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)',
        [
          op.table,
          op.id,
          op.op,
          JSON.stringify(op.opData ?? {}),
          result.httpStatus,
          result.message || result.error || null,
          quarantinedAt
        ]
      );
    }
  }

  private toPhotoRecord(op: QueuedOp): Record<string, unknown> {
    return { ...op.opData, id: op.id };
  }

  /**
   * Sends one queued op to the backend. Returns null for ops the mobile app
   * intentionally never uploads (schedule fields it does not own).
   */
  private async sendOp(op: QueuedOp): Promise<SyncOperationResult | null> {
    if (op.table === 'photos' && op.op !== UpdateType.DELETE) {
      const records = [this.toPhotoRecord(op)];
      return op.op === UpdateType.PUT
        ? this.apiClient.batchUpsert('photos', records)
        : this.apiClient.batchPatch('photos', records);
    }

    if (op.table === 'schedules' && op.op !== UpdateType.PATCH) {
      debugLogger.warn('SYNC', 'Dropped unsupported mobile schedule mutation', {
        id: op.id,
        operation: op.op
      });
      return null;
    }

    // Parse JSON fields for reports table before sending to backend
    let data: Record<string, unknown> = { ...op.opData, id: op.id };
    if (op.table === 'reports') {
      data = this.parseReportJsonFields(data);
    }
    if (op.table === 'schedules') {
      const scheduleData = getMobileScheduleUploadData(op.opData);
      if (Object.keys(scheduleData).length === 0) {
        debugLogger.warn('SYNC', 'Dropped schedule write with no mobile-owned fields', {
          id: op.id,
          fields: Object.keys(op.opData || {})
        });
        return null;
      }
      data = { ...scheduleData, id: op.id };
    }

    const record = { table: op.table, data };
    switch (op.op) {
      case UpdateType.PUT:
        return this.apiClient.upsert(record);
      case UpdateType.PATCH:
        return this.apiClient.update(record);
      case UpdateType.DELETE:
        return this.apiClient.delete({ table: op.table, data: { id: op.id } });
      default:
        return null;
    }
  }

  /**
   * Re-sends writes the server rejected earlier. A write leaves quarantine once
   * the server accepts it; a repeat rejection keeps it with the new reason.
   * Stops at the first offline/auth failure so the rest wait for a later retry.
   */
  async retryQuarantinedWrites(
    database: AbstractPowerSyncDatabase
  ): Promise<{ resolved: number; remaining: number }> {
    const rows = await database.getAll<QuarantinedWrite>(
      'SELECT id, tableName, rowId, op, data FROM sync_quarantine ORDER BY quarantinedAt'
    );
    let resolved = 0;
    for (const row of rows) {
      let opData: Record<string, unknown> | undefined;
      try {
        opData = row.data ? (JSON.parse(row.data) as Record<string, unknown>) : undefined;
      } catch {
        opData = undefined;
      }
      const result = await this.sendOp({
        table: row.tableName,
        id: row.rowId,
        op: row.op as UpdateType,
        opData
      });
      if (!result || result.outcome === 'success') {
        await database.execute('DELETE FROM sync_quarantine WHERE id = ?', [row.id]);
        resolved += 1;
        continue;
      }
      if (result.outcome === 'business_reject') {
        await database.execute('UPDATE sync_quarantine SET httpStatus = ?, error = ? WHERE id = ?', [
          result.httpStatus,
          result.message || result.error || null,
          row.id
        ]);
        continue;
      }
      break;
    }
    debugLogger.info('SYNC', 'Retried quarantined writes', {
      total: rows.length,
      resolved
    });
    return { resolved, remaining: rows.length - resolved };
  }

  private async processCrudTransaction(
    transaction: PendingCrudTransaction,
    database: AbstractPowerSyncDatabase
  ): Promise<number> {
    let lastOp: CrudEntry | null = null;
    const photoPutOps: CrudEntry[] = [];
    const photoPatchOps: CrudEntry[] = [];
    const transactionOpCount = transaction.crud.length;

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

        const result = await this.sendOp(op);
        if (!result) {
          continue;
        }

        await this.handleSyncResult(result, { table: op.table, id: op.id, ops: [op], database });
        if (result.outcome === 'success') {
          debugLogger.info('SYNC', `Synced ${op.table} record`, {
            id: op.id
          });
        }
      }

      if (photoPutOps.length > 0) {
        lastOp = photoPutOps[photoPutOps.length - 1] ?? lastOp;

        for (let i = 0; i < photoPutOps.length; i += this.PHOTO_BATCH_SIZE) {
          const chunk = photoPutOps.slice(i, i + this.PHOTO_BATCH_SIZE);
          const result = await this.apiClient.batchUpsert(
            'photos',
            chunk.map((op) => this.toPhotoRecord(op))
          );
          await this.handleSyncResult(
            result,
            { table: 'photos', id: chunk[0]?.id, ops: chunk, database },
            chunk.length
          );
          if (result.outcome === 'success') {
            debugLogger.info('SYNC', 'Batch synced photo records', {
              count: chunk.length
            });
          }
        }
      }

      if (photoPatchOps.length > 0) {
        lastOp = photoPatchOps[photoPatchOps.length - 1] ?? lastOp;

        for (let i = 0; i < photoPatchOps.length; i += this.PHOTO_BATCH_SIZE) {
          const chunk = photoPatchOps.slice(i, i + this.PHOTO_BATCH_SIZE);
          const result = await this.apiClient.batchPatch(
            'photos',
            chunk.map((op) => this.toPhotoRecord(op))
          );
          await this.handleSyncResult(
            result,
            { table: 'photos', id: chunk[0]?.id, ops: chunk, database },
            chunk.length
          );
          if (result.outcome === 'success') {
            debugLogger.info('SYNC', 'Batch patched photo records', {
              count: chunk.length
            });
          }
        }
      }

      await transaction.complete();
      return transactionOpCount;
    } catch (ex: any) {
      const errorMessage = ex?.message || '';
      debugLogger.error('SYNC', 'Upload error', {
        op: lastOp,
        error: errorMessage,
        transactionOpCount
      });
      throw ex;
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    await this.processCrudTransaction(transaction, database);
  }

  async uploadPendingTransactions(
    database: AbstractPowerSyncDatabase,
    deadlineMs: number
  ): Promise<number> {
    let drainedTransactions = 0;
    let uploadedOps = 0;

    while (Date.now() < deadlineMs) {
      const transaction = await database.getNextCrudTransaction();
      if (!transaction) {
        debugLogger.info('SYNC', 'Upload drain completed', {
          drainedTransactions,
          uploadedOps,
          stopReason: 'empty_queue'
        });
        return uploadedOps;
      }

      const transactionOpCount = await this.processCrudTransaction(transaction, database);
      drainedTransactions += 1;
      uploadedOps += transactionOpCount;

      debugLogger.debug('SYNC', 'Upload drain processed transaction', {
        drainedTransactions,
        uploadedOps,
        transactionOpCount
      });
    }

    debugLogger.info('SYNC', 'Upload drain stopped', {
      drainedTransactions,
      uploadedOps,
      stopReason: 'deadline'
    });

    return uploadedOps;
  }
}
