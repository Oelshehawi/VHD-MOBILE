import '@azure/core-asynciterator-polyfill';
import { PowerSyncContext } from '@powersync/react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { System, useSystem } from '../services/database/System';

const TECHNICIAN_MAP: Record<string, string> = {
  user_2mqv5uvRlgBoXqWxPj3j1tAKXcE: 'Mohnad Elkeliny',
  user_2niPyF6ZPTOmNwxooRZu2F7ypMd: 'Ahmed Habib',
  user_2fFg8dDRtCeNEP9IVmQrFAAGrpT: 'Ziad Elshehawi',
} as const;

export const getTechnicianName = (userId: string): string => {
  return TECHNICIAN_MAP[userId] || 'Unknown';
};

export const PowerSyncProvider = ({ children }: { children: ReactNode }) => {
  const { isSignedIn, isLoaded } = useAuth();
  const system: System = useSystem();
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Wait for Clerk to load before initializing PowerSync
  useEffect(() => {

    if (!isLoaded) {
      console.log('Waiting for Clerk to load...');
      return;
    }

    const initializePowerSync = async () => {
      if (isSignedIn && !isInitialized) {
        try {
          setError(null);
          await system.init();
          setIsInitialized(true);
        } catch (err) {
          const error =
            err instanceof Error
              ? err
              : new Error('PowerSync initialization failed');
          console.error('❌ PowerSync initialization error:', error);
          setError(error);
        }
      } else if (!isSignedIn && isInitialized) {
        try {
          console.log('🔄 Disconnecting PowerSync...');
          await system.disconnect();
          setIsInitialized(false);
          console.log('✅ PowerSync disconnected successfully');
        } catch (err) {
          console.error('❌ PowerSync disconnect error:', err);
        }
      }
    };

    initializePowerSync();
  }, [isSignedIn, isLoaded, isInitialized]);

  const db = useMemo(() => {
    return system.powersync;
  }, [system]);

  if (error) {
    console.error('PowerSync Error State:', error);
  }

  return (
    <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
  );
};
