import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  CrudEntry,
  UpdateType,
} from '@powersync/react-native';
import { CloudinaryStorageOptions } from '../ApiClient';
import { ApiClient } from '../ApiClient';
import { getClerkInstance } from '@clerk/clerk-expo';
import { CloudinaryStorageAdapter } from '../storage/CloudinaryStorageAdapter';
import { System } from './System';
import { AppConfig } from './AppConfig';
import { debugLogger } from '@/utils/DebugLogger';

// Token cache to avoid excessive API calls
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

/// Postgres Response codes that we cannot recover from by retrying.
const FATAL_RESPONSE_CODES = [
  // Class 22 — Data Exception
  // Examples include data type mismatch.
  new RegExp('^22...$'),
  // Class 23 — Integrity Constraint Violation.
  // Examples include NOT NULL, FOREIGN KEY and UNIQUE violations.
  new RegExp('^23...$'),
  // INSUFFICIENT PRIVILEGE - typically a row-level security violation
  new RegExp('^42501$'),
];
export class BackendConnector implements PowerSyncBackendConnector {
  private apiClient: ApiClient | null = null;
  storage: CloudinaryStorageAdapter;
  private endpoint: string = '';
  private cloudinaryOptions: CloudinaryStorageOptions;

  constructor(protected system: System) {
    // Initialize with cloudinary URL and storage options
    this.cloudinaryOptions = {
      auth: {
        persistSession: true,
        storage: this.system.KVstorage,
      },
    };

    // ApiClient base URL - not used for Cloudinary uploads (which use server-signed URLs)
    this.apiClient = new ApiClient('', this.cloudinaryOptions);
    this.storage = new CloudinaryStorageAdapter(this.apiClient);
  }

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
  }

  async fetchCredentials(retryCount = 0): Promise<{ endpoint: string; token: string } | null> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    debugLogger.debug('AUTH', `fetchCredentials started (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

    try {
      const clerk = getClerkInstance({
        publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      });

      if (!clerk?.session) {
        debugLogger.warn('AUTH', 'No Clerk session available');
        // Retry if we have retries left - session might still be initializing
        if (retryCount < MAX_RETRIES) {
          debugLogger.debug('AUTH', `Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          return this.fetchCredentials(retryCount + 1);
        }
        debugLogger.error('AUTH', 'No Clerk session after max retries');
        return null;
      }

      // Check if we have a valid cached token
      const now = Date.now();
      if (cachedToken && tokenExpiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
        debugLogger.debug('AUTH', 'Using cached token');
        return {
          endpoint: this.endpoint,
          token: cachedToken,
        };
      }

      // Fetch fresh token (only when cache expired or missing)
      debugLogger.debug('AUTH', 'Fetching fresh token from Clerk');
      const token = await clerk.session?.getToken({
        template: 'Powersync',
        skipCache: false, // Use Clerk's cache when possible
      });

      if (!token) {
        debugLogger.warn('AUTH', 'No token received from Clerk');
        if (retryCount < MAX_RETRIES) {
          debugLogger.debug('AUTH', `Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          return this.fetchCredentials(retryCount + 1);
        }
        debugLogger.error('AUTH', 'No token after max retries');
        return null;
      }

      // Cache the token (PowerSync tokens typically expire in 60 min)
      cachedToken = token;
      tokenExpiresAt = now + 55 * 60 * 1000; // Assume 55 min expiry to be safe

      if (!this.endpoint) {
        debugLogger.error('AUTH', 'No endpoint configured');
        return null;
      }

      // Update the token in the existing ApiClient
      if (this.apiClient) {
        this.apiClient.setToken(token);
      } else {
        this.apiClient = new ApiClient(token);
        this.storage = new CloudinaryStorageAdapter(this.apiClient);
      }

      debugLogger.info('AUTH', 'fetchCredentials success');
      return {
        endpoint: this.endpoint,
        token,
      };
    } catch (error) {
      debugLogger.error('AUTH', 'fetchCredentials error', { error: error instanceof Error ? error.message : String(error) });
      if (retryCount < MAX_RETRIES) {
        debugLogger.debug('AUTH', `Retrying after error in ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return this.fetchCredentials(retryCount + 1);
      }
      return null;
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    // Ensure we have an API client
    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    let lastOp: CrudEntry | null = null;
    try {
      // Note: If transactional consistency is important, use database functions
      // or edge functions to process the entire transaction in a single call.
      for (const op of transaction.crud) {
        lastOp = op;

        // Skip ALL photo-related PATCH operations for schedules table
        // This prevents endless sync loops when photos are updated locally
        if (
          op.op === UpdateType.PATCH &&
          op.table === 'schedules' &&
          op.opData &&
          ('photos' in op.opData || 'signature' in op.opData)
        ) {
          debugLogger.debug('SYNC', 'Skipping photo/signature update sync', { table: op.table, id: op.id });
          continue;
        }

        let result: any = null;

        // Use ApiClient.from() for all tables - special handling is done in ApiClient
        const table = this.apiClient.from(op.table);
        switch (op.op) {
          case UpdateType.PUT:
            // eslint-disable-next-line no-case-declarations
            const record = { ...op.opData, id: op.id };
            result = await table.upsert(record);
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
        }

        debugLogger.info('SYNC', `Synced ${op.table} record`, { id: op.id });

        if (result.error) {
          debugLogger.error('SYNC', `${op.op} operation failed`, { table: op.table, id: op.id, error: result.error });

          // Handle 404 errors specifically - record doesn't exist on server
          const isError404 =
            (typeof result.error === 'object' && result.error.code === 'PGRST116') ||
            (typeof result.error === 'object' && result.error.message?.includes('404')) ||
            (typeof result.error === 'string' && result.error.includes('404'));

          if (isError404) {
            debugLogger.warn('SYNC', 'Record not found on server, marking complete', { id: op.id });
            // Don't throw error for 404s - this allows the transaction to complete
            // and prevents infinite retry loops for orphaned records
            continue;
          }

          // For other errors, create a proper error object if needed and add context
          const errorMessage = typeof result.error === 'string'
            ? result.error
            : (result.error.message || JSON.stringify(result.error));

          const errorObj = new Error(`Could not ${op.op} data to backend: ${errorMessage}`);
          throw errorObj;
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      debugLogger.debug('SYNC', 'Upload error caught', { error: ex?.message || String(ex) });
      if (
        typeof ex.code == 'string' &&
        FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))
      ) {
        /**
         * Instead of blocking the queue with these errors,
         * discard the (rest of the) transaction.
         *
         * Note that these errors typically indicate a bug in the application.
         * If protecting against data loss is important, save the failing records
         * elsewhere instead of discarding, and/or notify the user.
         */
        debugLogger.error('SYNC', 'Fatal upload error - discarding transaction', { op: lastOp, error: ex?.message });
        await transaction.complete();
      } else {
        // Error may be retryable - e.g. network error or temporary server error.
        // Throwing an error here causes this call to be retried after a delay.
        throw ex;
      }
    }
  }

  // Set the PowerSync instance in the CloudinaryStorageAdapter
  setDatabase(powersync: any) {
    if (this.storage) {
      this.storage.setPowerSync(powersync);
    }
  }
}
