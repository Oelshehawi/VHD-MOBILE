import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  LocationEventType,
  LocationRegionType,
  ParsedTrackingWindow
} from '@/types/locationTracking';
import { debugLogger } from '@/utils/DebugLogger';

const LOCATION_TRACKING_STATE_KEY = 'vhd_location_tracking_state_v1';
const MAX_PERSISTED_WINDOWS = 12;
let stateMutationTail: Promise<void> = Promise.resolve();

function runStateMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const run = stateMutationTail.then(mutation, mutation);
  stateMutationTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

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
  onSitePingIntervalSeconds?: number | null;
  depotLat?: number;
  depotLng?: number;
  depotRadiusMeters?: number;
  jobSiteLat?: number;
  jobSiteLng?: number;
  jobSiteRadiusMeters?: number;
}

export interface PersistedGeofenceRegion {
  identifier: string;
  // Empty for the standing depot wake region, which belongs to no window.
  trackingWindowId: string;
  scheduleId: string;
  regionType: LocationRegionType;
  lat: number;
  lng: number;
  radiusMeters?: number;
  // 'wake' regions exist only to relaunch a force-quit app via OS region
  // monitoring; they never emit presence events. Absent means 'tracking'.
  purpose?: 'tracking' | 'wake';
}

export interface PersistedGeofenceTransition {
  key: string;
  trackingWindowId: string;
  regionType: LocationRegionType;
  eventType: Extract<LocationEventType, 'geofence_enter' | 'geofence_exit'>;
  recordedAt: string;
}

export interface LocationTrackingState {
  windows: PersistedTrackingWindow[];
  // Server-confirmed schedule closures suppress stale PowerSync window rows
  // until their expired status arrives locally.
  closedScheduleIds: string[];
  geofenceRegions: PersistedGeofenceRegion[];
  geofenceSignature?: string;
  // When regions were last (re-)registered with the OS. iOS reports the
  // device's *initial* state for a freshly registered region as an enter, so a
  // geofence_enter shortly after this timestamp may be a re-registration
  // artifact rather than a real crossing.
  geofenceRegionsRegisteredAt?: string;
  geofenceTransitions: PersistedGeofenceTransition[];
  arrivedWindowIds: string[];
  exitedWindowIds: string[];
  activeLocationWindowIds: string[];
  lastLocationPingAtByWindowId: Record<string, string>;
  initialDepotCheckedWindowIds: string[];
  permissionDeniedSentAt?: string;
  locationUpdatesStartedAt?: string;
  locationUpdatesSignature?: string;
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
  closedScheduleIds: [],
  geofenceRegions: [],
  geofenceTransitions: [],
  arrivedWindowIds: [],
  exitedWindowIds: [],
  activeLocationWindowIds: [],
  lastLocationPingAtByWindowId: {},
  initialDepotCheckedWindowIds: []
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeGeofenceTransitions(value: unknown): PersistedGeofenceTransition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is PersistedGeofenceTransition => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const candidate = item as Partial<PersistedGeofenceTransition>;
    return (
      typeof candidate.key === 'string' &&
      typeof candidate.trackingWindowId === 'string' &&
      (candidate.regionType === 'depot' || candidate.regionType === 'job') &&
      (candidate.eventType === 'geofence_enter' || candidate.eventType === 'geofence_exit') &&
      typeof candidate.recordedAt === 'string'
    );
  });
}

function normalizeLastLocationPingAt(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, timestamp]) => {
    if (key && typeof timestamp === 'string') {
      acc[key] = timestamp;
    }
    return acc;
  }, {});
}

function normalizeState(value: Partial<LocationTrackingState> | null): LocationTrackingState {
  if (!value) {
    return { ...EMPTY_STATE };
  }

  return {
    windows: Array.isArray(value.windows) ? value.windows : [],
    closedScheduleIds: uniqueStrings(
      Array.isArray(value.closedScheduleIds) ? value.closedScheduleIds : []
    ),
    geofenceRegions: Array.isArray(value.geofenceRegions) ? value.geofenceRegions : [],
    geofenceSignature:
      typeof value.geofenceSignature === 'string' ? value.geofenceSignature : undefined,
    geofenceRegionsRegisteredAt:
      typeof value.geofenceRegionsRegisteredAt === 'string'
        ? value.geofenceRegionsRegisteredAt
        : undefined,
    geofenceTransitions: normalizeGeofenceTransitions(value.geofenceTransitions),
    arrivedWindowIds: uniqueStrings(
      Array.isArray(value.arrivedWindowIds) ? value.arrivedWindowIds : []
    ),
    exitedWindowIds: uniqueStrings(
      Array.isArray(value.exitedWindowIds) ? value.exitedWindowIds : []
    ),
    activeLocationWindowIds: uniqueStrings(
      Array.isArray(value.activeLocationWindowIds) ? value.activeLocationWindowIds : []
    ),
    lastLocationPingAtByWindowId: normalizeLastLocationPingAt(value.lastLocationPingAtByWindowId),
    initialDepotCheckedWindowIds: uniqueStrings(
      Array.isArray(value.initialDepotCheckedWindowIds) ? value.initialDepotCheckedWindowIds : []
    ),
    permissionDeniedSentAt:
      typeof value.permissionDeniedSentAt === 'string' ? value.permissionDeniedSentAt : undefined,
    locationUpdatesStartedAt:
      typeof value.locationUpdatesStartedAt === 'string'
        ? value.locationUpdatesStartedAt
        : undefined,
    locationUpdatesSignature:
      typeof value.locationUpdatesSignature === 'string'
        ? value.locationUpdatesSignature
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

function pruneOrphanKeys(state: LocationTrackingState): LocationTrackingState {
  const windowIds = new Set(state.windows.map((window) => window.id));
  const filterRecord = (record: Record<string, string>): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (windowIds.has(key)) {
        next[key] = value;
      }
    }
    return next;
  };
  return {
    ...state,
    arrivedWindowIds: state.arrivedWindowIds.filter((id) => windowIds.has(id)),
    exitedWindowIds: state.exitedWindowIds.filter((id) => windowIds.has(id)),
    activeLocationWindowIds: state.activeLocationWindowIds.filter((id) => windowIds.has(id)),
    initialDepotCheckedWindowIds: state.initialDepotCheckedWindowIds.filter((id) =>
      windowIds.has(id)
    ),
    geofenceTransitions: state.geofenceTransitions.filter((t) => windowIds.has(t.trackingWindowId)),
    lastLocationPingAtByWindowId: filterRecord(state.lastLocationPingAtByWindowId)
  };
}

async function writeLocationTrackingStateUnsafe(state: LocationTrackingState): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LOCATION_TRACKING_STATE_KEY,
      JSON.stringify(pruneOrphanKeys(normalizeState(state)))
    );
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to write location tracking state', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function writeLocationTrackingState(state: LocationTrackingState): Promise<void> {
  await runStateMutation(() => writeLocationTrackingStateUnsafe(state));
}

export async function updateLocationTrackingState(
  updater: (state: LocationTrackingState) => LocationTrackingState
): Promise<LocationTrackingState> {
  return runStateMutation(async () => {
    const state = await readLocationTrackingState();
    const nextState = normalizeState(updater(state));
    await writeLocationTrackingStateUnsafe(nextState);

    const previous = state.lastKnownPermissionState ?? null;
    const next = nextState.lastKnownPermissionState ?? null;
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      notifyPermissionStateListeners(next);
    }

    return nextState;
  });
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
    onSitePingIntervalSeconds: window.onSitePingIntervalSeconds ?? null,
    depotLat: window.depotTarget.lat,
    depotLng: window.depotTarget.lng,
    depotRadiusMeters: window.depotTarget.radiusMeters,
    jobSiteLat: window.jobSiteTarget.lat,
    jobSiteLng: window.jobSiteTarget.lng,
    jobSiteRadiusMeters: window.jobSiteTarget.radiusMeters
  }));
}

// Re-entry fully re-arms: an earlier (possibly spurious) exit must not lock a
// window out of on-site cadence for the rest of the day.
export async function markWindowArrived(windowId: string): Promise<LocationTrackingState> {
  return updateLocationTrackingState((state) => ({
    ...state,
    arrivedWindowIds: uniqueStrings([...state.arrivedWindowIds, windowId]),
    exitedWindowIds: state.exitedWindowIds.filter((id) => id !== windowId)
  }));
}

// An exit only switches cadence back to travel (the server decides real
// departures from the ping stream); pinging continues for the whole window.
export async function markWindowExited(windowId: string): Promise<LocationTrackingState> {
  return updateLocationTrackingState((state) => ({
    ...state,
    exitedWindowIds: uniqueStrings([...state.exitedWindowIds, windowId])
  }));
}

export async function markScheduleTrackingClosed(
  scheduleId: string
): Promise<LocationTrackingState> {
  return updateLocationTrackingState((state) => {
    const closedWindowIds = new Set(
      state.windows.filter((window) => window.scheduleId === scheduleId).map((window) => window.id)
    );
    const keepWindow = (window: PersistedTrackingWindow) => window.scheduleId !== scheduleId;
    const keepWindowId = (windowId: string) => !closedWindowIds.has(windowId);

    return {
      ...state,
      windows: state.windows.filter(keepWindow),
      closedScheduleIds: uniqueStrings([...state.closedScheduleIds, scheduleId]),
      geofenceRegions: state.geofenceRegions.filter((region) => region.scheduleId !== scheduleId),
      geofenceSignature: undefined,
      geofenceTransitions: state.geofenceTransitions.filter((transition) =>
        keepWindowId(transition.trackingWindowId)
      ),
      arrivedWindowIds: state.arrivedWindowIds.filter(keepWindowId),
      exitedWindowIds: state.exitedWindowIds.filter(keepWindowId),
      activeLocationWindowIds: state.activeLocationWindowIds.filter(keepWindowId),
      initialDepotCheckedWindowIds: state.initialDepotCheckedWindowIds.filter(keepWindowId),
      lastLocationPingAtByWindowId: Object.fromEntries(
        Object.entries(state.lastLocationPingAtByWindowId).filter(([windowId]) =>
          keepWindowId(windowId)
        )
      )
    };
  });
}

export async function recordGeofenceTransition(
  transition: Omit<PersistedGeofenceTransition, 'key'>
): Promise<{ shouldEmit: boolean; state: LocationTrackingState }> {
  const key = `${transition.trackingWindowId}:${transition.regionType}`;
  const nextTransition: PersistedGeofenceTransition = {
    ...transition,
    key
  };

  let shouldEmit = true;
  const state = await updateLocationTrackingState((current) => {
    const previousTransition = current.geofenceTransitions.find((item) => item.key === key);
    shouldEmit = previousTransition?.eventType !== transition.eventType;

    if (!shouldEmit) {
      return current;
    }

    return {
      ...current,
      geofenceTransitions: [
        ...current.geofenceTransitions.filter((item) => item.key !== key),
        nextTransition
      ]
    };
  });

  return { shouldEmit, state };
}
