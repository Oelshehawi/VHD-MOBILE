import { useEffect, useState } from 'react';
import {
  readLocationTrackingState,
  subscribeToPermissionState
} from '@/services/location/LocationTrackingState';
import type { PermissionState } from '@/services/location/LocationTrackingState';

export function useLocationPermissionState(): PermissionState | null {
  const [state, setState] = useState<PermissionState | null>(null);

  useEffect(() => {
    let cancelled = false;

    void readLocationTrackingState().then((persisted) => {
      if (cancelled) return;
      setState(persisted.lastKnownPermissionState ?? null);
    });

    const unsubscribe = subscribeToPermissionState((next) => {
      if (cancelled) return;
      setState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
