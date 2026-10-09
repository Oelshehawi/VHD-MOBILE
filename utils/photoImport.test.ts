import { describe, expect, it } from '@jest/globals';
import {
  buildGridRows,
  buildImportStatus,
  clusterByTimeGap,
  parseExifTakenAt,
  sortByTakenAt,
  suggestBeforeAfterSplit,
  toQueueInputs,
  type ImportCandidate
} from './photoImport';
import type { DocumentationCategory } from './equipmentCategories';

const at = (time: string) => `2026-09-21T${time}:00.000Z`;
const item = (id: string, takenAt: string | null) => ({ id, takenAt });

describe('clusterByTimeGap', () => {
  it('starts a new cluster after a gap longer than the threshold', () => {
    const clusters = clusterByTimeGap(
      [item('c', at('18:40')), item('a', at('18:00')), item('b', at('18:05')), item('d', at('18:45'))],
      20 * 60 * 1000
    );

    expect(clusters.map((cluster) => cluster.items.map((entry) => entry.id))).toEqual([['a', 'b'], ['c', 'd']]);
    expect(clusters[0]).toMatchObject({ startAt: at('18:00'), endAt: at('18:05') });
  });

  it('puts photos without a time in a final cluster', () => {
    const clusters = clusterByTimeGap([item('x', null), item('a', at('18:00'))]);
    expect(clusters.map((cluster) => cluster.id)).toEqual(['cluster:a', 'cluster:untimed']);
  });
});

describe('sortByTakenAt', () => {
  it('keeps pick order for identical times and puts untimed photos last', () => {
    const sorted = sortByTakenAt([item('u', null), item('b', at('18:00')), item('a', at('18:00')), item('z', at('17:00'))]);
    expect(sorted.map((entry) => entry.id)).toEqual(['z', 'b', 'a', 'u']);
  });
});

describe('suggestBeforeAfterSplit', () => {
  it('splits at the longest pause', () => {
    const split = suggestBeforeAfterSplit([
      item('b1', at('18:00')), item('b2', at('18:04')),
      item('a1', at('20:40')), item('a2', at('20:45')), item('mid', at('18:30'))
    ]);

    expect(split).toEqual({
      gapStartAt: at('18:30'),
      gapEndAt: at('20:40'),
      beforeIds: ['b1', 'b2', 'mid'],
      afterIds: ['a1', 'a2']
    });
  });

  it('suggests nothing when no pause is long enough', () => {
    expect(suggestBeforeAfterSplit([item('a', at('18:00')), item('b', at('18:10'))])).toBeNull();
    expect(suggestBeforeAfterSplit([item('a', at('18:00'))])).toBeNull();
  });
});

describe('buildImportStatus', () => {
  const ledger = [
    { assetId: 'here', scheduleId: 'visit', jobTitle: 'Cafe' },
    { assetId: 'elsewhere', scheduleId: 'other', jobTitle: 'Diner' }
  ];

  it('merges the ledger with a taken-time match against this visit', () => {
    const statuses = buildImportStatus(
      [
        { id: '1', assetId: 'here', takenAt: at('18:00') },
        { id: '2', assetId: 'elsewhere', takenAt: at('18:01') },
        { id: '3', assetId: 'wiped-ledger', takenAt: '2026-09-21T18:02:00.400Z' },
        { id: '4', assetId: 'fresh', takenAt: at('18:03') },
        { id: '5', assetId: null, takenAt: null }
      ],
      ledger,
      [at('18:02'), at('19:00')],
      'visit'
    );

    expect(Object.fromEntries(statuses)).toEqual({
      '1': { kind: 'imported' },
      '2': { kind: 'otherJob', jobTitle: 'Diner' },
      '3': { kind: 'possible' },
      '4': { kind: 'new' },
      '5': { kind: 'new' }
    });
  });

  it('prefers "imported here" over another job when an asset is in both', () => {
    const statuses = buildImportStatus(
      [{ id: '1', assetId: 'both', takenAt: null }],
      [{ assetId: 'both', scheduleId: 'other', jobTitle: 'Diner' }, { assetId: 'both', scheduleId: 'visit', jobTitle: 'Cafe' }],
      [],
      'visit'
    );
    expect(statuses.get('1')).toEqual({ kind: 'imported' });
  });
});

describe('parseExifTakenAt', () => {
  it('uses OffsetTimeOriginal when present', () => {
    expect(parseExifTakenAt({ DateTimeOriginal: '2026:09:21 11:15:30', OffsetTimeOriginal: '-07:00' }))
      .toBe('2026-09-21T18:15:30.000Z');
  });

  it('reads the nested iOS {Exif} dictionary and assumes device time without an offset', () => {
    const expected = new Date(2026, 8, 21, 11, 15, 30).toISOString();
    expect(parseExifTakenAt({ '{Exif}': { DateTimeOriginal: '2026:09:21 11:15:30' } })).toBe(expected);
  });

  it('returns null for missing or malformed dates', () => {
    expect(parseExifTakenAt(null)).toBeNull();
    expect(parseExifTakenAt({ DateTimeOriginal: 'yesterday' })).toBeNull();
  });
});

describe('toQueueInputs', () => {
  it('maps targets to category fields and carries taken time and asset id', () => {
    const categories: DocumentationCategory[] = [
      { key: 'hood:1', label: 'Main hood', kind: 'hood', source: 'profile', equipmentIds: ['1'] }
    ];
    const candidate: ImportCandidate = {
      id: 'asset-1', uri: 'file:///a.jpg', assetId: 'asset-1', takenAt: at('18:00'),
      width: 4032, height: 3024, fileSize: 2_000_000, mimeType: 'image/heic', fileName: 'IMG_1.HEIC', source: 'library'
    };

    const [hood, loose] = toQueueInputs(
      [
        { candidate, target: { type: 'after', categoryKey: 'hood:1' } },
        { candidate, target: { type: 'before', categoryKey: null } }
      ],
      { scheduleId: 's', technicianId: 't', jobTitle: 'Cafe', scheduledStartAtUtc: at('17:00'), timeZone: null },
      categories
    );

    expect(hood).toMatchObject({
      type: 'after', photoCategoryKey: 'hood:1', photoCategoryLabel: 'Main hood', photoCategoryKind: 'hood',
      takenAt: at('18:00'), sourceAssetId: 'asset-1', captureSource: 'library', timeZone: undefined
    });
    expect(loose).toMatchObject({ type: 'before', photoCategoryKey: null, photoCategoryLabel: null });
  });
});

describe('buildGridRows', () => {
  it('emits a header then fixed-width rows per cluster', () => {
    const rows = buildGridRows(
      [{ id: 'c1', startAt: null, endAt: null, items: [item('a', null), item('b', null), item('c', null)] }],
      2
    );
    expect(rows.map((row) => (row.kind === 'header' ? 'H' : row.items.map((entry) => entry.id).join('')))).toEqual(['H', 'ab', 'c']);
  });
});
