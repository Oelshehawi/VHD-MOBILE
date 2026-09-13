import '@azure/core-asynciterator-polyfill';
import React from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import { PowerSyncDatabase } from '@powersync/react-native';
import { BackendConnector } from './BackendConnector';
import { AppSchema } from './schema';
import { ApiClient, getPowerSyncUrl } from '../ApiClient';
import { CloudinaryStorageAdapter } from '../storage/CloudinaryStorageAdapter';
import { PhotoAttachmentQueue } from './PhotoAttachmentQueue';
import Logger from 'js-logger';
import { KVStorage } from '../storage/KVStorage';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { debugLogger } from '@/utils/DebugLogger';
import type { FetchLike } from '../network/types';
import { withTimeout } from '@/services/background/withTimeout';

// eslint-disable-next-line react-hooks/rules-of-hooks -- js-logger API, not a React Hook.
Logger.useDefaults();
Logger.setLevel(Logger.DEBUG);

const CONNECTION_TIMEOUT_MS = 30000;

// Rolling window: previous month through +2 months, as 'YYYY-MM' buckets.
// substring(scheduledStartAtUtc,1,7) IN this array (range ops can't compare a
// column to a parameter, so we bucket by month and use IN). No server-side
// now(), so the client computes the months. Advances on each launch.
export function getScheduleMonthBuckets(): string[] {
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const end = new Date();
  end.setMonth(end.getMonth() + 2);
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    months.push(ym);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

const opSqlite = new OPSqliteOpenFactory({
  dbFilename: 'powersync.db'
});

const foregroundFetch = expoFetch as unknown as FetchLike;

export class System {
  KVstorage: KVStorage;
  storage: CloudinaryStorageAdapter;
  backendConnector: BackendConnector;
  powersync: PowerSyncDatabase;
  attachmentQueue: PhotoAttachmentQueue | undefined = undefined;
  private databaseInitPromise: Promise<void> | null = null;
  private onlineInitPromise: Promise<void> | null = null;

  constructor() {
    this.KVstorage = new KVStorage();
    this.backendConnector = new BackendConnector(this, {
      apiClient: new ApiClient('', {
        fetchImpl: foregroundFetch
      })
    });
    this.storage = this.backendConnector.storage;

    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: opSqlite
    });

    this.attachmentQueue = new PhotoAttachmentQueue({
      powersync: this.powersync,
      storage: this.storage,
      performInitialSync: true,
      syncInterval: 30000,
      downloadAttachments: false,
      fetchImpl: foregroundFetch,
      instanceLabel: 'foreground-system'
    });
  }

  async initializeLocalDatabase() {
    if (!this.databaseInitPromise) {
      const startedAt = Date.now();
      debugLogger.info('SYNC', 'Opening local PowerSync database');
      this.databaseInitPromise = this.powersync
        .init()
        .then(() => {
          debugLogger.info('SYNC', 'Local PowerSync database ready', {
            elapsedMs: Date.now() - startedAt,
            hasSynced: this.powersync.currentStatus.hasSynced,
            lastSyncedAt: this.powersync.currentStatus.lastSyncedAt?.toISOString() ?? null
          });
        })
        .catch((error) => {
          this.databaseInitPromise = null;
          throw error;
        });
    }

    return this.databaseInitPromise;
  }

  async startOnlineServices() {
    await this.initializeLocalDatabase();

    if (!this.onlineInitPromise) {
      this.onlineInitPromise = this.initializeOnlineServices().catch((error) => {
        this.onlineInitPromise = null;
        throw error;
      });
    }

    return this.onlineInitPromise;
  }

  private async initializeOnlineServices() {
    const startedAt = Date.now();
    debugLogger.info('SYNC', 'Starting PowerSync online services');

    const powerSyncUrl = getPowerSyncUrl();
    debugLogger.debug('SYNC', 'PowerSync URL configured', {
      url: powerSyncUrl
    });

    this.backendConnector.setEndpoint(powerSyncUrl as string);

    // Connect with timeout to prevent hanging
    debugLogger.debug('SYNC', 'Connecting to PowerSync...');
    try {
      await withTimeout(
        this.powersync.connect(this.backendConnector, {
          params: { schedule_months: getScheduleMonthBuckets() }
        }),
        CONNECTION_TIMEOUT_MS
      );
      debugLogger.info('SYNC', 'PowerSync connection started', {
        elapsedMs: Date.now() - startedAt,
        connected: this.powersync.currentStatus.connected
      });
    } catch (error) {
      debugLogger.error('SYNC', 'PowerSync connection failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    if (this.attachmentQueue) {
      await this.attachmentQueue.init();
      debugLogger.debug('SYNC', 'Attachment queue initialized');
    }
  }

  async disconnect() {
    debugLogger.info('SYNC', 'Disconnecting PowerSync');
    await this.powersync.disconnect();
    this.onlineInitPromise = null;
    debugLogger.debug('SYNC', 'PowerSync disconnected');
  }
}

export const system = new System();

export const SystemContext = React.createContext(system);
export const useSystem = () => React.useContext(SystemContext);
