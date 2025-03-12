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
      
      // this.backendConnector.setEndpoint(process.env.EXPO_PUBLIC_POWERSYNC_URL!);

      this.backendConnector.setEndpoint('http://192.168.1.128:8080');

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
