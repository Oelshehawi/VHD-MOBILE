import { Platform } from 'react-native';
import { readTrackingReadiness } from './TrackingReadiness';
import type {
  GeofenceTarget,
  MobileLocationEvent,
  ParsedTrackingWindow,
  TechnicianTrackingWindow
} from '@/types';
import { debugLogger } from '@/utils/DebugLogger';
import { enqueueLocationEvent } from '@/services/location/LocationEventQueue';
import { mergeWindowHistory } from './locationWindowHistory';
import { getLocationOwner } from './LocationAccount';
import {
  buildGeofenceRegions,
  STANDING_DEPOT_REGION_IDENTIFIER,
  stopGeofencing,
  syncGeofences
} from '@/services/location/LocationGeofenceTask';
import {
  startLocationUpdatesForWindows,
  stopLocationUpdates,
  type LocationUpdatesMode
} from '@/services/location/locationTaskShared';
import {
  readLocationTrackingState,
  toPersistedWindows,
  updateLocationTrackingState
} from '@/services/location/LocationTrackingState';
import type {
  LocationTrackingState,
  PermissionState,
  PersistedGeofenceRegion,
  PersistedTrackingWindow
} from '@/services/location/LocationTrackingState';
import { getRelevantTrackingWindows } from '@/services/location/trackingWindowUtils';
import { selectActivePingWindow } from '@/services/location/fieldStatusWindowSelection';
import { isWindowInCurrentTrackingGenerationRange } from '@/services/location/businessDay';
import { emitInitialDepotEnterEvents } from '@/services/location/InitialGeofenceState';

const PERMISSION_DENIED_EVENT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function shouldSendPermissionDenied(lastSentAt?: string): boolean {
  if (!lastSentAt) {
    return true;
  }

  const lastSentAtMs = Date.parse(lastSentAt);
  return (
    Number.isNaN(lastSentAtMs) || Date.now() - lastSentAtMs > PERMISSION_DENIED_EVENT_COOLDOWN_MS
  );
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

async function readPermissionStateFromOs(): Promise<PermissionState> {
  return (await readTrackingReadiness()).permission;
}

function hasPersistedLocationUpdates(state: LocationTrackingState): boolean {
  return state.activeLocationWindowIds.length > 0 || Boolean(state.locationUpdatesStartedAt);
}

const FALLBACK_DEPOT_RADIUS_METERS = 150;

// Depot target for the standing wake region: the most recent knowledge of
// where the technician's shift starts/ends. Today's windows first, then the
// next upcoming window, then yesterday's persisted windows, and finally the
// previously registered standing region so the depot survives multi-day gaps
// (weekends) once persisted windows have been cleared.
function resolveStandingDepotTarget(args: {
  currentDayWindows: ParsedTrackingWindow[];
  upcomingWindows: ParsedTrackingWindow[];
  persistedWindows: PersistedTrackingWindow[];
  previousRegions: PersistedGeofenceRegion[];
}): GeofenceTarget | null {
  const latestCurrent = args.currentDayWindows[args.currentDayWindows.length - 1];
  if (latestCurrent) {
    return latestCurrent.depotTarget;
  }

  const earliestUpcoming = args.upcomingWindows[0];
  if (earliestUpcoming) {
    return earliestUpcoming.depotTarget;
  }

  const latestPersisted = [...args.persistedWindows]
    .sort((a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc))
    .at(-1);
  if (
    latestPersisted &&
    typeof latestPersisted.depotLat === 'number' &&
    typeof latestPersisted.depotLng === 'number'
  ) {
    return {
      lat: latestPersisted.depotLat,
      lng: latestPersisted.depotLng,
      radiusMeters: latestPersisted.depotRadiusMeters ?? FALLBACK_DEPOT_RADIUS_METERS
    };
  }

  const previousStanding = args.previousRegions.find(
    (region) => region.identifier === STANDING_DEPOT_REGION_IDENTIFIER
  );
  if (previousStanding) {
    return {
      lat: previousStanding.lat,
      lng: previousStanding.lng,
      radiusMeters: previousStanding.radiusMeters ?? FALLBACK_DEPOT_RADIUS_METERS
    };
  }

  return null;
}

export class LocationTrackingCoordinator {
  private syncInFlight: Promise<void> | null = null;
  private lastWindowSignature = '';

  sync(windows: ReadonlyArray<TechnicianTrackingWindow>): Promise<void> {
    const signature = windows
      .map((window) => `${window.id}|${window.status}|${window.updatedAt}`)
      .sort()
      .join(',');
    const syncSignature = signature;

    if (this.syncInFlight && syncSignature === this.lastWindowSignature) {
      return this.syncInFlight;
    }

    this.lastWindowSignature = syncSignature;
    const previous = this.syncInFlight ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.syncInternal(windows)).finally(() => {
      if (this.syncInFlight === run) this.syncInFlight = null;
    });
    this.syncInFlight = run;
    return run;
  }

  stop(reason: string): Promise<void> {
    const run = (this.syncInFlight ?? Promise.resolve()).catch(() => undefined).then(() => this.stopInternal(reason));
    this.syncInFlight = run;
    return run.finally(() => { if (this.syncInFlight === run) this.syncInFlight = null; });
  }

  private async stopInternal(reason: string): Promise<void> {
    const state = await readLocationTrackingState();
    const hadActiveLocationUpdates =
      state.activeLocationWindowIds.length > 0 || Boolean(state.locationUpdatesStartedAt);
    const hadGeofences = state.geofenceRegions.length > 0;

    await stopLocationUpdates();
    await stopGeofencing();

    await updateLocationTrackingState((current) => ({
      ...current,
      activeLocationWindowIds: [],
      geofenceRegions: [],
      geofenceSignature: undefined,
      geofenceTransitions: [],
      windows: [],
      historicalWindows: [],
      ownerAppUserId: undefined,
      closedScheduleIds: [],
      exitedWindowIds: [],
      locationUpdatesSignature: undefined,
      locationUpdatesStartedAt: undefined,
      lastCoordinatorRunAt: new Date().toISOString()
    }));

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

    const existingState = await readLocationTrackingState();
    const owner = await getLocationOwner();
    if (!owner || (existingState.ownerAppUserId && existingState.ownerAppUserId !== owner.appUserId)) return;
    const now = new Date();
    const incomingScheduleIds = new Set(windows.map((window) => window.scheduleId));
    const pendingClosedScheduleIds = existingState.closedScheduleIds.filter((scheduleId) =>
      incomingScheduleIds.has(scheduleId)
    );
    const closedScheduleIdSet = new Set(pendingClosedScheduleIds);
    // A local closure acknowledgement suppresses stale PowerSync rows until
    // the backend's expired status reaches the device.
    const liveWindows = windows.filter((window) => !closedScheduleIdSet.has(window.scheduleId));
    const relevantWindows = getRelevantTrackingWindows(liveWindows.map(window => {
      const saved = existingState.windows.find(item => item.id === window.id && (item.definitionVersion ?? 1) === (window.definitionVersion ?? 1));
      return saved && Date.parse(saved.endsAtUtc) > Date.parse(window.endsAtUtc) ? { ...window, endsAtUtc: saved.endsAtUtc } : window;
    }), now);
    // Field Status tracking acts on today's service-date windows, plus
    // next-day pre-cutoff windows whose tracking may begin before midnight.
    // Later future windows from PowerSync must not start tracking today.
    const currentDayWindows = relevantWindows.filter((window) =>
      isWindowInCurrentTrackingGenerationRange(window, now)
    );
    // Upcoming (next business day) windows within the 48h sync lookahead.
    // They never start tracking today, but their job sites are registered as
    // wake regions so iOS can relaunch a force-quit app on first arrival.
    const currentDayWindowIds = new Set(currentDayWindows.map((window) => window.id));
    const upcomingWindows = relevantWindows.filter((window) => !currentDayWindowIds.has(window.id));
    const standingDepotTarget = resolveStandingDepotTarget({
      currentDayWindows,
      upcomingWindows,
      persistedWindows: existingState.windows,
      previousRegions: existingState.geofenceRegions
    });
    // One shared selection rule with the background task: the single selected
    // ping window owns GPS pings for its whole time range; local arrived state
    // only chooses the cadence (travel vs on-site).
    const selectedPingWindow = selectActivePingWindow(
      currentDayWindows,
      existingState.arrivedWindowIds,
      now
    );
    const activeWindows = selectedPingWindow ? [selectedPingWindow] : [];
    const selectedIsOnSite = Boolean(
      selectedPingWindow &&
      existingState.arrivedWindowIds.includes(selectedPingWindow.id) &&
      !existingState.exitedWindowIds.includes(selectedPingWindow.id)
    );
    const locationUpdatesMode: LocationUpdatesMode = selectedIsOnSite ? 'on-site' : 'travel';
    // Depot events (geofence region + synthetic initial enter) only make
    // sense while the selected window is still in its travel phase.
    const travelPhaseWindows =
      selectedPingWindow && !existingState.arrivedWindowIds.includes(selectedPingWindow.id)
        ? [selectedPingWindow]
        : [];

    if (currentDayWindows.length === 0) {
      await this.stopExpiredTracking(
        existingState.activeLocationWindowIds,
        existingState.windows,
        hasPersistedLocationUpdates(existingState)
      );
      // Wind-down keeps wake regions registered (standing depot + upcoming
      // job sites) instead of clearing all geofences: iOS region monitoring
      // relaunches a force-quit app, which BackgroundFetch cannot do. Wake
      // regions never emit presence events outside a window.
      const { regions, metadata } = buildGeofenceRegions([], new Set(), {
        upcomingWindows,
        standingDepotTarget
      });
      const keepWakeRegions =
        regions.length > 0 && (await readPermissionStateFromOs()).kind === 'granted';
      if (keepWakeRegions) {
        await syncGeofences(regions);
      } else if (existingState.geofenceRegions.length > 0) {
        await stopGeofencing();
      }
      await updateLocationTrackingState((state) => ({
        ...state,
        ownerAppUserId: owner.appUserId,
        historicalWindows: mergeWindowHistory(state.historicalWindows ?? [], state.windows, toPersistedWindows(upcomingWindows)),
        windows: toPersistedWindows(upcomingWindows),
        closedScheduleIds: pendingClosedScheduleIds,
        geofenceRegions: keepWakeRegions ? metadata : [],
        geofenceSignature: keepWakeRegions ? state.geofenceSignature : undefined,
        geofenceTransitions: [],
        exitedWindowIds: [],
        activeLocationWindowIds: [],
        locationUpdatesSignature: undefined
      }));
      debugLogger.info(
        'LOCATION',
        'No current business-day tracking windows; location updates stopped',
        {
          wakeRegionCount: keepWakeRegions ? regions.length : 0
        }
      );
      return;
    }

    await updateLocationTrackingState((state) => ({
      ...state,
      ownerAppUserId: owner.appUserId,
      historicalWindows: mergeWindowHistory(state.historicalWindows ?? [], state.windows, toPersistedWindows([...currentDayWindows, ...upcomingWindows])),
      windows: toPersistedWindows([...currentDayWindows, ...upcomingWindows]),
      closedScheduleIds: pendingClosedScheduleIds,
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
        locationUpdatesSignature: undefined,
        locationUpdatesStartedAt: undefined
      }));
      debugLogger.warn('LOCATION', 'Location tracking permission unavailable', {
        permissionState,
        windowCount: currentDayWindows.length
      });
      return;
    }

    // Depot geofence only for the selected window's travel phase; job
    // geofence for every current-day window so a direct-to-next-job arrival
    // is recorded (and so iOS can relaunch a force-quit app on enter/exit).
    // Wake regions (standing depot + upcoming job sites) stay registered even
    // while tracking is active: a mid-shift force-quit leaves the next shift's
    // relaunch triggers armed without waiting for a wind-down run.
    const selectedDepotWindowIds = new Set(travelPhaseWindows.map((w) => w.id));
    const { regions, metadata } = buildGeofenceRegions(currentDayWindows, selectedDepotWindowIds, {
      upcomingWindows,
      standingDepotTarget
    });
    await syncGeofences(regions);
    await updateLocationTrackingState((state) => ({
      ...state,
      geofenceRegions: metadata
    }));

    await this.syncLocationUpdates(
      activeWindows, locationUpdatesMode, existingState.activeLocationWindowIds, existingState.windows
    );

    const platform = locationTrackingPlatform();
    if (platform) {
      await emitInitialDepotEnterEvents({
        activeWindows: travelPhaseWindows,
        platform
      });
    }

    debugLogger.info('LOCATION', 'Location tracking coordinator synced', {
      currentDayWindowCount: currentDayWindows.length,
      activePingWindowCount: activeWindows.length,
      locationUpdatesMode,
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
      await enqueueLocationEvent(event);
    }

    await updateLocationTrackingState((current) => ({
      ...current,
      permissionDeniedSentAt: new Date().toISOString()
    }));
  }

  private async syncLocationUpdates(
    activeWindows: ParsedTrackingWindow[],
    mode: LocationUpdatesMode,
    previousActiveWindowIds: string[],
    previousWindows: PersistedTrackingWindow[]
  ): Promise<void> {
    const activeWindowIds = activeWindows.map((window) => window.id);
    const newlyActiveWindows = activeWindows.filter(
      (window) => !previousActiveWindowIds.includes(window.id)
    );
    const stoppedWindowIds = previousActiveWindowIds.filter((id) => !activeWindowIds.includes(id));
    const persistedState = await readLocationTrackingState();
    const hadLocationUpdates =
      previousActiveWindowIds.length > 0 || Boolean(persistedState.locationUpdatesStartedAt);

    if (activeWindows.length > 0) {
      await startLocationUpdatesForWindows(activeWindows, mode);
      await updateLocationTrackingState((state) => ({
        ...state,
        activeLocationWindowIds: activeWindowIds,
        locationUpdatesStartedAt: state.locationUpdatesStartedAt ?? new Date().toISOString()
      }));
    } else {
      if (hadLocationUpdates) {
        await stopLocationUpdates();
      }
      await updateLocationTrackingState((state) => ({
        ...state,
        activeLocationWindowIds: [],
        locationUpdatesSignature: undefined,
        locationUpdatesStartedAt: undefined
      }));
    }

    for (const window of newlyActiveWindows) {
      const event = createSystemEvent(window, 'tracking_started');
      if (event) {
        await enqueueLocationEvent(event);
      }
    }

    for (const windowId of stoppedWindowIds) {
      const persistedWindow = previousWindows.find((window) => window.id === windowId);
      const event = createSystemEventFromPersistedWindow(
        persistedWindow ?? null,
        'tracking_stopped'
      );
      if (event) {
        await enqueueLocationEvent(event);
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
        await enqueueLocationEvent(event);
      }
    }
  }
}

export const locationTrackingCoordinator = new LocationTrackingCoordinator();
