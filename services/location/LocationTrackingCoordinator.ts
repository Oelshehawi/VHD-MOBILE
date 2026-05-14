import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { MobileLocationEvent, ParsedTrackingWindow, TechnicianTrackingWindow } from '@/types';
import { debugLogger } from '@/utils/DebugLogger';
import {
  flushLocationEventQueue,
  postOrQueueLocationEvent
} from '@/services/location/LocationEventQueue';
import {
  buildGeofenceRegions,
  stopGeofencing,
  syncGeofences
} from '@/services/location/LocationGeofenceTask';
import {
  startLocationUpdatesForWindows,
  stopLocationUpdates
} from '@/services/location/locationTaskShared';
import {
  readLocationTrackingState,
  toPersistedWindows,
  updateLocationTrackingState
} from '@/services/location/LocationTrackingState';
import type {
  LocationTrackingState,
  PermissionState,
  PersistedTrackingWindow
} from '@/services/location/LocationTrackingState';
import {
  getRelevantTrackingWindows,
  isTravelWindowActive
} from '@/services/location/trackingWindowUtils';
import { selectActiveTravelWindow } from '@/services/location/fieldStatusWindowSelection';
import { isWindowInCurrentTrackingGenerationRange } from '@/services/location/businessDay';
import { emitInitialDepotEnterEvents } from '@/services/location/InitialGeofenceState';

const PERMISSION_DENIED_EVENT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function shouldSendPermissionDenied(lastSentAt?: string): boolean {
  if (!lastSentAt) {
    return true;
  }

  const lastSentAtMs = Date.parse(lastSentAt);
  return Number.isNaN(lastSentAtMs) || Date.now() - lastSentAtMs > PERMISSION_DENIED_EVENT_COOLDOWN_MS;
}

function locationTrackingPlatform(): MobileLocationEvent['platform'] | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }

  return null;
}

function createSystemEvent(
  window: Pick<ParsedTrackingWindow, 'id' | 'scheduleId'> | null,
  eventType: MobileLocationEvent['eventType']
): MobileLocationEvent | null {
  const platform = locationTrackingPlatform();
  if (!platform) {
    return null;
  }

  return {
    trackingWindowId: window?.id,
    scheduleId: window?.scheduleId,
    eventType,
    recordedAt: new Date().toISOString(),
    source: 'system',
    platform
  };
}

function createSystemEventFromPersistedWindow(
  window: Pick<PersistedTrackingWindow, 'id' | 'scheduleId'> | null,
  eventType: MobileLocationEvent['eventType']
): MobileLocationEvent | null {
  return createSystemEvent(window, eventType);
}

function selectArrivalHeartbeatWindows(
  windows: ParsedTrackingWindow[],
  arrivedWindowIds: string[],
  exitedWindowIds: string[]
): ParsedTrackingWindow[] {
  return windows.filter(
    (window) =>
      arrivedWindowIds.includes(window.id) &&
      !exitedWindowIds.includes(window.id) &&
      isTravelWindowActive(window)
  );
}

async function readPermissionStateFromOs(): Promise<PermissionState> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    return { kind: 'services-disabled' };
  }

  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    return { kind: 'foreground-denied', canAskAgain: foreground.canAskAgain };
  }

  const background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) {
    return { kind: 'background-denied', canAskAgain: background.canAskAgain };
  }

  return { kind: 'granted' };
}

function hasPersistedLocationUpdates(state: LocationTrackingState): boolean {
  return (
    state.activeLocationWindowIds.length > 0 ||
    state.arrivalHeartbeatWindowIds.length > 0 ||
    Boolean(state.locationUpdatesStartedAt)
  );
}

export class LocationTrackingCoordinator {
  private syncInFlight: Promise<void> | null = null;
  private lastWindowSignature = '';

  sync(
    windows: ReadonlyArray<TechnicianTrackingWindow>,
    completedScheduleIds: ReadonlySet<string> = new Set()
  ): Promise<void> {
    const signature = windows
      .map((window) => `${window.id}|${window.status}|${window.updatedAt}`)
      .sort()
      .join(',');
    const completedSignature = Array.from(completedScheduleIds).sort().join(',');
    const syncSignature = `${signature}::completed:${completedSignature}`;

    if (this.syncInFlight && syncSignature === this.lastWindowSignature) {
      return this.syncInFlight;
    }

    this.lastWindowSignature = syncSignature;
    this.syncInFlight = this.syncInternal(windows, completedScheduleIds).finally(() => {
      this.syncInFlight = null;
    });

    return this.syncInFlight;
  }

  async stop(reason: string): Promise<void> {
    const state = await readLocationTrackingState();
    const hadActiveLocationUpdates =
      state.activeLocationWindowIds.length > 0 || Boolean(state.locationUpdatesStartedAt);
    const hadGeofences = state.geofenceRegions.length > 0;

    if (hadActiveLocationUpdates) {
      await stopLocationUpdates();
    }
    if (hadGeofences) {
      await stopGeofencing();
    }

    await updateLocationTrackingState((current) => ({
      ...current,
      activeLocationWindowIds: [],
      geofenceRegions: [],
      geofenceSignature: undefined,
      geofenceTransitions: [],
      windows: [],
      exitedWindowIds: [],
      lastLocationPingAtByWindowId: {},
      arrivalHeartbeatWindowIds: [],
      lastArrivalHeartbeatAtByWindowId: {},
      pendingOutsideJobCheckByWindowId: {},
      locationUpdatesSignature: undefined,
      lastCoordinatorRunAt: new Date().toISOString()
    }));

    for (const windowId of state.activeLocationWindowIds) {
      const stoppedWindow = state.windows.find((window) => window.id === windowId);
      const event = createSystemEventFromPersistedWindow(stoppedWindow ?? null, 'tracking_stopped');
      if (event) {
        await postOrQueueLocationEvent(event);
      }
    }

    debugLogger.info('LOCATION', 'Location tracking coordinator stopped', {
      reason,
      hadActiveLocationUpdates,
      hadGeofences
    });
  }

  private async syncInternal(
    windows: ReadonlyArray<TechnicianTrackingWindow>,
    completedScheduleIds: ReadonlySet<string>
  ): Promise<void> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return;
    }

    await flushLocationEventQueue();

    const now = new Date();
    const liveWindows = windows.filter((window) => !completedScheduleIds.has(window.scheduleId));
    const relevantWindows = getRelevantTrackingWindows(liveWindows, now);
    const existingState = await readLocationTrackingState();
    // Field Status tracking acts on today's service-date windows, plus
    // next-day pre-cutoff windows whose tracking may begin before midnight.
    // Later future windows from PowerSync must not start tracking today.
    const currentDayWindows = relevantWindows.filter((window) =>
      isWindowInCurrentTrackingGenerationRange(window, now)
    );
    // One shared selection rule with the backend: the single selected travel
    // window owns depot events and GPS pings.
    const selectedTravelWindow = selectActiveTravelWindow(
      currentDayWindows,
      existingState.arrivedWindowIds,
      existingState.exitedWindowIds,
      now
    );
    const activeWindows = selectedTravelWindow ? [selectedTravelWindow] : [];
    const arrivalHeartbeatWindows = selectArrivalHeartbeatWindows(
      currentDayWindows,
      existingState.arrivedWindowIds,
      existingState.exitedWindowIds
    );

    if (currentDayWindows.length === 0) {
      await this.stopExpiredTracking(
        existingState.activeLocationWindowIds,
        existingState.windows,
        hasPersistedLocationUpdates(existingState)
      );
      if (existingState.geofenceRegions.length > 0) {
        await stopGeofencing();
      }
      await updateLocationTrackingState((state) => ({
        ...state,
        windows: [],
        geofenceRegions: [],
        geofenceSignature: undefined,
        geofenceTransitions: [],
        exitedWindowIds: [],
        activeLocationWindowIds: [],
        lastLocationPingAtByWindowId: {},
        arrivalHeartbeatWindowIds: [],
        lastArrivalHeartbeatAtByWindowId: {},
        pendingOutsideJobCheckByWindowId: {},
        locationUpdatesSignature: undefined
      }));
      debugLogger.info('LOCATION', 'No current business-day tracking windows; location tasks stopped');
      return;
    }

    await updateLocationTrackingState((state) => ({
      ...state,
      windows: toPersistedWindows(currentDayWindows),
      lastCoordinatorRunAt: new Date().toISOString()
    }));

    const permissionState = await this.ensureLocationPermission(currentDayWindows[0]);
    if (permissionState.kind !== 'granted') {
      await this.stopExpiredTracking(
        existingState.activeLocationWindowIds,
        existingState.windows,
        hasPersistedLocationUpdates(existingState)
      );
      if (existingState.geofenceRegions.length > 0) {
        await stopGeofencing();
      }
      await updateLocationTrackingState((state) => ({
        ...state,
        activeLocationWindowIds: [],
        geofenceRegions: [],
        geofenceSignature: undefined,
        geofenceTransitions: [],
        lastLocationPingAtByWindowId: {},
        arrivalHeartbeatWindowIds: [],
        lastArrivalHeartbeatAtByWindowId: {},
        pendingOutsideJobCheckByWindowId: {},
        locationUpdatesSignature: undefined,
        locationUpdatesStartedAt: undefined
      }));
      debugLogger.warn('LOCATION', 'Location tracking permission unavailable', {
        permissionState,
        windowCount: currentDayWindows.length
      });
      return;
    }

    // Depot geofence only for the selected travel window; job geofence for
    // every current-day window so a direct-to-next-job arrival is recorded.
    const selectedDepotWindowIds = new Set(activeWindows.map((w) => w.id));
    const { regions, metadata } = buildGeofenceRegions(currentDayWindows, selectedDepotWindowIds);
    await syncGeofences(regions);
    await updateLocationTrackingState((state) => ({
      ...state,
      geofenceRegions: metadata
    }));

    const platform = locationTrackingPlatform();
    if (platform) {
      await emitInitialDepotEnterEvents({
        activeWindows,
        platform
      });
    }

    await this.syncLocationUpdates(
      activeWindows,
      arrivalHeartbeatWindows,
      existingState.activeLocationWindowIds,
      existingState.windows
    );

    debugLogger.info('LOCATION', 'Location tracking coordinator synced', {
      currentDayWindowCount: currentDayWindows.length,
      activeTravelWindowCount: activeWindows.length,
      arrivalHeartbeatWindowCount: arrivalHeartbeatWindows.length,
      geofenceRegionCount: regions.length
    });
  }

  private async persistPermissionState(state: PermissionState): Promise<void> {
    await updateLocationTrackingState((current) => ({
      ...current,
      lastKnownPermissionState: state
    }));
  }

  async checkLocationPermissionStatus(): Promise<PermissionState> {
    const state = await readPermissionStateFromOs();
    await this.persistPermissionState(state);
    return state;
  }

  private async ensureLocationPermission(
    windowForDeniedEvent: ParsedTrackingWindow
  ): Promise<PermissionState> {
    const state = await readPermissionStateFromOs();
    if (state.kind !== 'granted') {
      await this.sendPermissionDeniedIfNeeded(windowForDeniedEvent);
    }
    await this.persistPermissionState(state);
    return state;
  }

  private async sendPermissionDeniedIfNeeded(window: ParsedTrackingWindow): Promise<void> {
    const state = await readLocationTrackingState();
    if (!shouldSendPermissionDenied(state.permissionDeniedSentAt)) {
      return;
    }

    const event = createSystemEvent(window, 'permission_denied');
    if (event) {
      await postOrQueueLocationEvent(event);
    }

    await updateLocationTrackingState((current) => ({
      ...current,
      permissionDeniedSentAt: new Date().toISOString()
    }));
  }

  private async syncLocationUpdates(
    activeWindows: ParsedTrackingWindow[],
    arrivalHeartbeatWindows: ParsedTrackingWindow[],
    previousActiveWindowIds: string[],
    previousWindows: PersistedTrackingWindow[]
  ): Promise<void> {
    const activeWindowIds = activeWindows.map((window) => window.id);
    const arrivalHeartbeatWindowIds = arrivalHeartbeatWindows.map((window) => window.id);
    const newlyActiveWindows = activeWindows.filter(
      (window) => !previousActiveWindowIds.includes(window.id)
    );
    const stoppedWindowIds = previousActiveWindowIds.filter((id) => !activeWindowIds.includes(id));
    const locationUpdateWindows = [...activeWindows, ...arrivalHeartbeatWindows];
    const persistedState = await readLocationTrackingState();
    const hadLocationUpdates =
      previousActiveWindowIds.length > 0 ||
      persistedState.arrivalHeartbeatWindowIds.length > 0 ||
      Boolean(persistedState.locationUpdatesStartedAt);

    if (locationUpdateWindows.length > 0) {
      await startLocationUpdatesForWindows(
        locationUpdateWindows,
        activeWindows.length > 0 ? 'travel' : 'arrival-heartbeat'
      );
      await updateLocationTrackingState((state) => ({
        ...state,
        activeLocationWindowIds: activeWindowIds,
        arrivalHeartbeatWindowIds,
        locationUpdatesStartedAt: state.locationUpdatesStartedAt ?? new Date().toISOString()
      }));
    } else {
      if (hadLocationUpdates) {
        await stopLocationUpdates();
      }
      await updateLocationTrackingState((state) => ({
        ...state,
        activeLocationWindowIds: [],
        arrivalHeartbeatWindowIds: [],
        lastLocationPingAtByWindowId: {},
        lastArrivalHeartbeatAtByWindowId: {},
        pendingOutsideJobCheckByWindowId: {},
        locationUpdatesSignature: undefined,
        locationUpdatesStartedAt: undefined
      }));
    }

    for (const window of newlyActiveWindows) {
      const event = createSystemEvent(window, 'tracking_started');
      if (event) {
        await postOrQueueLocationEvent(event);
      }
    }

    for (const windowId of stoppedWindowIds) {
      const persistedWindow = previousWindows.find((window) => window.id === windowId);
      const event = createSystemEventFromPersistedWindow(persistedWindow ?? null, 'tracking_stopped');
      if (event) {
        await postOrQueueLocationEvent(event);
      }
    }
  }

  private async stopExpiredTracking(
    previousActiveWindowIds: string[],
    previousWindows: PersistedTrackingWindow[],
    hadLocationUpdates: boolean = previousActiveWindowIds.length > 0
  ): Promise<void> {
    if (hadLocationUpdates) {
      await stopLocationUpdates();
    }

    for (const windowId of previousActiveWindowIds) {
      const window = previousWindows.find((item) => item.id === windowId);
      const event = createSystemEventFromPersistedWindow(window ?? null, 'tracking_stopped');
      if (event) {
        await postOrQueueLocationEvent(event);
      }
    }
  }
}

export const locationTrackingCoordinator = new LocationTrackingCoordinator();
