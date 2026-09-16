// Mirrored from projectvhd/app/lib/locationPresenceEngine.ts; keep replay fixtures in parity.
// Pure geofence-presence engine. The server derives enter/exit transitions
// from streamed device samples with hysteresis so a single GPS-drift sample
// can never flip a technician's on-site state. No mongoose or data-layer
// imports (dispatcher/travelFallback pulls in the Mongo connection at import
// time) — this module is unit-tested with node --test.

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export const TRANSITION_MAX_ACCURACY_METERS = 150;
export const HYSTERESIS_BAND_METERS = 60;
export const MAX_ACCURACY_ALLOWANCE_METERS = 75;
export const ENTER_CONSECUTIVE_SAMPLES = 2;
export const EXIT_MIN_SPAN_MS = 3 * 60 * 1000;
export const EXIT_SINGLE_STREAK_MS = 6 * 60 * 1000;
export const GEOFENCE_HINT_MAX_AGE_MS = 10 * 60 * 1000;
// How far behind the newest accepted sample a geofence hint may arrive and
// still be applied. Covers the normal delivery race (an OS geofence event
// reordered behind a ping recorded shortly after); anything later is a
// delayed/offline-queued event whose evidence the sample stream has already
// superseded, and letting it through could confirm a bogus transition.
export const HINT_MAX_LATENESS_MS = 3 * 60 * 1000;

export type PresenceRegionId = 'job' | 'depot';
export type RegionPresenceState = 'unknown' | 'inside' | 'outside';

export interface PresenceRegionTarget {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface PresenceSample {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  recordedAt: Date;
}

export interface PresenceGeofenceHint {
  type: 'enter' | 'exit';
  at: Date;
  // The OS reported the device's initial state for a freshly registered
  // region, not an observed crossing. Recorded as presence evidence but never
  // allowed to confirm a transition: its timestamp is registration time, which
  // for a suspended app on a job site is closer to departure than to arrival.
  initialState?: boolean;
}

export interface RegionPresence {
  state: RegionPresenceState;
  consecutiveInside: number;
  consecutiveOutside: number;
  firstInsideAt?: Date | null;
  firstOutsideAt?: Date | null;
  lastSampleAt?: Date | null;
  hint?: PresenceGeofenceHint | null;
}

export interface WindowPresence {
  job: RegionPresence;
  depot: RegionPresence;
  // Start of the current confirmed on-site segment at the job region; cleared
  // when the matching exit is confirmed.
  currentEnterAt?: Date | null;
}

export interface PresenceTransition {
  region: PresenceRegionId;
  type: 'enter' | 'exit';
  at: Date;
  // For job exits: the confirmed enter that opened this on-site segment, so
  // callers can accumulate segment duration without re-reading state.
  enterAt?: Date;
}

export function createRegionPresence(): RegionPresence {
  return {
    state: 'unknown',
    consecutiveInside: 0,
    consecutiveOutside: 0,
    firstInsideAt: null,
    firstOutsideAt: null,
    lastSampleAt: null,
    hint: null
  };
}

export function createWindowPresence(): WindowPresence {
  return {
    job: createRegionPresence(),
    depot: createRegionPresence(),
    currentEnterAt: null
  };
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeRegionPresence(raw: unknown): RegionPresence {
  if (typeof raw !== 'object' || raw === null) return createRegionPresence();
  const record = raw as Record<string, unknown>;
  const state = record.state;
  const hintRaw = record.hint as Record<string, unknown> | null | undefined;
  const hintAt = hintRaw ? toDateOrNull(hintRaw.at) : null;
  const hintType = hintRaw?.type;
  return {
    state: state === 'inside' || state === 'outside' ? state : 'unknown',
    consecutiveInside: Number.isFinite(Number(record.consecutiveInside))
      ? Math.max(0, Number(record.consecutiveInside))
      : 0,
    consecutiveOutside: Number.isFinite(Number(record.consecutiveOutside))
      ? Math.max(0, Number(record.consecutiveOutside))
      : 0,
    firstInsideAt: toDateOrNull(record.firstInsideAt),
    firstOutsideAt: toDateOrNull(record.firstOutsideAt),
    lastSampleAt: toDateOrNull(record.lastSampleAt),
    hint:
      hintAt && (hintType === 'enter' || hintType === 'exit')
        ? {
            type: hintType,
            at: hintAt,
            ...(hintRaw?.initialState === true ? { initialState: true } : {})
          }
        : null
  };
}

export function normalizeWindowPresence(raw: unknown): WindowPresence {
  if (typeof raw !== 'object' || raw === null) return createWindowPresence();
  const record = raw as Record<string, unknown>;
  return {
    job: normalizeRegionPresence(record.job),
    depot: normalizeRegionPresence(record.depot),
    currentEnterAt: toDateOrNull(record.currentEnterAt)
  };
}

export type SampleClassification = 'inside' | 'outside' | 'neutral';

export function classifySampleForTarget(
  sample: Pick<PresenceSample, 'lat' | 'lng' | 'accuracyMeters'>,
  target: PresenceRegionTarget
): SampleClassification {
  const accuracy =
    typeof sample.accuracyMeters === 'number' && Number.isFinite(sample.accuracyMeters)
      ? Math.max(0, sample.accuracyMeters)
      : 0;
  // Low-quality fixes still update map coordinates upstream but are neutral
  // evidence for presence transitions.
  if (accuracy > TRANSITION_MAX_ACCURACY_METERS) return 'neutral';

  const allowance = Math.min(accuracy, MAX_ACCURACY_ALLOWANCE_METERS);
  const distanceMeters = haversineKm(sample, target) * 1000;
  if (distanceMeters <= target.radiusMeters + allowance) return 'inside';
  if (distanceMeters > target.radiusMeters + HYSTERESIS_BAND_METERS + allowance) {
    return 'outside';
  }
  return 'neutral';
}

function hintMatches(region: RegionPresence, type: 'enter' | 'exit', referenceAt: Date): boolean {
  const hint = region.hint;
  if (!hint || hint.type !== type) return false;
  // An initial-state hint is not evidence of a crossing, so it must never
  // rubber-stamp a single drifting sample into a confirmed transition. Two
  // consecutive samples still confirm normally.
  if (hint.initialState) return false;
  return Math.abs(referenceAt.getTime() - hint.at.getTime()) <= GEOFENCE_HINT_MAX_AGE_MS;
}

function exitStreakConfirmed(region: RegionPresence, sampleAt: Date): boolean {
  const firstOutsideAt = region.firstOutsideAt;
  if (!firstOutsideAt || region.consecutiveOutside < 1) return false;
  const spanMs = sampleAt.getTime() - firstOutsideAt.getTime();
  if (region.consecutiveOutside >= 2 && spanMs >= EXIT_MIN_SPAN_MS) return true;
  if (spanMs >= EXIT_SINGLE_STREAK_MS) return true;
  return hintMatches(region, 'exit', sampleAt);
}

function enterStreakConfirmed(region: RegionPresence, sampleAt: Date): boolean {
  if (region.consecutiveInside >= ENTER_CONSECUTIVE_SAMPLES) return true;
  return region.consecutiveInside >= 1 && hintMatches(region, 'enter', sampleAt);
}

function applyRegionSample(args: {
  region: RegionPresence;
  sample: PresenceSample;
  target: PresenceRegionTarget;
  regionId: PresenceRegionId;
  transitions: PresenceTransition[];
}): RegionPresence {
  const { region, sample, target, regionId, transitions } = args;
  const classification = classifySampleForTarget(sample, target);
  const next: RegionPresence = { ...region, lastSampleAt: sample.recordedAt };
  if (classification === 'neutral') return next;

  if (classification === 'inside') {
    next.consecutiveOutside = 0;
    next.firstOutsideAt = null;
    next.consecutiveInside = region.consecutiveInside + 1;
    if (region.consecutiveInside === 0 || !region.firstInsideAt) {
      next.firstInsideAt = sample.recordedAt;
    }
    if (next.state !== 'inside' && enterStreakConfirmed(next, sample.recordedAt)) {
      next.state = 'inside';
      next.hint = null;
      transitions.push({
        region: regionId,
        type: 'enter',
        at: next.firstInsideAt ?? sample.recordedAt
      });
    }
    return next;
  }

  // classification === "outside"
  next.consecutiveInside = 0;
  next.firstInsideAt = null;
  next.consecutiveOutside = region.consecutiveOutside + 1;
  if (region.consecutiveOutside === 0 || !region.firstOutsideAt) {
    next.firstOutsideAt = sample.recordedAt;
  }
  if (next.state === 'inside') {
    if (exitStreakConfirmed(next, sample.recordedAt)) {
      next.state = 'outside';
      next.hint = null;
      transitions.push({
        region: regionId,
        type: 'exit',
        at: next.firstOutsideAt ?? sample.recordedAt
      });
    }
  } else if (next.state === 'unknown') {
    // Outside-from-unknown carries no duration consequence; a single good
    // sample is enough to call the technician away from this region.
    next.state = 'outside';
  }
  return next;
}

function attachJobSegmentBookkeeping(
  presence: WindowPresence,
  transitions: PresenceTransition[]
): WindowPresence {
  let currentEnterAt = presence.currentEnterAt ?? null;
  for (const transition of transitions) {
    if (transition.region !== 'job') continue;
    if (transition.type === 'enter') {
      currentEnterAt = transition.at;
    } else {
      if (currentEnterAt) transition.enterAt = currentEnterAt;
      currentEnterAt = null;
    }
  }
  return { ...presence, currentEnterAt };
}

export function applyPresenceSample(args: {
  presence: WindowPresence;
  sample: PresenceSample;
  window: { jobSite: PresenceRegionTarget; depot: PresenceRegionTarget };
}): { presence: WindowPresence; transitions: PresenceTransition[] } {
  const { presence, sample } = args;
  // presence.job.lastSampleAt is the canonical ordering marker for the whole
  // window (both regions are updated from every accepted sample).
  const lastSampleAt = presence.job.lastSampleAt;
  if (lastSampleAt && sample.recordedAt.getTime() <= new Date(lastSampleAt).getTime()) {
    return { presence, transitions: [] };
  }

  const transitions: PresenceTransition[] = [];
  const next: WindowPresence = {
    ...presence,
    job: applyRegionSample({
      region: presence.job,
      sample,
      target: args.window.jobSite,
      regionId: 'job',
      transitions
    }),
    depot: applyRegionSample({
      region: presence.depot,
      sample,
      target: args.window.depot,
      regionId: 'depot',
      transitions
    })
  };

  return {
    presence: attachJobSegmentBookkeeping(next, transitions),
    transitions
  };
}

export function applyGeofenceHint(args: {
  presence: WindowPresence;
  region: PresenceRegionId;
  hintType: 'enter' | 'exit';
  at: Date;
  initialState?: boolean;
}): { presence: WindowPresence; transitions: PresenceTransition[] } {
  // presence.job.lastSampleAt is the canonical ordering marker for the whole
  // window (see applyPresenceSample). A hint arriving more than
  // HINT_MAX_LATENESS_MS behind it is stale evidence — neither stored nor
  // allowed to fast-path, or a delayed enter event could confirm a streak the
  // newer samples never supported.
  const windowLastSampleAt = args.presence.job.lastSampleAt;
  if (
    windowLastSampleAt &&
    args.at.getTime() < new Date(windowLastSampleAt).getTime() - HINT_MAX_LATENESS_MS
  ) {
    return { presence: args.presence, transitions: [] };
  }

  const region = args.presence[args.region];
  const transitions: PresenceTransition[] = [];
  const next: RegionPresence = {
    ...region,
    hint: {
      type: args.hintType,
      at: args.at,
      ...(args.initialState ? { initialState: true } : {})
    }
  };

  // A hint can fast-path a pending single-sample streak when the streak's
  // last sample is recent relative to the hint. An initial-state hint never
  // does: iOS emits it whenever regions are re-registered somewhere the device
  // already is, so its timestamp says nothing about when the boundary was
  // crossed.
  const lastSampleAt = region.lastSampleAt ? new Date(region.lastSampleAt) : null;
  const hintIsFresh =
    !args.initialState &&
    lastSampleAt &&
    Math.abs(args.at.getTime() - lastSampleAt.getTime()) <= GEOFENCE_HINT_MAX_AGE_MS;

  if (
    args.hintType === 'enter' &&
    next.state !== 'inside' &&
    next.consecutiveInside >= 1 &&
    hintIsFresh
  ) {
    next.state = 'inside';
    next.hint = null;
    transitions.push({
      region: args.region,
      type: 'enter',
      at: next.firstInsideAt ?? args.at
    });
  } else if (
    args.hintType === 'exit' &&
    next.state === 'inside' &&
    next.consecutiveOutside >= 1 &&
    hintIsFresh
  ) {
    next.state = 'outside';
    next.hint = null;
    transitions.push({
      region: args.region,
      type: 'exit',
      at: next.firstOutsideAt ?? args.at
    });
  }

  const presence = attachJobSegmentBookkeeping(
    { ...args.presence, [args.region]: next },
    transitions
  );
  return { presence, transitions };
}

export type PresenceConfirmedStatus = 'at_job' | 'at_depot' | 'traveling';

export function presenceStatus(presence: WindowPresence): PresenceConfirmedStatus | null {
  if (presence.job.state === 'inside') return 'at_job';
  if (presence.depot.state === 'inside') return 'at_depot';
  // Only a known-outside *job* state is a confirmed "traveling" verdict.
  // Depot-outside alone (e.g. a first sample far from the depot) must stay
  // unconfirmed so callers can keep a previous at_job/at_depot status.
  if (presence.job.state === 'outside') return 'traveling';
  return null;
}
