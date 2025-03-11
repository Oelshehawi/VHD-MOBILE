import '@azure/core-asynciterator-polyfill';
import React from 'react';
import { PowerSyncDatabase } from '@powersync/react-native';
import { BackendConnector } from './BackendConnector';
import { AppSchema } from './schema';
import { getPowerSyncUrl } from '../api';

export class System {
  powersync: PowerSyncDatabase;
  backendConnector: BackendConnector;
  private isInitialized: boolean = false;

  constructor() {
    this.backendConnector = new BackendConnector();
    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'test.db',
      },
    });
  }

  async init() {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.powersync.init();

      const powerSyncUrl = getPowerSyncUrl();
      console.log(powerSyncUrl);
      this.backendConnector.setEndpoint(process.env.EXPO_PUBLIC_POWERSYNC_URL!);

      await this.powersync.connect(this.backendConnector);

      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  async disconnect() {
    try {
      await this.powersync.disconnect();
      this.isInitialized = false;
    } catch (error) {
      throw error;
    }
  }
}

export const system = new System();

export const SystemContext = React.createContext(system);
export const useSystem = () => React.useContext(SystemContext);
