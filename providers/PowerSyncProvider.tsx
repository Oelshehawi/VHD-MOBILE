import '@azure/core-asynciterator-polyfill';
import { PowerSyncContext } from '@powersync/react-native';
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { System, useSystem } from '../services/database/System';
import { debugLogger } from '@/utils/DebugLogger';
import { clearBackgroundToken } from '@/services/background/BackgroundAuth';

type PowerSyncStatus = {
  isLoaded: boolean;
  isSignedIn: boolean;
  isDatabaseReady: boolean;
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
  const [isDatabaseReady, setIsDatabaseReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  // Only disconnect something we actually connected. Without this a signed-out
  // cold start would tear down a sync connection that was never established.
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    let cancelled = false;

    const initializePowerSync = async () => {
      debugLogger.debug('SYNC', 'PowerSync init check', {
        isSignedIn: signedIn
      });

      if (signedIn) {
        try {
          setError(null);
          await system.initializeLocalDatabase();
          if (cancelled) return;

          setIsDatabaseReady(true);
          debugLogger.info('SYNC', 'Local PowerSync data is available to the UI');

          await system.startOnlineServices();
          if (cancelled) return;

          debugLogger.info('SYNC', 'PowerSync online services initialized successfully');
          hasConnectedRef.current = true;
          setIsInitialized(true);
        } catch (err) {
          if (cancelled) return;
          const error = err instanceof Error ? err : new Error('PowerSync initialization failed');
          debugLogger.error('SYNC', 'PowerSync initialization error', {
            error: error.message
          });
          setError(error);
        }
      } else {
        setIsDatabaseReady(false);
        setIsInitialized(false);

        if (!hasConnectedRef.current) {
          return;
        }

        try {
          debugLogger.info('SYNC', 'Disconnecting PowerSync (user signed out)');
          await system.disconnect();
          hasConnectedRef.current = false;
          debugLogger.info('SYNC', 'PowerSync disconnected successfully');
        } catch (err) {
          debugLogger.error('SYNC', 'PowerSync disconnect error', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
    };

    void initializePowerSync();
    return () => {
      cancelled = true;
    };
  }, [signedIn, isLoaded, system]);

  useEffect(() => {
    if (!isLoaded || signedIn) {
      return;
    }

    clearBackgroundToken()
      .then(() => {
        debugLogger.info('AUTH', 'Cleared background token cache for signed-out session');
      })
      .catch((error) => {
        debugLogger.warn('AUTH', 'Failed to clear background token cache on sign-out', {
          error: error instanceof Error ? error.message : String(error)
        });
      });
  }, [isLoaded, signedIn]);

  useEffect(() => {
    if (error) {
      debugLogger.error('SYNC', 'PowerSync error state active', {
        error: error.message
      });
    }
  }, [error]);

  const retryInit = useCallback(async () => {
    if (!signedIn || isRetrying) return;
    try {
      setIsRetrying(true);
      await system.initializeLocalDatabase();
      setIsDatabaseReady(true);
      await system.startOnlineServices();
      hasConnectedRef.current = true;
      setIsInitialized(true);
      setError(null);
    } catch (err) {
      const retryError = err instanceof Error ? err : new Error('PowerSync initialization failed');
      setError(retryError);
    } finally {
      setIsRetrying(false);
    }
  }, [signedIn, isRetrying, system]);

  const db = useMemo(() => system.powersync, [system]);
  const status = useMemo(
    () => ({
      isLoaded,
      isSignedIn: signedIn,
      isDatabaseReady,
      isInitialized,
      isRetrying,
      error,
      retryInit
    }),
    [isLoaded, signedIn, isDatabaseReady, isInitialized, isRetrying, error, retryInit]
  );

  return (
    <PowerSyncStatusContext.Provider value={status}>
      <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
    </PowerSyncStatusContext.Provider>
  );
};
