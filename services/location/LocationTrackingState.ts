import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationRegionType, ParsedTrackingWindow } from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';

const LOCATION_TRACKING_STATE_KEY = 'vhd_location_tracking_state_v1';
const MAX_PERSISTED_WINDOWS = 12;

export type PermissionState =
  | { kind: 'granted' }
  | { kind: 'services-disabled' }
  | { kind: 'foreground-denied'; canAskAgain: boolean }
  | { kind: 'background-denied'; canAskAgain: boolean }
  | { kind: 'unavailable' };

type PermissionStateListener = (state: PermissionState | null) => void;
const permissionStateListeners = new Set<PermissionStateListener>();

export function subscribeToPermissionState(listener: PermissionStateListener): () => void {
  permissionStateListeners.add(listener);
  return () => {
    permissionStateListeners.delete(listener);
  };
}

function notifyPermissionStateListeners(state: PermissionState | null): void {
  for (const listener of permissionStateListeners) {
    try {
      listener(state);
    } catch (error) {
      debugLogger.warn('LOCATION', 'Permission state listener threw', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export interface PersistedTrackingWindow {
  id: string;
  scheduleId: string;
  serviceJobId: string;
  startsAtUtc: string;
  scheduledStartAtUtc: string;
  endsAtUtc: string;
  pingIntervalSeconds: number;
  distanceIntervalMeters: number;
}

export interface PersistedGeofenceRegion {
  identifier: string;
  trackingWindowId: string;
  scheduleId: string;
  regionType: LocationRegionType;
  lat: number;
  lng: number;
}

export interface LocationTrackingState {
  windows: PersistedTrackingWindow[];
  geofenceRegions: PersistedGeofenceRegion[];
  arrivedWindowIds: string[];
  activeLocationWindowIds: string[];
  permissionDeniedSentAt?: string;
  locationUpdatesStartedAt?: string;
  lastCoordinatorRunAt?: string;
  lastKnownPermissionState?: PermissionState | null;
}

function normalizePermissionState(value: unknown): PermissionState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const kind = (value as { kind?: unknown }).kind;
  switch (kind) {
    case 'granted':
    case 'services-disabled':
    case 'unavailable':
      return { kind } as PermissionState;
    case 'foreground-denied':
    case 'background-denied': {
      const canAskAgain = (value as { canAskAgain?: unknown }).canAskAgain;
      return {
        kind,
        canAskAgain: typeof canAskAgain === 'boolean' ? canAskAgain : true
      } as PermissionState;
    }
    default:
      return null;
  }
}

const EMPTY_STATE: LocationTrackingState = {
  windows: [],
  geofenceRegions: [],
  arrivedWindowIds: [],
  activeLocationWindowIds: []
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeState(value: Partial<LocationTrackingState> | null): LocationTrackingState {
  if (!value) {
    return { ...EMPTY_STATE };
  }

  return {
    windows: Array.isArray(value.windows) ? value.windows : [],
    geofenceRegions: Array.isArray(value.geofenceRegions) ? value.geofenceRegions : [],
    arrivedWindowIds: uniqueStrings(Array.isArray(value.arrivedWindowIds) ? value.arrivedWindowIds : []),
    activeLocationWindowIds: uniqueStrings(
      Array.isArray(value.activeLocationWindowIds) ? value.activeLocationWindowIds : []
    ),
    permissionDeniedSentAt:
      typeof value.permissionDeniedSentAt === 'string' ? value.permissionDeniedSentAt : undefined,
    locationUpdatesStartedAt:
      typeof value.locationUpdatesStartedAt === 'string'
        ? value.locationUpdatesStartedAt
        : undefined,
    lastCoordinatorRunAt:
      typeof value.lastCoordinatorRunAt === 'string' ? value.lastCoordinatorRunAt : undefined,
    lastKnownPermissionState: normalizePermissionState(value.lastKnownPermissionState)
  };
}

export async function readLocationTrackingState(): Promise<LocationTrackingState> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_TRACKING_STATE_KEY);
    if (!raw) {
      return { ...EMPTY_STATE };
    }

    return normalizeState(JSON.parse(raw) as Partial<LocationTrackingState>);
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to read location tracking state', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { ...EMPTY_STATE };
  }
}

export async function writeLocationTrackingState(state: LocationTrackingState): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_TRACKING_STATE_KEY, JSON.stringify(normalizeState(state)));
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to write location tracking state', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function updateLocationTrackingState(
  updater: (state: LocationTrackingState) => LocationTrackingState
): Promise<LocationTrackingState> {
  const state = await readLocationTrackingState();
  const nextState = normalizeState(updater(state));
  await writeLocationTrackingState(nextState);

  const previous = state.lastKnownPermissionState ?? null;
  const next = nextState.lastKnownPermissionState ?? null;
  if (JSON.stringify(previous) !== JSON.stringify(next)) {
    notifyPermissionStateListeners(next);
  }

  return nextState;
}

export async function clearLocationTrackingState(): Promise<void> {
  await writeLocationTrackingState({ ...EMPTY_STATE });
}

export function toPersistedWindows(windows: ParsedTrackingWindow[]): PersistedTrackingWindow[] {
  return windows.slice(0, MAX_PERSISTED_WINDOWS).map((window) => ({
    id: window.id,
    scheduleId: window.scheduleId,
    serviceJobId: window.serviceJobId,
    startsAtUtc: window.startsAtUtc,
    scheduledStartAtUtc: window.scheduledStartAtUtc,
    endsAtUtc: window.endsAtUtc,
    pingIntervalSeconds: window.pingIntervalSeconds,
    distanceIntervalMeters: window.distanceIntervalMeters
  }));
}

export async function markWindowArrived(windowId: string): Promise<LocationTrackingState> {
  return updateLocationTrackingState((state) => ({
    ...state,
    arrivedWindowIds: uniqueStrings([...state.arrivedWindowIds, windowId])
  }));
}
