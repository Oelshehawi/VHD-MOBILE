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
  startLocationUpdatesForWindows,
  stopGeofencing,
  stopLocationUpdates,
  syncGeofences
} from '@/services/location/LocationTrackingTasks';
import {
  readLocationTrackingState,
  toPersistedWindows,
  updateLocationTrackingState
} from '@/services/location/LocationTrackingState';
import type {
  PermissionState,
  PersistedTrackingWindow
} from '@/services/location/LocationTrackingState';
import {
  getRelevantTrackingWindows,
  isTravelWindowActive
} from '@/services/location/trackingWindowUtils';

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

function selectActiveTravelWindows(windows: ParsedTrackingWindow[]): ParsedTrackingWindow[] {
  return [...windows]
    .sort((a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc))
    .slice(0, 1);
}

export class LocationTrackingCoordinator {
  private syncInFlight: Promise<void> | null = null;
  private lastWindowSignature = '';

  sync(windows: ReadonlyArray<TechnicianTrackingWindow>): Promise<void> {
    const signature = JSON.stringify(
      windows.map((window) => [
        window.id,
        window.status,
        window.startsAtUtc,
        window.scheduledStartAtUtc,
        window.endsAtUtc,
        window.updatedAt
      ])
    );

    if (this.syncInFlight && signature === this.lastWindowSignature) {
      return this.syncInFlight;
    }

    this.lastWindowSignature = signature;
    this.syncInFlight = this.syncInternal(windows).finally(() => {
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
      lastLocationPingAtByWindowId: {},
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

  private async syncInternal(windows: ReadonlyArray<TechnicianTrackingWindow>): Promise<void> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return;
    }

    await flushLocationEventQueue();

    const relevantWindows = getRelevantTrackingWindows(windows);
    const existingState = await readLocationTrackingState();
    const activeWindows = selectActiveTravelWindows(
      relevantWindows.filter(
        (window) =>
          isTravelWindowActive(window) && !existingState.arrivedWindowIds.includes(window.id)
      )
    );

    if (relevantWindows.length === 0) {
      await this.stopExpiredTracking(existingState.activeLocationWindowIds, existingState.windows);
      if (existingState.geofenceRegions.length > 0) {
        await stopGeofencing();
      }
      await updateLocationTrackingState((state) => ({
        ...state,
        windows: [],
        geofenceRegions: [],
        geofenceSignature: undefined,
        geofenceTransitions: [],
        activeLocationWindowIds: [],
        lastLocationPingAtByWindowId: {},
        locationUpdatesSignature: undefined
      }));
      debugLogger.info('LOCATION', 'No relevant tracking windows; location tasks stopped');
      return;
    }

    await updateLocationTrackingState((state) => ({
      ...state,
      windows: toPersistedWindows(relevantWindows),
      arrivedWindowIds: state.arrivedWindowIds.filter((id) =>
        relevantWindows.some((window) => window.id === id)
      ),
      geofenceTransitions: state.geofenceTransitions.filter((transition) =>
        relevantWindows.some((window) => window.id === transition.trackingWindowId)
      ),
      lastLocationPingAtByWindowId: Object.fromEntries(
        Object.entries(state.lastLocationPingAtByWindowId).filter(([windowId]) =>
          relevantWindows.some((window) => window.id === windowId)
        )
      ),
      lastCoordinatorRunAt: new Date().toISOString()
    }));

    const permissionState = await this.ensureLocationPermission(relevantWindows[0]);
    if (permissionState.kind !== 'granted') {
      await this.stopExpiredTracking(existingState.activeLocationWindowIds, existingState.windows);
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
        locationUpdatesSignature: undefined,
        locationUpdatesStartedAt: undefined
      }));
      debugLogger.warn('LOCATION', 'Location tracking permission unavailable', {
        permissionState,
        windowCount: relevantWindows.length
      });
      return;
    }

    const activeDepotWindowIds = new Set(activeWindows.map((w) => w.id));
    const { regions, metadata } = buildGeofenceRegions(relevantWindows, activeDepotWindowIds);
    await syncGeofences(regions);
    await updateLocationTrackingState((state) => ({
      ...state,
      geofenceRegions: metadata
    }));

    await this.syncLocationUpdates(
      activeWindows,
      existingState.activeLocationWindowIds,
      existingState.windows
    );

    debugLogger.info('LOCATION', 'Location tracking coordinator synced', {
      relevantWindowCount: relevantWindows.length,
      activeTravelWindowCount: activeWindows.length,
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
    const state = await this.readPermissionStateFromOs();
    await this.persistPermissionState(state);
    return state;
  }

  private async readPermissionStateFromOs(): Promise<PermissionState> {
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

  private async ensureLocationPermission(
    windowForDeniedEvent: ParsedTrackingWindow
  ): Promise<PermissionState> {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      await this.sendPermissionDeniedIfNeeded(windowForDeniedEvent);
      const state: PermissionState = { kind: 'services-disabled' };
      await this.persistPermissionState(state);
      return state;
    }

    const foregroundPermission = await Location.getForegroundPermissionsAsync();
    if (!foregroundPermission.granted) {
      await this.sendPermissionDeniedIfNeeded(windowForDeniedEvent);
      const state: PermissionState = {
        kind: 'foreground-denied',
        canAskAgain: foregroundPermission.canAskAgain
      };
      await this.persistPermissionState(state);
      return state;
    }

    const backgroundPermission = await Location.getBackgroundPermissionsAsync();
    if (!backgroundPermission.granted) {
      await this.sendPermissionDeniedIfNeeded(windowForDeniedEvent);
      const state: PermissionState = {
        kind: 'background-denied',
        canAskAgain: backgroundPermission.canAskAgain
      };
      await this.persistPermissionState(state);
      return state;
    }

    const granted: PermissionState = { kind: 'granted' };
    await this.persistPermissionState(granted);
    return granted;
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
    previousActiveWindowIds: string[],
    previousWindows: PersistedTrackingWindow[]
  ): Promise<void> {
    const activeWindowIds = activeWindows.map((window) => window.id);
    const newlyActiveWindows = activeWindows.filter(
      (window) => !previousActiveWindowIds.includes(window.id)
    );
    const stoppedWindowIds = previousActiveWindowIds.filter((id) => !activeWindowIds.includes(id));

    if (activeWindows.length > 0) {
      await startLocationUpdatesForWindows(activeWindows);
      await updateLocationTrackingState((state) => ({
        ...state,
        activeLocationWindowIds: activeWindowIds,
        locationUpdatesStartedAt: state.locationUpdatesStartedAt ?? new Date().toISOString()
      }));
    } else {
      if (previousActiveWindowIds.length > 0) {
        await stopLocationUpdates();
      }
      await updateLocationTrackingState((state) => ({
        ...state,
        activeLocationWindowIds: [],
        lastLocationPingAtByWindowId: {},
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
    previousWindows: PersistedTrackingWindow[]
  ): Promise<void> {
    if (previousActiveWindowIds.length > 0) {
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
