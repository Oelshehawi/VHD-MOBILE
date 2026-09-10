import { Platform } from 'react-native';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { fetch as expoFetch } from 'expo/fetch';
import { ApiClient } from '@/services/ApiClient';
import type { FetchLike } from '@/services/network/types';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { parsePowerSyncTokenPayload } from '@/utils/powerSyncToken';
import { debugLogger } from '@/utils/DebugLogger';
import { getLocationOwner } from './LocationAccount';
import { getInstallationId, getLocationMeta, getOutboxHealth, setLocationMeta } from './LocationOutbox';
import { readTrackingReadiness, type TrackingReadiness } from './TrackingReadiness';
import { readLocationTrackingState, updateLocationTrackingState } from './LocationTrackingState';
import { isPersistedWindowPingActive, LOCATION_UPDATES_TASK_NAME } from './locationTaskShared';

export interface TrackingHealthSnapshot extends Omit<TrackingReadiness, 'permission'> {
  permissionKind: TrackingReadiness['permission']['kind'];
  installationId: string; platform: 'ios' | 'android'; appVersion: string; buildVersion?: string; updateId?: string;
  locationUpdatesRunning: boolean; geofenceCount: number; activeWindowCount: number;
  lastCaptureAt: string | null; lastUploadAt: string | null; lastAccuracyMeters: number | null;
  queueDepth: number; oldestQueuedAt: string | null; droppedEvents: number; lastErrorCode: string | null;
}
const listeners = new Set<(snapshot: TrackingHealthSnapshot) => void>();
let inFlight: Promise<void> | null = null;

export function subscribeTrackingHealth(listener: (snapshot: TrackingHealthSnapshot) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function readLocalTrackingHealth(): Promise<TrackingHealthSnapshot | null> {
  const owner = await getLocationOwner();
  if (!owner || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
  const readiness = await readTrackingReadiness();
  await updateLocationTrackingState(state => ({ ...state, lastKnownPermissionState: readiness.permission }));
  const state = await readLocationTrackingState();
  const capture = await getLocationMeta<{ recordedAt: string; accuracyMeters: number | null }>(`${owner.appUserId}:capture`);
  const { permission, ...native } = readiness;
  const snapshot: TrackingHealthSnapshot = {
    ...native, permissionKind: permission.kind, installationId: await getInstallationId(),
    platform: Platform.OS, appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildVersion: String(Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber ?? '' : Constants.expoConfig?.android?.versionCode ?? ''),
    updateId: Updates.updateId ?? undefined,
    locationUpdatesRunning: await Location.hasStartedLocationUpdatesAsync(LOCATION_UPDATES_TASK_NAME).catch(() => false),
    geofenceCount: state.geofenceRegions.length,
    activeWindowCount: state.windows.filter(window => isPersistedWindowPingActive(window)).length,
    lastCaptureAt: capture?.recordedAt ?? null, lastAccuracyMeters: capture?.accuracyMeters ?? null,
    lastUploadAt: await getLocationMeta<string>(`${owner.appUserId}:upload`),
    lastErrorCode: await getLocationMeta<string>(`${owner.appUserId}:error`) ?? await getLocationMeta<string>(`${owner.appUserId}:rejection`),
    ...await getOutboxHealth(owner.appUserId)
  };
  if ((await getLocationOwner())?.appUserId !== owner.appUserId) return null;
  await setLocationMeta(`${owner.appUserId}:healthPending`, snapshot);
  for (const listener of listeners) listener(snapshot);
  return snapshot;
}

export async function reportTrackingHealth(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const owner = await getLocationOwner();
    if (!owner) return;
    const snapshot = await readLocalTrackingHealth();
    if (!snapshot) return;
    const lastAttempt = await getLocationMeta<number>(`${owner.appUserId}:healthAttempt`) ?? 0;
    if (Date.now() - lastAttempt < 60000) return;
    await setLocationMeta(`${owner.appUserId}:healthAttempt`, Date.now());
    const client = new ApiClient('', { fetchImpl: expoFetch as unknown as FetchLike, tokenProvider: async () => {
      if ((await getLocationOwner())?.appUserId !== owner.appUserId) return null;
      const token = await getBackgroundToken();
      return token && parsePowerSyncTokenPayload(token)?.app_user_id === owner.appUserId ? token : null;
    } });
    // One replaceable snapshot per account, not an accumulating heartbeat queue.
    if (await client.postTrackingHealth(snapshot)) {
      const pending = await getLocationMeta<TrackingHealthSnapshot>(`${owner.appUserId}:healthPending`);
      if (pending?.observedAt === snapshot.observedAt) await setLocationMeta(`${owner.appUserId}:healthPending`, null);
    }
  })().catch(error => {
    debugLogger.warn('LOCATION', 'Tracking health report deferred', { error: error instanceof Error ? error.message : String(error) });
  }).finally(() => { inFlight = null; });
  return inFlight;
}
