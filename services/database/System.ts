import '@azure/core-asynciterator-polyfill';
import React from 'react';
import { PowerSyncDatabase } from '@powersync/react-native';
import { BackendConnector } from './BackendConnector';
import { AppSchema } from './schema';
import { getPowerSyncUrl } from '../ApiClient';
import { CloudinaryStorageAdapter } from '../storage/CloudinaryStorageAdapter';
import { PhotoAttachmentQueue } from './PhotoAttachmentQueue';
import Logger from 'js-logger';
import { KVStorage } from '../storage/KVStorage';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { debugLogger } from '@/utils/DebugLogger';

Logger.useDefaults();
Logger.setLevel(Logger.DEBUG);

const CONNECTION_TIMEOUT_MS = 30000; // 30 second timeout for connection

// Check if running in Expo Go

const opSqlite = new OPSqliteOpenFactory({
  dbFilename: 'powersync.db'
});
export class System {
  KVstorage: KVStorage;
  storage: CloudinaryStorageAdapter;
  backendConnector: BackendConnector;
  powersync: PowerSyncDatabase;
  attachmentQueue: PhotoAttachmentQueue | undefined = undefined;

  constructor() {
    this.KVstorage = new KVStorage();
    this.backendConnector = new BackendConnector(this);
    this.storage = this.backendConnector.storage;

  

    // Switch between adapters based on execution environment
    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: opSqlite
    });

    this.attachmentQueue = new PhotoAttachmentQueue({
      powersync: this.powersync,
      storage: this.storage,
      performInitialSync: false, // Disable automatic sync - we handle it manually
      syncInterval: 0, // Disable periodic sync - we use our concurrent uploader
      // Use this to handle download errors where you can use the attachment
      // and/or the exception to decide if you want to retry the download
    });
  }

  async init() {
    debugLogger.info('SYNC', 'Initializing PowerSync system');
    await this.powersync.init();

    const powerSyncUrl = getPowerSyncUrl();
    debugLogger.debug('SYNC', 'PowerSync URL configured', { url: powerSyncUrl });

    this.backendConnector.setEndpoint(powerSyncUrl as string);

    // Set the PowerSync instance in the CloudinaryStorageAdapter
    this.backendConnector.setDatabase(this.powersync);

    // Connect with timeout to prevent hanging
    debugLogger.debug('SYNC', 'Connecting to PowerSync...');
    const connectPromise = this.powersync.connect(this.backendConnector);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PowerSync connection timeout')), CONNECTION_TIMEOUT_MS)
    );

    try {
      await Promise.race([connectPromise, timeoutPromise]);
      debugLogger.info('SYNC', 'PowerSync connected successfully');
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
    debugLogger.debug('SYNC', 'PowerSync disconnected');
  }
}

export const system = new System();

export const SystemContext = React.createContext(system);
export const useSystem = () => React.useContext(SystemContext);
