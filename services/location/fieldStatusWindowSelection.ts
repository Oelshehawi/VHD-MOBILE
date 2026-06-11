// Shared mobile mirror of the backend `selectRelevantTrackingWindow` rule
// (projectvhd/app/lib/fieldStatusWindows.ts). Backend and mobile must choose
// the same selected travel window so Field Status and on-device tracking agree.
//
// Generic over a minimal shape so both `ParsedTrackingWindow` and
// `PersistedTrackingWindow` satisfy it. Cancelled/expired windows are already
// dropped upstream (mobile: `parseTrackingWindow`), so this only ranks
// eligible windows.

export interface SelectableTravelWindow {
  id: string;
  scheduledStartAtUtc: string;
  startsAtUtc: string;
  endsAtUtc: string;
}

function timeValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function scheduledStartValue(window: SelectableTravelWindow): number {
  return (
    timeValue(window.scheduledStartAtUtc) ??
    timeValue(window.startsAtUtc) ??
    timeValue(window.endsAtUtc) ??
    0
  );
}

function endsAtValue(window: SelectableTravelWindow): number {
  return timeValue(window.endsAtUtc) ?? Number.POSITIVE_INFINITY;
}

function latestArrivedScheduledStart<T extends SelectableTravelWindow>(
  windows: T[],
  arrivedWindowIds: ReadonlyArray<string>
): number {
  if (arrivedWindowIds.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const arrivedIds = new Set(arrivedWindowIds);
  return windows.reduce((latest, window) => {
    if (!arrivedIds.has(window.id)) {
      return latest;
    }

    return Math.max(latest, scheduledStartValue(window));
  }, Number.NEGATIVE_INFINITY);
}

function isTravelActive(window: SelectableTravelWindow, nowMs: number): boolean {
  const startsAt = timeValue(window.startsAtUtc);
  const endsAt = timeValue(window.endsAtUtc);
  return (
    startsAt !== null &&
    endsAt !== null &&
    startsAt <= nowMs &&
    nowMs <= endsAt
  );
}

/**
 * Select the single travel/display context window for a technician:
 *   1. Prefer the latest `scheduledStartAtUtc` that has started
 *      (`scheduledStart <= now <= endsAt`).
 *   2. Otherwise the earliest upcoming window (`scheduledStart > now`).
 *   3. Otherwise the latest `scheduledStartAtUtc`.
 */
export function selectSelectedTravelWindow<T extends SelectableTravelWindow>(
  windows: T[],
  now: Date = new Date()
): T | undefined {
  if (windows.length === 0) {
    return undefined;
  }

  const nowMs = now.getTime();

  const started = windows
    .filter(
      (window) =>
        scheduledStartValue(window) <= nowMs && endsAtValue(window) >= nowMs
    )
    .sort((a, b) => scheduledStartValue(b) - scheduledStartValue(a));
  if (started[0]) {
    return started[0];
  }

  const upcoming = windows
    .filter((window) => scheduledStartValue(window) > nowMs)
    .sort((a, b) => scheduledStartValue(a) - scheduledStartValue(b));
  if (upcoming[0]) {
    return upcoming[0];
  }

  return [...windows].sort(
    (a, b) => scheduledStartValue(b) - scheduledStartValue(a)
  )[0];
}

/**
 * Select the single window that owns GPS pings right now. A window is
 * ping-active purely by time range (`startsAtUtc <= now <= endsAtUtc`) —
 * arrived/exited state no longer stops pinging (the server derives enter/exit
 * from the ping stream); it only selects the cadence. Local arrival state
 * still matters for ranking: once a later job has been arrived locally, older
 * still-open windows must not reclaim the pings while completion sync
 * catches up.
 */
export function selectActivePingWindow<T extends SelectableTravelWindow>(
  windows: T[],
  arrivedWindowIds: ReadonlyArray<string>,
  now: Date = new Date()
): T | undefined {
  const nowMs = now.getTime();
  const latestArrivedStart = latestArrivedScheduledStart(windows, arrivedWindowIds);

  const candidates = windows.filter(
    (window) =>
      isTravelActive(window, nowMs) &&
      scheduledStartValue(window) >= latestArrivedStart
  );

  return selectSelectedTravelWindow(candidates, now);
}
