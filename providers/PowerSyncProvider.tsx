import '@azure/core-asynciterator-polyfill';
import { PowerSyncContext } from '@powersync/react-native';
import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import * as SplashScreen from 'expo-splash-screen';
import { System, useSystem } from '../services/database/System';
import { debugLogger } from '@/utils/DebugLogger';

const TECHNICIAN_MAP: Record<string, string> = {
  user_38Ghu2yPVPlTmB3D9UxbPj0okJN: 'Mohnad Elkeliny',
  user_38Ghu33VeKR30As0If7L483CKPC: 'Ahmed Habib',
  user_38GhtkZa3oKjxakPlEXKJbduzeQ: 'Ziad Elshehawi'
} as const;

export const getTechnicianName = (userId: string): string => {
  return TECHNICIAN_MAP[userId] || 'Unknown';
};

type PowerSyncStatus = {
  isLoaded: boolean;
  isSignedIn: boolean;
  isInitialized: boolean;
  isRetrying: boolean;
  error: Error | null;
  retryInit: () => Promise<void>;
};

const PowerSyncStatusContext = React.createContext<PowerSyncStatus | null>(null);

export const usePowerSyncStatus = () => {
  const context = React.useContext(PowerSyncStatusContext);
  if (!context) {
    throw new Error('usePowerSyncStatus must be used within PowerSyncProvider');
  }
  return context;
};

export const PowerSyncProvider = ({ children }: { children: ReactNode }) => {
  const { isSignedIn, isLoaded } = useAuth();
  const signedIn = Boolean(isSignedIn);
  const system: System = useSystem();
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Wait for Clerk to load before initializing PowerSync
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const initializePowerSync = async () => {
      debugLogger.debug('SYNC', 'PowerSync init check', {
        isSignedIn,
        isInitialized
      });

      if (signedIn && !isInitialized) {
        try {
          setError(null);
          debugLogger.info('SYNC', 'Starting PowerSync initialization');
          await system.init();
          debugLogger.info('SYNC', 'PowerSync initialized successfully');
          setIsInitialized(true);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('PowerSync initialization failed');
          debugLogger.error('SYNC', 'PowerSync initialization error', {
            error: error.message
          });
          setError(error);
        }
      } else if (!signedIn && isInitialized) {
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
  }, [signedIn, isLoaded, isInitialized]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!signedIn || isInitialized) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoaded, signedIn, isInitialized]);

  useEffect(() => {
    if (error) {
      debugLogger.error('SYNC', 'PowerSync error state active', {
        error: error.message
      });
    }
  }, [error]);

  const retryInit = useCallback(async () => {
    if (!signedIn || isInitialized || isRetrying) return;
    try {
      setIsRetrying(true);
      await system.init();
      setIsInitialized(true);
      setError(null);
    } catch (err) {
      const retryError = err instanceof Error ? err : new Error('PowerSync initialization failed');
      setError(retryError);
    } finally {
      setIsRetrying(false);
    }
  }, [signedIn, isInitialized, isRetrying, system]);

  const db = useMemo(() => system.powersync, [system]);
  const status = useMemo(
    () => ({
      isLoaded,
      isSignedIn: signedIn,
      isInitialized,
      isRetrying,
      error,
      retryInit
    }),
    [isLoaded, signedIn, isInitialized, isRetrying, error, retryInit]
  );

  return (
    <PowerSyncStatusContext.Provider value={status}>
      <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
    </PowerSyncStatusContext.Provider>
  );
};
