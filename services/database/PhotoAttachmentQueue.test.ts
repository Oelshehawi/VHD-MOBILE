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
