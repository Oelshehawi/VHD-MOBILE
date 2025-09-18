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

Logger.useDefaults();

Logger.setLevel(Logger.DEBUG);
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
    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'test.db',
      },
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
    await this.powersync.init();

    const powerSyncUrl = getPowerSyncUrl();

    this.backendConnector.setEndpoint(powerSyncUrl as string);

    // Set the PowerSync instance in the CloudinaryStorageAdapter
    this.backendConnector.setDatabase(this.powersync);

    await this.powersync.connect(this.backendConnector);

    if (this.attachmentQueue) {
      await this.attachmentQueue.init();
    }
  }

  async disconnect() {
    await this.powersync.disconnect();
  }
}

export const system = new System();

export const SystemContext = React.createContext(system);
export const useSystem = () => React.useContext(SystemContext);
