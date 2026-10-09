import type { PhotoCaptureSource, QueuePhotoInput } from '@/services/database/PhotoAttachmentQueue';
import type {
  CaptureTarget,
  CaptureType,
  DocumentationCategory
} from '@/utils/equipmentCategories';

/** The job fields every queued photo needs. */
export interface PhotoJobContext {
  scheduleId: string;
  technicianId: string;
  jobTitle: string;
  scheduledStartAtUtc: string;
  timeZone?: string | null;
}

/** A photo offered for import, from the system picker or the camera roll. */
export interface ImportCandidate {
  /** Stable key: the asset id when known, otherwise the uri. */
  id: string;
  uri: string;
  assetId: string | null;
  /** ISO time the photo was taken, when known. */
  takenAt: string | null;
  width?: number;
  height?: number;
  fileSize?: number | null;
  mimeType?: string | null;
  fileName?: string | null;
  source: PhotoCaptureSource;
}

export interface TimeCluster<T> {
  id: string;
  startAt: string | null;
  endAt: string | null;
  items: T[];
}

export const DEFAULT_CLUSTER_GAP_MS = 20 * 60 * 1000;
export const MIN_SPLIT_GAP_MS = 15 * 60 * 1000;
const SAME_PHOTO_TOLERANCE_MS = 1000;

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Oldest first; photos without a time keep their relative order at the end. */
export function sortByTakenAt<T extends { takenAt: string | null }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, time: timeOf(item.takenAt) }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) return a.index - b.index;
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time - b.time || a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * Groups photos into bursts: a new cluster starts whenever the gap to the
 * previous photo exceeds `gapMs`. Photos without a time form a final cluster.
 */
export function clusterByTimeGap<T extends { id: string; takenAt: string | null }>(
  items: readonly T[],
  gapMs = DEFAULT_CLUSTER_GAP_MS
): TimeCluster<T>[] {
  const clusters: TimeCluster<T>[] = [];
  let current: TimeCluster<T> | null = null;
  let lastTime: number | null = null;
  const untimed: T[] = [];

  for (const item of sortByTakenAt(items)) {
    const time = timeOf(item.takenAt);
    if (time === null) {
      untimed.push(item);
      continue;
    }

    if (!current || lastTime === null || time - lastTime > gapMs) {
      current = { id: `cluster:${item.id}`, startAt: item.takenAt, endAt: item.takenAt, items: [] };
      clusters.push(current);
    }

    current.items.push(item);
    current.endAt = item.takenAt;
    lastTime = time;
  }

  if (untimed.length > 0) {
    clusters.push({ id: 'cluster:untimed', startAt: null, endAt: null, items: untimed });
  }

  return clusters;
}

export interface BeforeAfterSplit {
  /** Last photo before the gap and first photo after it. */
  gapStartAt: string;
  gapEndAt: string;
  beforeIds: string[];
  afterIds: string[];
}

/**
 * The longest pause between photos is most likely the cleaning itself:
 * everything before it is Before, everything after is After.
 */
export function suggestBeforeAfterSplit<T extends { id: string; takenAt: string | null }>(
  items: readonly T[],
  minGapMs = MIN_SPLIT_GAP_MS
): BeforeAfterSplit | null {
  const timed = sortByTakenAt(items).filter((item) => timeOf(item.takenAt) !== null);
  if (timed.length < 2) return null;

  let bestIndex = -1;
  let bestGap = 0;
  for (let index = 1; index < timed.length; index += 1) {
    const gap = timeOf(timed[index].takenAt)! - timeOf(timed[index - 1].takenAt)!;
    if (gap > bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }

  if (bestIndex < 1 || bestGap < minGapMs) return null;

  return {
    gapStartAt: timed[bestIndex - 1].takenAt!,
    gapEndAt: timed[bestIndex].takenAt!,
    beforeIds: timed.slice(0, bestIndex).map((item) => item.id),
    afterIds: timed.slice(bestIndex).map((item) => item.id)
  };
}

export type ImportStatus =
  | { kind: 'new' }
  | { kind: 'imported' }
  | { kind: 'otherJob'; jobTitle: string | null }
  | { kind: 'possible' };

export interface LedgerEntry {
  assetId: string;
  scheduleId: string;
  jobTitle: string | null;
}

/**
 * Whether each candidate is already on this visit. The ledger is exact but is
 * wiped on logout, so a taken-time match against this visit's synced photos
 * flags "possibly imported" as a fallback.
 */
export function buildImportStatus(
  candidates: readonly Pick<ImportCandidate, 'id' | 'assetId' | 'takenAt'>[],
  ledger: readonly LedgerEntry[],
  visitPhotoTimestamps: readonly string[],
  scheduleId: string
): Map<string, ImportStatus> {
  const byAsset = new Map<string, LedgerEntry[]>();
  for (const entry of ledger) {
    const entries = byAsset.get(entry.assetId) ?? [];
    entries.push(entry);
    byAsset.set(entry.assetId, entries);
  }

  const visitTimes = visitPhotoTimestamps
    .map(timeOf)
    .filter((time): time is number => time !== null)
    .sort((a, b) => a - b);

  const matchesVisitPhoto = (time: number) => {
    // Binary search for the nearest visit photo time.
    let low = 0;
    let high = visitTimes.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const diff = visitTimes[mid] - time;
      if (Math.abs(diff) < SAME_PHOTO_TOLERANCE_MS) return true;
      if (diff < 0) low = mid + 1;
      else high = mid - 1;
    }
    return false;
  };

  const statuses = new Map<string, ImportStatus>();
  for (const candidate of candidates) {
    const entries = candidate.assetId ? byAsset.get(candidate.assetId) ?? [] : [];
    if (entries.some((entry) => entry.scheduleId === scheduleId)) {
      statuses.set(candidate.id, { kind: 'imported' });
      continue;
    }

    const time = timeOf(candidate.takenAt);
    if (time !== null && matchesVisitPhoto(time)) {
      statuses.set(candidate.id, { kind: 'possible' });
      continue;
    }

    if (entries.length > 0) {
      statuses.set(candidate.id, { kind: 'otherJob', jobTitle: entries[0].jobTitle });
      continue;
    }

    statuses.set(candidate.id, { kind: 'new' });
  }

  return statuses;
}

export interface ImportAssignment {
  candidate: ImportCandidate;
  target: CaptureTarget;
}

export function toQueueInputs(
  assignments: readonly ImportAssignment[],
  ctx: PhotoJobContext,
  categories: readonly DocumentationCategory[]
): QueuePhotoInput[] {
  const byKey = new Map(categories.map((category) => [category.key, category]));

  return assignments.map(({ candidate, target }) => {
    const category = target.categoryKey ? byKey.get(target.categoryKey) : undefined;
    return {
      sourceUri: candidate.uri,
      scheduleId: ctx.scheduleId,
      type: target.type,
      technicianId: ctx.technicianId,
      photoCategoryKey: category?.key ?? null,
      photoCategoryLabel: category?.label ?? null,
      photoCategoryKind: category?.kind ?? null,
      jobTitle: ctx.jobTitle,
      scheduledStartAtUtc: ctx.scheduledStartAtUtc,
      timeZone: ctx.timeZone ?? undefined,
      sourceWidth: candidate.width,
      sourceHeight: candidate.height,
      sourceSize: candidate.fileSize ?? undefined,
      mediaType: candidate.mimeType,
      fileName: candidate.fileName,
      takenAt: candidate.takenAt,
      sourceAssetId: candidate.assetId,
      captureSource: candidate.source
    };
  });
}

type ExifRecord = Record<string, unknown>;

function pickExifString(exif: ExifRecord, keys: string[]): string | null {
  const nested = [exif, exif['{Exif}'], exif['{TIFF}']].filter(
    (entry): entry is ExifRecord => !!entry && typeof entry === 'object'
  );
  for (const source of nested) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

/**
 * Taken time from picker EXIF. `DateTimeOriginal` is "YYYY:MM:DD HH:MM:SS"
 * in the camera's local time; `OffsetTimeOriginal` pins the zone when present,
 * otherwise the device zone is assumed.
 */
export function parseExifTakenAt(exif: ExifRecord | null | undefined): string | null {
  if (!exif) return null;

  const raw = pickExifString(exif, ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']);
  const match = raw?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const offset = pickExifString(exif, ['OffsetTimeOriginal', 'OffsetTime']);

  if (offset && /^[+-]\d{2}:\d{2}$/.test(offset)) {
    const time = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  const local = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return Number.isFinite(local.getTime()) ? local.toISOString() : null;
}

export function formatClusterTime(iso: string | null): string {
  if (!iso) return 'Unknown time';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function describeTarget(
  target: CaptureTarget,
  categories: readonly DocumentationCategory[]
): string {
  const label = target.categoryKey
    ? categories.find((category) => category.key === target.categoryKey)?.label ?? 'Equipment'
    : 'Uncategorized';
  return `${label} · ${captureTypeLabel(target.type)}`;
}

export function captureTypeLabel(type: CaptureType): string {
  return type === 'before' ? 'Before' : 'After';
}

export type GridRow<T> =
  | { kind: 'header'; key: string; cluster: TimeCluster<T> }
  | { kind: 'row'; key: string; items: T[] };

/** Flattens clusters into header + fixed-height tile rows for a virtualized list. */
export function buildGridRows<T extends { id: string }>(
  clusters: readonly TimeCluster<T>[],
  columns: number
): GridRow<T>[] {
  const rows: GridRow<T>[] = [];
  for (const cluster of clusters) {
    rows.push({ kind: 'header', key: `h:${cluster.id}`, cluster });
    for (let start = 0; start < cluster.items.length; start += columns) {
      const items = cluster.items.slice(start, start + columns);
      rows.push({ kind: 'row', key: `r:${items[0].id}`, items });
    }
  }
  return rows;
}

/** Offsets for FlatList.getItemLayout over rows of two fixed heights. */
export function buildRowLayout<T>(
  rows: readonly GridRow<T>[],
  headerHeight: number,
  rowHeight: number
): { length: number; offset: number }[] {
  let offset = 0;
  return rows.map((row) => {
    const length = row.kind === 'header' ? headerHeight : rowHeight;
    const layout = { length, offset };
    offset += length;
    return layout;
  });
}
