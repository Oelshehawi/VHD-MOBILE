import type { MobileLocationEvent } from '@/types/locationTracking';
import type { PersistedTrackingWindow } from './LocationTrackingState';
import { classifySampleForTarget } from './evidence/locationPresenceEngine';

type Fix = Pick<MobileLocationEvent, 'lat' | 'lng' | 'accuracyMeters' | 'recordedAt'>;

// One physical cadence for all V2 jobs. Retain the first two decisive fixes
// on either side of a boundary, even when the ordinary cadence is not due.
export function shouldRetainPhysicalFix(
  fix: Fix,
  previous: Fix[],
  windows: PersistedTrackingWindow[],
  intervalSeconds: number,
): boolean {
  const last = previous.at(-1);
  if (!last || Date.parse(fix.recordedAt) - Date.parse(last.recordedAt) >= intervalSeconds * 1000) return true;
  if (Date.parse(fix.recordedAt) <= Date.parse(last.recordedAt)) return false;
  const classify = (sample: Fix, target: { lat: number; lng: number; radiusMeters: number }) =>
    sample.lat === undefined || sample.lng === undefined ? 'uncertain' :
      classifySampleForTarget({ lat: sample.lat, lng: sample.lng, accuracyMeters: sample.accuracyMeters }, target);
  return windows.some(window => {
    const targets = [
      { lat: window.jobSiteLat, lng: window.jobSiteLng, radiusMeters: window.jobSiteRadiusMeters },
      { lat: window.depotLat, lng: window.depotLng, radiusMeters: window.depotRadiusMeters },
    ];
    return targets.some(target => {
      if (target.lat == null || target.lng == null || target.radiusMeters == null) return false;
      const boundary = { lat: target.lat, lng: target.lng, radiusMeters: target.radiusMeters };
      const current = classify(fix, boundary);
      if (current !== 'inside' && current !== 'outside') return false;
      return previous.length < 2 || previous.some(sample => classify(sample, boundary) !== current);
    });
  });
}
