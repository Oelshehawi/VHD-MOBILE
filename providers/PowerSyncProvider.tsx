import '@azure/core-asynciterator-polyfill';
import { PowerSyncContext } from '@powersync/react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { System, useSystem } from '../services/database/System';
import { debugLogger } from '@/utils/DebugLogger';

const TECHNICIAN_MAP: Record<string, string> = {
  user_38Ghu2yPVPlTmB3D9UxbPj0okJN: 'Mohnad Elkeliny',
  user_38Ghu33VeKR30As0If7L483CKPC: 'Ahmed Habib',
  user_38GhtkZa3oKjxakPlEXKJbduzeQ: 'Ziad Elshehawi',
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
      return;
    }

    const initializePowerSync = async () => {
      debugLogger.debug('SYNC', 'PowerSync init check', { isSignedIn, isInitialized });

      if (isSignedIn && !isInitialized) {
        try {
          setError(null);
          debugLogger.info('SYNC', 'Starting PowerSync initialization');
          await system.init();
          debugLogger.info('SYNC', 'PowerSync initialized successfully');
          setIsInitialized(true);
        } catch (err) {
          const error =
            err instanceof Error
              ? err
              : new Error('PowerSync initialization failed');
          debugLogger.error('SYNC', 'PowerSync initialization error', {
            error: error.message
          });
          setError(error);
        }
      } else if (!isSignedIn && isInitialized) {
        try {
          debugLogger.info('SYNC', 'Disconnecting PowerSync (user signed out)');
          await system.disconnect();
          setIsInitialized(false);
          debugLogger.info('SYNC', 'PowerSync disconnected successfully');
        } catch (err) {
          debugLogger.error('SYNC', 'PowerSync disconnect error', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
    };

    initializePowerSync();
  }, [isSignedIn, isLoaded, isInitialized]);

  const db = useMemo(() => {
    return system.powersync;
  }, [system]);

  if (error) {
    debugLogger.error('SYNC', 'PowerSync error state active', { error: error.message });
  }

  return (
    <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
  );
};
