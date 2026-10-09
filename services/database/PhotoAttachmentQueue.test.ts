import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PhotoAttachmentQueue, type PhotoAttachmentQueueOptions } from './PhotoAttachmentQueue';
import { readTrackingReadiness } from '@/services/location/TrackingReadiness';

jest.mock('@powersync/attachments', () => ({
  AttachmentState: { QUEUED_UPLOAD: 1 },
  AbstractAttachmentQueue: class {
    powersync: unknown;
    storage: unknown;
    table = 'attachments';
    constructor(options: PhotoAttachmentQueueOptions) {
      this.powersync = options.powersync;
      this.storage = options.storage;
    }
    getLocalFilePathSuffix(filename: string) { return filename; }
    getLocalUri(path: string) { return `file:///attachments/${path}`; }
  }
}));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('@/utils/imagePrep', () => ({ prepareImageForUpload: jest.fn() }));
jest.mock('@/utils/objectId', () => ({ generateObjectId: () => 'photo-id' }));
jest.mock('@/utils/DebugLogger', () => ({ debugLogger: { debug: jest.fn(), info: jest.fn() } }));
jest.mock('@/services/background/clerkBootstrap', () => ({ getPersistentClerk: jest.fn() }));
jest.mock('@/services/location/TrackingReadiness', () => ({ readTrackingReadiness: jest.fn() }));

beforeEach(() => { jest.clearAllMocks(); });

describe('photo queuing without location readiness', () => {
  it.each(['Location permission denied', 'Location settings unavailable'])(
    'persists a photo and its upload record when %s', async problem => {
      jest.mocked(readTrackingReadiness).mockRejectedValue(new Error(problem));
      const execute = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const copyFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const writeTransaction = jest.fn(async (callback: (tx: { execute: typeof execute }) => Promise<void>) => {
        await callback({ execute });
      });
      const queue = new PhotoAttachmentQueue({
        powersync: { writeTransaction },
        storage: { copyFile },
        enableAutomaticProcessing: false
      } as unknown as PhotoAttachmentQueueOptions);

      await expect(queue.queuePhotos([{
        sourceUri: 'file:///selected.jpg',
        scheduleId: 'schedule-id',
        type: 'before',
        technicianId: 'technician-id',
        jobTitle: 'Test job',
        scheduledStartAtUtc: '2026-09-21T17:00:00.000Z',
        sourceWidth: 1000,
        sourceHeight: 1000,
        sourceSize: 100000,
        mediaType: 'image/jpeg'
      }])).resolves.toEqual(['photo-id']);

      expect(copyFile).toHaveBeenCalledWith('file:///selected.jpg', 'file:///attachments/photo-id.jpg');
      expect(writeTransaction).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO photos'),
        expect.arrayContaining(['photo-id', 'schedule-id', 'before', 'technician-id']));
      expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO attachments'),
        expect.arrayContaining(['photo-id', 'photo-id.jpg', 'image/jpeg']));
      expect(readTrackingReadiness).not.toHaveBeenCalled();
    }
  );
});

describe('photo timestamps and import ledger', () => {
  function createQueue() {
    const execute = jest.fn<(sql: string, params?: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
    const writeTransaction = jest.fn(async (callback: (tx: { execute: typeof execute }) => Promise<void>) => {
      await callback({ execute });
    });
    const copyFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const queue = new PhotoAttachmentQueue({
      powersync: { writeTransaction },
      storage: { copyFile },
      enableAutomaticProcessing: false
    } as unknown as PhotoAttachmentQueueOptions);
    const photoInserts = () => execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO photos'));
    const ledgerInserts = () => execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO photo_import_sources'));
    return { queue, execute, writeTransaction, copyFile, photoInserts, ledgerInserts };
  }

  const basePhoto = {
    sourceUri: 'file:///selected.jpg',
    scheduleId: 'schedule-id',
    type: 'before' as const,
    technicianId: 'technician-id',
    jobTitle: 'Test job',
    scheduledStartAtUtc: '2026-09-21T17:00:00.000Z',
    sourceWidth: 1000,
    sourceHeight: 1000,
    sourceSize: 100000,
    mediaType: 'image/jpeg'
  };

  it('uses takenAt as the photo timestamp and writes the ledger row in the same transaction', async () => {
    const { queue, writeTransaction, photoInserts, ledgerInserts } = createQueue();

    await queue.queuePhotos([{
      ...basePhoto,
      takenAt: '2026-09-21T18:12:30.000Z',
      sourceAssetId: 'asset-1',
      captureSource: 'library'
    }]);

    expect(writeTransaction).toHaveBeenCalledTimes(1);
    expect(photoInserts()[0][1]).toContain('2026-09-21T18:12:30.000Z');
    expect(ledgerInserts()).toHaveLength(1);
    expect(ledgerInserts()[0][1]).toEqual(expect.arrayContaining([
      'asset-1', 'photo-id', 'schedule-id', 'library', '2026-09-21T18:12:30.000Z'
    ]));
  });

  it('gives a batch without taken times distinct, ordered timestamps and no ledger rows', async () => {
    const { queue, photoInserts, ledgerInserts } = createQueue();

    await queue.queuePhotos([basePhoto, basePhoto, basePhoto]);

    const timestamps = photoInserts().map(([, params]) => (params as unknown[])[4] as string);
    expect(new Set(timestamps).size).toBe(3);
    expect([...timestamps].sort()).toEqual(timestamps);
    expect(ledgerInserts()).toHaveLength(0);
  });

  it('falls back to queue time when takenAt is not a date', async () => {
    const { queue, photoInserts } = createQueue();

    await queue.queuePhotos([{ ...basePhoto, takenAt: 'not a date' }]);

    const timestamp = (photoInserts()[0][1] as unknown[])[4] as string;
    expect(Number.isFinite(Date.parse(timestamp))).toBe(true);
  });

  it('prepares instead of copying sources that are not file: URIs', async () => {
    const { prepareImageForUpload } = jest.requireMock('@/utils/imagePrep') as {
      prepareImageForUpload: jest.Mock<() => Promise<unknown>>;
    };
    prepareImageForUpload.mockResolvedValue({ uri: 'file:///prepared.jpg', width: 1000, height: 1000, size: 90000 });
    const { File } = jest.requireMock('expo-file-system') as { File: jest.Mock };
    File.mockImplementation(() => ({ exists: false, delete: jest.fn() }));
    const { queue, copyFile } = createQueue();

    await queue.queuePhotos([{ ...basePhoto, sourceUri: 'ph://asset-1' }]);

    expect(prepareImageForUpload).toHaveBeenCalledWith('ph://asset-1', expect.anything());
    expect(copyFile).toHaveBeenCalledWith('file:///prepared.jpg', 'file:///attachments/photo-id.jpg');
  });

  it('records a camera-roll asset for an already-queued photo', async () => {
    const { queue, writeTransaction, ledgerInserts } = createQueue();

    await queue.insertImportSource({
      assetId: 'asset-2',
      photoId: 'photo-9',
      scheduleId: 'schedule-id',
      source: 'camera',
      takenAt: '2026-09-21T18:00:00.000Z'
    });

    expect(writeTransaction).toHaveBeenCalledTimes(1);
    expect(ledgerInserts()[0][1]).toEqual(expect.arrayContaining(['asset-2', 'photo-9', 'camera']));
  });
});
