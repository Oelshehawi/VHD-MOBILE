import type { TechnicianTrackingWindow } from '@/types';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { withTimeout } from '@/services/background/withTimeout';
import { locationTrackingCoordinator } from './LocationTrackingCoordinator';
import { debugLogger } from '@/utils/DebugLogger';
import { getLocationOwner } from './LocationAccount';
import { readLocationTrackingState, type PersistedTrackingWindow } from './LocationTrackingState';
import { applyDurableLocationClosures, flushLocationEventQueue } from './LocationEventQueue';
import { migrateLegacyLocationQueue } from './LocationOutbox';

export type LocationRefreshTrigger = 'foreground' | 'background-task' | 'app-resume' | 'mount' | 'geofence-wake';
export const ACTIVE_TRACKING_WINDOWS_SQL = `SELECT * FROM techniciantrackingwindows
  WHERE technicianId = ? AND status IN ('planned', 'active') ORDER BY startsAtUtc ASC`;
let inFlight: Promise<void> | null = null;
let pendingClosure = false;

export function restoreTrackingWindows(windows: PersistedTrackingWindow[], technicianId: string): TechnicianTrackingWindow[] {
  return windows.map(window => ({ ...window, technicianId, status: 'planned',
    timeZone: 'America/Vancouver', expectedDurationMinutes: 0, locationUpdateMode: 'travel_only',
    distanceIntervalMeters: 0, updatedAt: window.definitionUpdatedAt ?? window.startsAtUtc,
    depot: JSON.stringify({ lat: window.depotLat, lng: window.depotLng, radiusMeters: window.depotRadiusMeters }),
    jobSite: JSON.stringify({ lat: window.jobSiteLat, lng: window.jobSiteLng, radiusMeters: window.jobSiteRadiusMeters }) }));
}

async function refreshInternal(trigger: LocationRefreshTrigger): Promise<void> {
  const owner = await getLocationOwner();
  if (!owner) return;
  await applyDurableLocationClosures(owner.appUserId);
  const state = await readLocationTrackingState();
  if (state.ownerAppUserId && state.ownerAppUserId !== owner.appUserId) return;
  // Restore native registration before auth, network, or photo work. This path
  // runs without a mounted ClerkProvider or PowerSyncProvider.
  await locationTrackingCoordinator.sync(restoreTrackingWindows(state.windows, owner.fieldStaffId));
  try {
    const { system, getScheduleMonthBuckets } = require('@/services/database/System') as typeof import('@/services/database/System');
    const db = system.powersync;
    await withTimeout(db.init(), 3000);
    let windows = await withTimeout(db.getAll<TechnicianTrackingWindow>(ACTIVE_TRACKING_WINDOWS_SQL, [owner.fieldStaffId]), 3000);
    const owned = await withTimeout(db.getAll<{ id: string; scheduleId: string }>('SELECT id,scheduleId FROM techniciantrackingwindows WHERE technicianId = ?', [owner.fieldStaffId]), 3000);
    await migrateLegacyLocationQueue(owner.appUserId, new Map(owned.map(window => [window.id, window.scheduleId])));
    if ((await getLocationOwner())?.appUserId !== owner.appUserId) return;
    if (windows.length || db.currentStatus.hasSynced) await locationTrackingCoordinator.sync(windows);
    if (trigger === 'geofence-wake' || trigger === 'background-task' || trigger === 'app-resume' || trigger === 'mount') {
      const token = await getBackgroundToken();
      if (token && !db.currentStatus.connected) {
        const { BackendConnector } = require('@/services/database/BackendConnector') as typeof import('@/services/database/BackendConnector');
        const { getPowerSyncUrl } = require('@/services/ApiClient') as typeof import('@/services/ApiClient');
        const connector = new BackendConnector(null, { tokenProvider: async () =>
          (await getLocationOwner())?.appUserId === owner.appUserId ? getBackgroundToken() : null });
        connector.setEndpoint(getPowerSyncUrl());
        await withTimeout(db.connect(connector, { params: { schedule_months: getScheduleMonthBuckets() } }), 4000);
      }
      if (token) {
        await withTimeout(db.waitForFirstSync(), 4000);
        windows = await withTimeout(db.getAll<TechnicianTrackingWindow>(ACTIVE_TRACKING_WINDOWS_SQL, [owner.fieldStaffId]), 3000);
        if ((await getLocationOwner())?.appUserId === owner.appUserId) await locationTrackingCoordinator.sync(windows);
      }
    }
  } catch (error) {
    debugLogger.warn('LOCATION', 'Using persisted tracking windows; refresh unavailable', {
      trigger, error: error instanceof Error ? error.message : String(error)
    });
  }
  await flushLocationEventQueue();
  const { reportTrackingHealth } = require('./TrackingHealth') as typeof import('./TrackingHealth');
  await reportTrackingHealth();
}

export async function refreshLocationTracking(trigger: LocationRefreshTrigger): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = refreshInternal(trigger).catch(error => {
    debugLogger.error('LOCATION', 'Location tracking refresh failed', {
      trigger, error: error instanceof Error ? error.message : String(error)
    });
  }).finally(() => { inFlight = null; });
  await inFlight;
  if (pendingClosure) {
    pendingClosure = false;
    await refreshLocationTracking('foreground');
  }
}

export async function refreshLocationTrackingAfterClosure(): Promise<void> {
  if (inFlight) { pendingClosure = true; return; }
  await refreshLocationTracking('foreground');
}
