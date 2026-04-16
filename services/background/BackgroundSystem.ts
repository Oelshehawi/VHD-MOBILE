import '@azure/core-asynciterator-polyfill';
import { fetch as expoFetch } from 'expo/fetch';
import { PowerSyncDatabase } from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { ApiClient, getPowerSyncUrl } from '@/services/ApiClient';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { BackendConnector } from '@/services/database/BackendConnector';
import { PhotoAttachmentQueue } from '@/services/database/PhotoAttachmentQueue';
import { AppSchema } from '@/services/database/schema';
import type { FetchLike } from '@/services/network/types';
import { debugLogger } from '@/utils/DebugLogger';

interface PhotoUploadStats {
  attempted: number;
  succeeded: number;
}

function hasReachedDeadline(deadlineMs: number): boolean {
  return Date.now() >= deadlineMs;
}

export class BackgroundSystem {
  private readonly apiClient: ApiClient;
  private readonly backendConnector: BackendConnector;
  private readonly powersync: PowerSyncDatabase;
  private readonly attachmentQueue: PhotoAttachmentQueue;
  private hasPowerSyncInit = false;
  private hasAttachmentQueueInit = false;
  private disconnected = false;

  constructor() {
    const tokenProvider = getBackgroundToken;
    const backgroundFetch = expoFetch as unknown as FetchLike;

    this.apiClient = new ApiClient('', {
      fetchImpl: backgroundFetch,
      tokenProvider
    });

    this.backendConnector = new BackendConnector(null, {
      apiClient: this.apiClient,
      tokenProvider
    });

    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: new OPSqliteOpenFactory({
        dbFilename: 'powersync.db'
      })
    });

    this.attachmentQueue = new PhotoAttachmentQueue({
      powersync: this.powersync,
      storage: this.backendConnector.storage,
      performInitialSync: true,
      syncInterval: 30000,
      downloadAttachments: false,
      fetchImpl: backgroundFetch,
      tokenProvider
    });
  }

  async init(deadlineMs: number): Promise<void> {
    if (hasReachedDeadline(deadlineMs)) {
      return;
    }

    if (!this.hasPowerSyncInit) {
      await this.powersync.init();
      this.backendConnector.setEndpoint(getPowerSyncUrl());
      this.hasPowerSyncInit = true;
      this.disconnected = false;
    }

    if (hasReachedDeadline(deadlineMs)) {
      return;
    }

    if (!this.hasAttachmentQueueInit) {
      await this.attachmentQueue.init();
      this.hasAttachmentQueueInit = true;
    }
  }

  async ensureAuthAvailable(deadlineMs: number): Promise<boolean> {
    if (hasReachedDeadline(deadlineMs)) {
      return false;
    }

    const token = await getBackgroundToken();
    if (!token) {
      void debugLogger.warn('AUTH', 'BackgroundSystem: no background auth token available');
      return false;
    }

    this.apiClient.setToken(token);
    return true;
  }

  async uploadPendingPowerSyncOps(deadlineMs: number): Promise<number> {
    if (hasReachedDeadline(deadlineMs)) {
      return 0;
    }

    if (!this.hasPowerSyncInit) {
      await this.init(deadlineMs);
    }

    if (!this.hasPowerSyncInit || hasReachedDeadline(deadlineMs)) {
      return 0;
    }

    return this.backendConnector.uploadPendingTransactions(this.powersync, deadlineMs);
  }

  async processQueuedPhotoUploads(deadlineMs: number): Promise<PhotoUploadStats> {
    if (hasReachedDeadline(deadlineMs)) {
      return { attempted: 0, succeeded: 0 };
    }

    if (!this.hasAttachmentQueueInit) {
      await this.init(deadlineMs);
    }

    if (!this.hasAttachmentQueueInit || hasReachedDeadline(deadlineMs)) {
      return { attempted: 0, succeeded: 0 };
    }

    const result = await this.attachmentQueue.processQueue({ deadlineMs });
    return {
      attempted: result.attempted,
      succeeded: result.succeeded
    };
  }

  async disconnect(): Promise<void> {
    if (this.disconnected) {
      return;
    }

    try {
      await this.powersync.disconnect();
    } finally {
      this.disconnected = true;
      this.hasPowerSyncInit = false;
      this.hasAttachmentQueueInit = false;
    }
  }
}
