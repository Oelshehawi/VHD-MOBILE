import '@azure/core-asynciterator-polyfill';
import { PowerSyncContext } from '@powersync/react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { System, useSystem } from '../services/database/System';

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
