import { fetch as expoFetch } from 'expo/fetch';
import { getLocationOwner } from './LocationAccount';
import { getLocationDatabase, getLocationMeta, setLocationMeta } from './LocationOutbox';
import { getBackgroundToken } from '@/services/background/BackgroundAuth';
import { getApiUrl } from '@/services/ApiClient';
import { parsePowerSyncTokenPayload } from '@/utils/powerSyncToken';
import { readLocationTrackingState } from './LocationTrackingState';
import { projectTrackingEvidence, type EvidenceEvent, type EvidenceWindow } from './evidence/trackingEvidence';
import type { MobileLocationEvent } from '@/types/locationTracking';

interface Decisions { observedAt: string; retiredWindowIds: string[]; onSiteWindowIds: string[]; lastJobExitAt: string | null; }
export async function getTrackingDecisions(): Promise<Decisions | null> {
  const owner = await getLocationOwner();
  if (!owner) return null;
  const server = await getLocationMeta<Decisions>(`${owner.appUserId}:trackingDecisions`);
  const state = await readLocationTrackingState();
  if (!state.windows.some(w => w.captureProtocolVersion === 2)) return server;
  const db = await getLocationDatabase();
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM location_evidence WHERE owner = ? AND recorded_at >= ? ORDER BY recorded_at,id LIMIT 20000', owner.appUserId, Date.now() - 96 * 3600000);
  const events: EvidenceEvent[] = rows.map(row => {
    const e = JSON.parse(row.payload) as MobileLocationEvent;
    return { ...e, id: e.eventId!, coordinateSource: e.source === 'geofence' ? 'geofence_target' : 'device_gps' };
  });
  const definitions: EvidenceWindow[] = [...(state.historicalWindows ?? []), ...state.windows]
    .filter(w => w.captureProtocolVersion === 2 && w.jobSiteLat !== undefined && w.depotLat !== undefined)
    .map(w => ({ id: w.id, scheduleId: w.scheduleId, captureProtocolVersion: w.captureProtocolVersion, definitionVersion: w.definitionVersion ?? 1,
      startsAtUtc: w.startsAtUtc, scheduledStartAtUtc: w.scheduledStartAtUtc, recoveryEndsAtUtc: w.recoveryEndsAtUtc ?? w.endsAtUtc,
      effectiveFrom: w.definitionUpdatedAt, effectiveUntil: w.definitionEndsAt,
      jobSite: { lat: w.jobSiteLat!, lng: w.jobSiteLng!, radiusMeters: w.jobSiteRadiusMeters! },
      depot: { lat: w.depotLat!, lng: w.depotLng!, radiusMeters: w.depotRadiusMeters! } }));
  const unique = [...new Map(definitions.map(w => [`${w.id}:${w.definitionVersion}`, w])).values()];
  const result = projectTrackingEvidence(events, unique);
  const retired = result.outings.filter(o => o.status !== 'open').flatMap(o => o.windowIds);
  const open = new Set(result.outings.filter(o => o.status === 'open').flatMap(o => o.windowIds));
  const newerLocal = events.some(e => Date.parse(e.recordedAt) > Date.parse(server?.observedAt ?? '1970-01-01'));
  return { observedAt: new Date().toISOString(),
    retiredWindowIds: [...new Set([...retired, ...(server?.retiredWindowIds ?? [])])].filter(id => !(newerLocal && open.has(id))),
    onSiteWindowIds: Object.entries(result.presence).filter(([, p]) => p.job.state === 'inside').map(([key]) => key.split(':')[0]),
    lastJobExitAt: result.transitions.filter(t => t.region === 'job' && t.type === 'exit').at(-1)?.at ?? server?.lastJobExitAt ?? null };
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
