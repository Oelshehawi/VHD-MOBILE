import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  CrudEntry,
  UpdateType,
} from '@powersync/react-native';
import { CloudinaryStorageOptions } from '../api';
import { ApiClient } from '../ApiClient';
import { getClerkInstance } from '@clerk/clerk-expo';
import { CloudinaryStorageAdapter } from '../storage/CloudinaryStorageAdapter';
import { System } from './System';
import { AppConfig } from './AppConfig';

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

    // Use cloudinary URL from AppConfig or default to an empty string (which will be updated later)
    const cloudinaryUrl = AppConfig.cloudinaryUrl || 'pending-initialization';
    this.apiClient = new ApiClient(cloudinaryUrl, this.cloudinaryOptions);
    this.storage = new CloudinaryStorageAdapter(this.apiClient);
  }

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
  }

  async fetchCredentials() {
    try {
      const clerk = getClerkInstance({
        publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      });
      if (!clerk?.session) {
        return null;
      }

      const token = await clerk.session?.getToken({
        template: 'Powersync',
      });

      if (!token) {
        return null;
      }

      if (!this.endpoint) {
        return null;
      }

      // Update the token in the existing ApiClient instead of creating a new one
      if (this.apiClient) {
        this.apiClient.setToken(token);
      } else {
        // Create a new ApiClient only if one doesn't exist
        this.apiClient = new ApiClient(token);
        this.storage = new CloudinaryStorageAdapter(this.apiClient);
      }

      return {
        endpoint: this.endpoint,
        token,
      };
    } catch (error) {
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
        if (op.table === 'schedules') {
          console.log(
            'Skipping upload of schedule - waiting for photos to upload first'
          );
          continue; // Skip to next operation
        }
        const table = this.apiClient.from(op.table);
        let result: any = null;
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

        if (result.error) {
          console.error(result.error);
          result.error.message = `Could not ${
            op.op
          } data to Supabase error: ${JSON.stringify(result)}`;
          throw result.error;
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      console.debug(ex);
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
        console.error('Data upload error - discarding:', lastOp, ex);
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
