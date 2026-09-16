// Mirrored from projectvhd/app/lib/trackingEvidence.ts; keep replay fixtures in parity.
import {
  applyGeofenceHint,
  applyPresenceSample,
  classifySampleForTarget,
  createWindowPresence,
  type PresenceRegionTarget,
  type WindowPresence,
} from "./locationPresenceEngine";

export const RECOVERY_MS = 48 * 3600000;
export const REPORTING_GAP_MS = 5 * 60000;
export const NEW_OUTING_GAP_MS = 4 * 3600000;

export interface EvidenceWindow {
  captureProtocolVersion?: number;
  id: string;
  scheduleId: string;
  jobTitle?: string;
  definitionVersion: number;
  startsAtUtc: string;
  scheduledStartAtUtc: string;
  recoveryEndsAtUtc: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  jobSite: PresenceRegionTarget;
  depot: PresenceRegionTarget;
}
export interface EvidenceEvent {
  captureProtocolVersion?: number;
  id: string;
  eventType: string;
  recordedAt: string;
  deviceRecordedAt?: string;
  trackingWindowId?: string;
  windowDefinitionVersion?: number;
  regionType?: "job" | "depot";
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  coordinateSource?: "device_gps" | "geofence_target";
  initialState?: boolean;
}
export interface EvidenceTransition {
  outingId: string | null;
  boundaryId: string;
  supportingEventIds: string[];
  callbackAt?: string;
  id: string;
  eventId: string;
  windowId: string;
  scheduleId: string;
  region: "job" | "depot";
  type: "enter" | "exit";
  at: string;
  confirmedAt: string;
  quality: "observed" | "first_observed" | "qualified";
  definitionVersion: number;
}
export interface VisitSegment {
  windowId: string;
  scheduleId: string;
  enteredAt: string;
  exitedAt: string | null;
  arrivalQuality: EvidenceTransition["quality"];
  incomplete: boolean;
}
export interface TrackingOuting {
  contextStartedAt?: string;
  id: string;
  startedAt: string;
  endedAt: string | null;
  recoveryEndsAt: string;
  status: "open" | "completed" | "incomplete";
  reason:
    | "depot_return"
    | "depot_first_observed"
    | "next_outing"
    | "recovery_expired"
    | null;
  depotDepartedAt: string | null;
  depotReturnedAt: string | null;
  windowIds: string[];
  segments: VisitSegment[];
}

export interface EvidenceGap {
  from: string;
  to: string;
  outingId: string | null;
}

export function depotBoundaryId(target: PresenceRegionTarget) {
  return `depot:${target.lat}:${target.lng}:${target.radiusMeters}`;
}

// Only identical physical pings are coalesced. Distinct OS callbacks stay intact.
export function normalizeEvidenceEvents(events: EvidenceEvent[]) {
  const pings = new Map<
    string,
    EvidenceEvent & { supportingEventIds: string[] }
  >();
  const result: Array<EvidenceEvent & { supportingEventIds: string[] }> = [];
  for (const event of [...events].sort(
    (a, b) =>
      Date.parse(a.recordedAt) - Date.parse(b.recordedAt) ||
      a.id.localeCompare(b.id),
  )) {
    const key =
      event.eventType === "location_ping" &&
      event.coordinateSource === "device_gps"
        ? `${event.deviceRecordedAt ?? event.recordedAt}:${event.lat}:${event.lng}:${event.accuracyMeters}`
        : null;
    const previous = key ? pings.get(key) : undefined;
    if (previous) {
      previous.supportingEventIds.push(event.id);
      continue;
    }
    const item = { ...event, supportingEventIds: [event.id] };
    result.push(item);
    if (key) pings.set(key, item);
  }
  return result;
}

// Replay physical fixes once, against all eligible definitions. Callback centers
// never become device positions, and a reporting gap severs duration evidence.
export function projectTrackingEvidence(
  events: EvidenceEvent[],
  windows: EvidenceWindow[],
  now = new Date(),
) {
  type State = {
    presence: WindowPresence;
    hasOutside: boolean;
    recovered: boolean;
    support: string[];
    callbackAt?: string;
    callbackId?: string;
  };
  const states = new Map<string, State>();
  const depots = new Map<string, State>();
  const transitions: EvidenceTransition[] = [];
  const outings: TrackingOuting[] = [];
  const gaps: EvidenceGap[] = [];
  let depotContext: EvidenceTransition | undefined;
  let outing: TrackingOuting | undefined;
  let lastFix: number | undefined;
  let gapBeforeCurrent = 0;
  const observedJobs = new Set<string>();
  const finish = (at: string, reason: TrackingOuting["reason"]) => {
    if (!outing) return;
    outing.endedAt = at;
    outing.reason = reason;
    for (const segment of outing.segments)
      if (!segment.exitedAt) segment.incomplete = true;
    outing.status =
      reason === "depot_return" && !outing.segments.some((s) => s.incomplete)
        ? "completed"
        : "incomplete";
    outing = undefined;
  };
  const open = (event: EvidenceEvent) => {
    if (!outing) {
      outing = {
        id: event.id,
        startedAt: event.recordedAt,
        endedAt: null,
        recoveryEndsAt: new Date(
          Date.parse(event.recordedAt) + RECOVERY_MS,
        ).toISOString(),
        status: "open",
        reason: null,
        depotDepartedAt: null,
        depotReturnedAt: null,
        windowIds: [],
        segments: [],
      };
      outings.push(outing);
      observedJobs.clear();
      gapBeforeCurrent = 0;
      if (
        depotContext &&
        Date.parse(event.recordedAt) - Date.parse(depotContext.at) <=
          NEW_OUTING_GAP_MS
      ) {
        depotContext.outingId = outing.id;
        outing.contextStartedAt = depotContext.at;
      }
      depotContext = undefined;
    }
    return outing;
  };
  for (const event of normalizeEvidenceEvents(events)) {
    const at = Date.parse(event.recordedAt);
    if (outing && at > Date.parse(outing.recoveryEndsAt))
      finish(outing.recoveryEndsAt, "recovery_expired");
    const sampleAt = Date.parse(event.deviceRecordedAt ?? event.recordedAt);
    const isFix =
      event.coordinateSource === "device_gps" &&
      typeof event.lat === "number" &&
      typeof event.lng === "number" &&
      Number.isFinite(sampleAt) &&
      (event.accuracyMeters ?? Infinity) <= 150;
    const freshFix = isFix && (lastFix === undefined || sampleAt > lastFix);
    if (
      freshFix &&
      lastFix !== undefined &&
      sampleAt - lastFix > REPORTING_GAP_MS
    ) {
      gapBeforeCurrent = sampleAt - lastFix;
      gaps.push({
        outingId: outing?.id ?? null,
        from: new Date(lastFix).toISOString(),
        to: new Date(sampleAt).toISOString(),
      });
      for (const segment of outing?.segments ?? [])
        if (!segment.exitedAt) segment.incomplete = true;
      states.clear();
      depots.clear();
      depotContext = undefined;
    }
    const eligible = windows.filter(
      (w) =>
        at >= Date.parse(w.startsAtUtc) &&
        at <= Date.parse(w.recoveryEndsAtUtc) &&
        (!w.effectiveFrom || at >= Date.parse(w.effectiveFrom)) &&
        (!w.effectiveUntil || at < Date.parse(w.effectiveUntil)),
    );
    const eventTransitions: EvidenceTransition[] = [];
    const evaluate = (
      w: EvidenceWindow,
      region: "job" | "depot",
      key: string,
      stateMap: Map<string, State>,
    ) => {
      const state = stateMap.get(key) ?? {
        presence: createWindowPresence(),
        hasOutside: false,
        recovered: false,
        support: [],
      };
      const openSegment = [...(outing?.segments ?? [])]
        .reverse()
        .find((s) => s.windowId === w.id && !s.exitedAt);
      const currentHint =
        event.trackingWindowId === w.id &&
        (event.windowDefinitionVersion ?? w.definitionVersion) ===
          w.definitionVersion;
      const hintMatches =
        region === "job"
          ? currentHint
          : eligible.some(
              (candidate) =>
                candidate.id === event.trackingWindowId &&
                (event.windowDefinitionVersion ??
                  candidate.definitionVersion) ===
                  candidate.definitionVersion &&
                depotBoundaryId(candidate.depot) === key,
            );
      const isHint =
        hintMatches &&
        event.regionType === region &&
        ["geofence_enter", "geofence_exit"].includes(event.eventType);
      if (freshFix || isHint)
        state.support = [...state.support, ...event.supportingEventIds].slice(
          -12,
        );
      const add = (
        items: ReturnType<typeof applyPresenceSample>["transitions"],
      ) => {
        for (const t of items.filter((t) => t.region === region)) {
          const quality =
            t.type === "exit" && state.recovered
              ? "qualified"
              : t.type === "enter" &&
                  (event.initialState ||
                    (t.region === "job"
                      ? !state.hasOutside
                      : state.presence.depot.state === "unknown"))
                ? "first_observed"
                : "observed";
          eventTransitions.push({
            outingId: null,
            boundaryId: key,
            supportingEventIds: [
              ...new Set([
                ...state.support,
                ...(state.callbackId ? [state.callbackId] : []),
              ]),
            ],
            ...(t.type === "exit" &&
            state.callbackAt &&
            Math.abs(t.at.getTime() - Date.parse(state.callbackAt)) <=
              REPORTING_GAP_MS
              ? { callbackAt: state.callbackAt }
              : {}),
            id: `${event.id}:${key}:${t.region}:${t.type}`,
            eventId: event.id,
            windowId: w.id,
            scheduleId: w.scheduleId,
            region: t.region,
            type: t.type,
            at: t.at.toISOString(),
            confirmedAt: event.recordedAt,
            quality,
            definitionVersion: w.definitionVersion,
          });
        }
      };
      if (isHint) {
        if (event.eventType === "geofence_exit") {
          state.callbackAt = event.recordedAt;
          state.callbackId = event.id;
        }
        const result = applyGeofenceHint({
          presence: state.presence,
          region,
          hintType: event.eventType === "geofence_enter" ? "enter" : "exit",
          at: new Date(at),
          initialState: event.initialState,
        });
        add(result.transitions);
        state.presence = result.presence;
      }
      if (
        freshFix &&
        sampleAt >= Date.parse(w.startsAtUtc) &&
        (!w.effectiveFrom || sampleAt >= Date.parse(w.effectiveFrom))
      ) {
        const sample = {
          lat: event.lat!,
          lng: event.lng!,
          accuracyMeters: event.accuracyMeters,
          recordedAt: new Date(sampleAt),
        };
        // A fresh inside observation can reconnect an interrupted visit for
        // departure evidence, never for measuring the unobserved interval.
        if (
          region === "job" &&
          openSegment?.incomplete &&
          state.presence.job.state === "unknown" &&
          classifySampleForTarget(sample, w.jobSite) === "inside"
        ) {
          state.presence.job.state = "inside";
          state.recovered = true;
          gapBeforeCurrent = 0;
        }
        const result = applyPresenceSample({
          presence: state.presence,
          sample,
          window: w,
        });
        add(result.transitions);
        state.presence = result.presence;
        if (classifySampleForTarget(sample, w.jobSite) === "outside")
          state.hasOutside = true;
      }
      stateMap.set(key, state);
    };
    for (const w of eligible)
      evaluate(w, "job", `${w.id}:${w.definitionVersion}`, states);
    const sharedDepots = new Map(
      eligible.map((w) => [depotBoundaryId(w.depot), w]),
    );
    for (const [key, w] of sharedDepots) evaluate(w, "depot", key, depots);
    // Job changes precede shared depot changes so overlapping windows cannot
    // close an outing while another job is still occupied.
    eventTransitions.sort(
      (a, b) => Number(a.region === "depot") - Number(b.region === "depot"),
    );
    for (const t of eventTransitions) {
      transitions.push(t);
      if (t.region === "job" && t.type === "enter") {
        if (
          outing &&
          gapBeforeCurrent >= NEW_OUTING_GAP_MS &&
          !observedJobs.has(t.scheduleId)
        ) {
          finish(t.at, "next_outing");
        }
        const current = open({ ...event, recordedAt: t.at });
        if (!current.windowIds.includes(t.windowId))
          current.windowIds.push(t.windowId);
        observedJobs.add(t.scheduleId);
        current.segments.push({
          windowId: t.windowId,
          scheduleId: t.scheduleId,
          enteredAt: t.at,
          exitedAt: null,
          arrivalQuality: t.quality,
          incomplete: t.quality === "first_observed",
        });
        gapBeforeCurrent = 0;
      } else if (t.region === "job" && t.type === "exit") {
        const segment = [...(outing?.segments ?? [])]
          .reverse()
          .find((s) => s.windowId === t.windowId && !s.exitedAt);
        if (segment) segment.exitedAt = t.at;
      } else if (t.region === "depot" && t.type === "exit") {
        if (outing && gapBeforeCurrent >= NEW_OUTING_GAP_MS)
          finish(t.at, "next_outing");
        const current = open({ ...event, recordedAt: t.at });
        current.depotDepartedAt ??= t.at;
      } else if (
        t.region === "depot" &&
        t.type === "enter" &&
        outing && (outing.segments.length > 0 || outing.depotDepartedAt)
      ) {
        const occupied = eligible.some(
          (w) =>
            states.get(`${w.id}:${w.definitionVersion}`)?.presence.job.state ===
            "inside",
        );
        if (!occupied) {
          t.outingId = outing.id;
          if (t.quality === "observed" && gapBeforeCurrent === 0)
            outing.depotReturnedAt = t.at;
          finish(
            t.at,
            t.quality === "observed" && gapBeforeCurrent === 0
              ? "depot_return"
              : "depot_first_observed",
          );
        }
      }
      t.outingId ??= outing?.id ?? null;
      if (t.region === "depot" && t.type === "enter" && !t.outingId)
        depotContext = t;
    }
    if (freshFix) lastFix = sampleAt;
  }
  if (outing && now.getTime() > Date.parse(outing.recoveryEndsAt))
    finish(outing.recoveryEndsAt, "recovery_expired");
  return {
    outings,
    transitions,
    gaps,
    presence: Object.fromEntries(
      [...states].map(([id, s]) => {
        const definition = windows.find(
          (w) => `${w.id}:${w.definitionVersion}` === id,
        );
        const depot =
          definition && depots.get(depotBoundaryId(definition.depot));
        return [
          id,
          { ...s.presence, ...(depot ? { depot: depot.presence.depot } : {}) },
        ];
      }),
    ),
  };
}
