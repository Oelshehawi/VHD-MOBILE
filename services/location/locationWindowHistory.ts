import type { PersistedTrackingWindow } from './LocationTrackingState';

export function mergeWindowHistory(history: PersistedTrackingWindow[], previous: PersistedTrackingWindow[], current: PersistedTrackingWindow[]): PersistedTrackingWindow[] {
  const byVersion = new Map([...history, ...previous].map(window => [`${window.id}:${window.definitionVersion ?? 1}`, { ...window }]));
  for (const window of byVersion.values()) {
    const replacement = current.find(item => item.id === window.id && (item.definitionVersion ?? 1) > (window.definitionVersion ?? 1));
    if (replacement?.definitionUpdatedAt) window.definitionEndsAt = replacement.definitionUpdatedAt;
  }
  return [...byVersion.values()].filter(window => Date.parse(window.endsAtUtc) > Date.now() - 13 * 86400000);
}

export function windowsAtSampleTime(windows: PersistedTrackingWindow[], at: number): PersistedTrackingWindow[] {
  const selected = new Map<string, PersistedTrackingWindow>();
  for (const window of windows) {
    if (at < Date.parse(window.startsAtUtc) || at > Date.parse(window.endsAtUtc) ||
      (window.definitionUpdatedAt && at < Date.parse(window.definitionUpdatedAt)) ||
      (window.definitionEndsAt && at >= Date.parse(window.definitionEndsAt))) continue;
    const previous = selected.get(window.id);
    if (!previous || (window.definitionVersion ?? 1) >= (previous.definitionVersion ?? 1)) selected.set(window.id, window);
  }
  return [...selected.values()];
}
