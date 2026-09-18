import { fetch as expoFetch } from 'expo/fetch';
import { getLocationOwner } from './LocationAccount';
import { getLocationDatabase, getLocationMeta, setLocationMeta } from './LocationOutbox';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { getApiUrl } from '@/services/ApiClient';
import { parsePowerSyncTokenPayload } from '@/utils/powerSyncToken';
import { readLocationTrackingState, type PersistedTrackingWindow } from './LocationTrackingState';
import { windowsAtSampleTime } from './locationWindowHistory';
import { projectTrackingEvidence, type CaptureClosure, type EvidenceEvent, type EvidenceWindow } from './evidence/trackingEvidence';
import type { MobileLocationEvent } from '@/types/locationTracking';

interface Decisions { observedAt: string; retiredWindowIds: string[]; captureClosures?: CaptureClosure[]; onSiteWindowIds: string[]; lastJobExitAt: string | null; }
export async function getTrackingDecisions(additionalEvents: MobileLocationEvent[] = []): Promise<Decisions | null> {
  const owner = await getLocationOwner();
  if (!owner) return null;
  const server = await getLocationMeta<Decisions>(`${owner.appUserId}:trackingDecisions`);
  const state = await readLocationTrackingState();
  if (![...state.windows, ...(state.historicalWindows ?? [])].some(w => w.captureProtocolVersion === 2)) return server;
  const db = await getLocationDatabase();
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM location_evidence WHERE owner = ? AND recorded_at >= ? ORDER BY recorded_at,id LIMIT 20000', owner.appUserId, Date.now() - 96 * 3600000);
  const events: EvidenceEvent[] = [...rows.map(row => JSON.parse(row.payload) as MobileLocationEvent), ...additionalEvents].map((e, i) => {
    return { ...e, id: e.eventId ?? `pending-${i}`, coordinateSource: e.source === 'geofence' ? 'geofence_target' : 'device_gps' };
  });
  const definitions: EvidenceWindow[] = [...(state.historicalWindows ?? []), ...state.windows]
    .filter(w => w.captureProtocolVersion === 2 && w.jobSiteLat !== undefined && w.depotLat !== undefined)
    .map(w => ({ id: w.id, scheduleId: w.scheduleId, captureProtocolVersion: w.captureProtocolVersion, definitionVersion: w.definitionVersion ?? 1,
      startsAtUtc: w.startsAtUtc, scheduledStartAtUtc: w.scheduledStartAtUtc, recoveryEndsAtUtc: w.recoveryEndsAtUtc ?? w.endsAtUtc,
      expectedCaptureEndsAtUtc: w.expectedCaptureEndsAtUtc,
      effectiveFrom: w.definitionUpdatedAt, effectiveUntil: w.definitionEndsAt,
      jobSite: { lat: w.jobSiteLat!, lng: w.jobSiteLng!, radiusMeters: w.jobSiteRadiusMeters! },
      depot: { lat: w.depotLat!, lng: w.depotLng!, radiusMeters: w.depotRadiusMeters! } }));
  const unique = [...new Map(definitions.map(w => [`${w.id}:${w.definitionVersion}`, w])).values()];
  const result = projectTrackingEvidence(events, unique, new Date(), true);
  const closureKey = `${owner.appUserId}:jobCaptureClosures`;
  const prior = await getLocationMeta<CaptureClosure[]>(closureKey) ?? [];
  const byVersion = new Map<string, CaptureClosure>();
  for (const closure of [...prior, ...(server?.captureClosures ?? []), ...result.captureClosures]) {
    const key = `${closure.windowId}:${closure.definitionVersion}`;
    if (!unique.some(w => `${w.id}:${w.definitionVersion}` === key)) continue;
    const previous = byVersion.get(key);
    if (!previous || Date.parse(closure.closedAt) < Date.parse(previous.closedAt)) byVersion.set(key, closure);
  }
  const captureClosures = [...byVersion.values()];
  if (!additionalEvents.length && (await getLocationOwner())?.appUserId === owner.appUserId)
    await setLocationMeta(closureKey, captureClosures);
  return { observedAt: new Date().toISOString(),
    captureClosures,
    retiredWindowIds: state.windows.filter(w => byVersion.has(`${w.id}:${w.definitionVersion ?? 1}`)).map(w => w.id),
    onSiteWindowIds: Object.entries(result.presence).filter(([, p]) => p.job.state === 'inside').map(([key]) => key.split(':')[0]),
    lastJobExitAt: result.transitions.filter(t => t.region === 'job' && t.type === 'exit').at(-1)?.at ?? server?.lastJobExitAt ?? null };
}

// Apply the same confirmed-exit cutoff to a buffered batch before any upload.
// A fix can still belong to another active assignment after its original job closes.
export async function filterJobCaptureEvents(events: MobileLocationEvent[], windows: PersistedTrackingWindow[]) {
  if (!windows.some(w => w.captureProtocolVersion === 2)) return events;
  const decisions = await getTrackingDecisions(events);
  return events.flatMap(event => {
    if (event.captureProtocolVersion !== 2) return [event];
    const at = Date.parse(event.recordedAt);
    const eligible = windowsAtSampleTime(windows, at).filter(w => w.captureProtocolVersion === 2 &&
      !(decisions?.captureClosures ?? []).some(c => c.windowId === w.id &&
        c.definitionVersion === (w.definitionVersion ?? 1) && at > Date.parse(c.closedAt)));
    const own = eligible.find(w => w.id === event.trackingWindowId);
    const target = own ?? (event.eventType === 'location_ping' ? eligible[0] : undefined);
    return target ? [{ ...event, trackingWindowId: target.id, scheduleId: target.scheduleId,
      windowDefinitionVersion: target.definitionVersion ?? 1 }] : [];
  });
}

export async function applyJobCaptureDecisions(): Promise<void> {
  const owner = await getLocationOwner();
  if (!owner) return;
  const state = await readLocationTrackingState();
  if (state.ownerAppUserId && state.ownerAppUserId !== owner.appUserId) return;
  if (!state.windows.some(w => w.captureProtocolVersion === 2)) return;
  const { locationTrackingCoordinator } = require('./LocationTrackingCoordinator') as typeof import('./LocationTrackingCoordinator');
  const { restoreTrackingWindows } = require('./LocationTrackingRefreshRunner') as typeof import('./LocationTrackingRefreshRunner');
  await locationTrackingCoordinator.sync(restoreTrackingWindows(state.windows, owner.fieldStaffId));
}
export async function refreshTrackingDecisions(): Promise<void> {
  const owner = await getLocationOwner();
  if (!owner) return;
  const key = `${owner.appUserId}:trackingDecisions`;
  const prior = await getLocationMeta<Decisions>(key);
  if (prior && Date.now() - Date.parse(prior.observedAt) < 60000) return;
  const token = await getBackgroundToken();
  if (!token || parsePowerSyncTokenPayload(token)?.app_user_id !== owner.appUserId) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await expoFetch(`${getApiUrl()}/api/mobile/tracking-evidence`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal
    });
    if (!response.ok || (await getLocationOwner())?.appUserId !== owner.appUserId) return;
    const data = await response.json() as Decisions & { captureProtocolVersion?: number };
    if (data.captureProtocolVersion !== 2 || !Array.isArray(data.retiredWindowIds) || !Number.isFinite(Date.parse(data.observedAt))) return;
    if (!prior || Date.parse(data.observedAt) > Date.parse(prior.observedAt)) await setLocationMeta(key, data);
  } catch { /* Existing definitions remain usable offline. */ }
  finally { clearTimeout(timer); }
}
