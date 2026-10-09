import { useMemo } from 'react';
import { useQuery, DEFAULT_ROW_COMPARATOR } from '@powersync/react-native';
import type { EquipmentProfile } from '@/types';
import type { PhotoType } from '@/utils/photos';
import type { CaptureType } from '@/utils/equipmentCategories';

export type DocumentationPhoto = PhotoType & { type: CaptureType };

/**
 * Every before/after photo for a visit, joined with its local attachment.
 * Callers filter per category in memory with `selectCategoryPhotos`, so one
 * subscription serves the list, the equipment page and the camera.
 */
export function useSchedulePhotos(scheduleId: string | null | undefined) {
  return useQuery<DocumentationPhoto>(
    scheduleId
      ? `SELECT p.id, p.scheduleId, p.cloudinaryUrl, p.type, p.technicianId, p.timestamp, p.signerName,
           p.photoCategoryKey, p.photoCategoryLabel, p.photoCategoryKind,
           a.local_uri, a.filename, a.failedAt, a.lastError, a.errorCategory
         FROM photos p
         LEFT JOIN attachments a ON a.id = p.id
         WHERE p.scheduleId = ? AND p.type IN ('before', 'after')
         ORDER BY p.timestamp ASC, p.id ASC`
      : `SELECT p.id FROM photos p WHERE 0`,
    [scheduleId ?? ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
}

export function selectCategoryPhotos(
  photos: ReadonlyArray<DocumentationPhoto>,
  type: CaptureType,
  categoryKey: string | null
): DocumentationPhoto[] {
  return photos.filter(
    (photo) => photo.type === type && (photo.photoCategoryKey ?? null) === categoryKey
  );
}

export interface PhotoCounts {
  get(type: CaptureType, categoryKey: string | null): number;
  total(type: CaptureType): number;
}

function countKey(type: CaptureType, categoryKey: string | null) {
  return `${type}\u0000${categoryKey ?? ''}`;
}

export function buildPhotoCounts(photos: ReadonlyArray<DocumentationPhoto>): PhotoCounts {
  const counts = new Map<string, number>();
  const totals = { before: 0, after: 0 };

  for (const photo of photos) {
    const key = countKey(photo.type, photo.photoCategoryKey ?? null);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totals[photo.type] += 1;
  }

  return {
    get: (type, categoryKey) => counts.get(countKey(type, categoryKey)) ?? 0,
    total: (type) => totals[type]
  };
}

/** Per-type, per-category counts derived from `useSchedulePhotos` rows. */
export function useSchedulePhotoCounts(photos: ReadonlyArray<DocumentationPhoto>): PhotoCounts {
  return useMemo(() => buildPhotoCounts(photos), [photos]);
}

export function useEquipmentProfile(serviceJobId: string | null | undefined) {
  const { data: profiles = [] } = useQuery<EquipmentProfile>(
    serviceJobId
      ? `SELECT * FROM equipmentprofiles WHERE serviceJobId = ? LIMIT 1`
      : `SELECT * FROM equipmentprofiles WHERE 0`,
    [serviceJobId || ''],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );

  return profiles[0] ?? null;
}

export interface ImportLedgerRow {
  assetId: string;
  photoId: string;
  scheduleId: string;
  jobTitle: string | null;
}

/**
 * Camera-roll assets already imported, limited to photos that still exist so a
 * deleted photo can be imported again.
 */
export function useImportLedger() {
  return useQuery<ImportLedgerRow>(
    `SELECT l.assetId, l.photoId, l.scheduleId, s.jobTitle
       FROM photo_import_sources l
       JOIN photos p ON p.id = l.photoId
       LEFT JOIN schedules s ON s.id = l.scheduleId`,
    [],
    { rowComparator: DEFAULT_ROW_COMPARATOR }
  );
}
