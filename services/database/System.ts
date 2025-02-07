import '@azure/core-asynciterator-polyfill';
import React from 'react';
import { PowerSyncDatabase } from '@powersync/react-native';
import { BackendConnector } from './BackendConnector';
import { AppSchema } from './schema';

export class System {
  powersync: PowerSyncDatabase;
  backendConnector: BackendConnector;
  private isInitialized: boolean = false;

  constructor() {
    console.log('System: Creating new instance');
    this.backendConnector = new BackendConnector();
    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'vhd.db',
      },
    });
  }

  async init() {
    if (this.isInitialized) {
      console.log('System: Already initialized');
      return;
    }

    try {
      console.log('System: Initializing PowerSync...');
      await this.powersync.init();
      console.log('System: PowerSync initialized');

      console.log('System: Connecting to backend...');
      await this.powersync.connect(this.backendConnector);
      console.log('System: Connected to backend');

      this.isInitialized = true;
      console.log('System: Initialization complete');
    } catch (error) {
      console.error('System: Initialization error:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      console.log('System: Disconnecting...');
      await this.powersync.disconnect();
      this.isInitialized = false;
      console.log('System: Disconnected');
    } catch (error) {
      console.error('System: Disconnect error:', error);
      throw error;
    }
  }
}

export const system = new System();

export const SystemContext = React.createContext(system);
export const useSystem = () => React.useContext(SystemContext);
