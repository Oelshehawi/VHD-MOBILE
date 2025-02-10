import React, { createContext, useContext, useEffect, useState } from 'react';
import { getManagerStatus } from '@/cache';
import { useAuth } from '@clerk/clerk-expo';

interface ManagerStatusContextType {
  isManager: boolean;
  setIsManager: (value: boolean) => void;
}

const ManagerStatusContext = createContext<ManagerStatusContextType>({
  isManager: false,
  setIsManager: () => {},
});

export const useManagerStatus = () => useContext(ManagerStatusContext);

export function ManagerStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isManager, setIsManager] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { isSignedIn, getToken } = useAuth();
  // Load initial status from cache

  useEffect(() => {
    const loadCachedStatus = async () => {
      if (!isSignedIn) {
        setIsManager(false);
        setIsLoading(false);
        return;
      }
      try {
        const status = await getManagerStatus();
        setIsManager(status);
      } catch (error) {
        console.error('❌ Error loading cached status:', error);
      }
      setIsLoading(false);
    };
    loadCachedStatus();
  }, [isSignedIn]);

  // Update status from token
  useEffect(() => {
    const loadTokenStatus = async () => {
      if (!isSignedIn) return;

      try {
        const token = await getToken({ template: 'manager-status' });
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const isManagerFromToken = !!payload.claims?.isManager;
          setIsManager(isManagerFromToken);
        }
      } catch (error) {
        console.error('❌ Error getting manager status from token:', error);
      }
    };

    loadTokenStatus();
  }, [isSignedIn, getToken]);

  if (isLoading) {
    return null; // Or a loading spinner if you prefer
  }

  return (
    <ManagerStatusContext.Provider value={{ isManager, setIsManager }}>
      {children}
    </ManagerStatusContext.Provider>
  );
}
