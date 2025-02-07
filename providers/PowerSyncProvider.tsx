import '@azure/core-asynciterator-polyfill';
import { PowerSyncContext } from '@powersync/react-native';
import { ReactNode, useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { System, useSystem } from '../services/database/System';

console.log('PowerSyncProvider environment:', {
  isExpoGo: Constants.appOwnership === 'expo',
  appOwnership: Constants.appOwnership,
});

const isExpoGo = Constants.appOwnership === 'expo';

const TECHNICIAN_MAP: Record<string, string> = {
  user_2mqv5uvRlgBoXqWxPj3j1tAKXcE: 'Mohnad Elkeliny',
  user_2niPyF6ZPTOmNwxooRZu2F7ypMd: 'Ahmed Habib',
  user_2fFg8dDRtCeNEP9IVmQrFAAGrpT: 'Ziad Elshehawi',
} as const;

export const getTechnicianName = (userId: string): string => {
  return TECHNICIAN_MAP[userId] || 'Unknown';
};


export const PowerSyncProvider = ({ children }: { children: ReactNode }) => {
  const { isSignedIn } = useAuth();
  const system: System = useSystem();

  useEffect(() => {
    console.log('PowerSync auth state:', { isSignedIn });
  }, [isSignedIn]);

  // If in Expo Go, just render children
  if (isExpoGo) {
    console.warn(
      'PowerSync is not supported in Expo Go. Please use a development build.'
    );
    return <>{children}</>;
  }

  // Initialize PowerSync when signed in
  useEffect(() => {
    if (isSignedIn) {
      console.log('Initializing PowerSync...');
      system
        .init()
        .then(() => console.log('PowerSync initialized successfully'))
        .catch((error) =>
          console.error('PowerSync initialization error:', error)
        );
    }
  }, [isSignedIn]);

  const db = useMemo(() => {
    return system.powersync;
  }, []);

  return (
    <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
  );
};
