import { describe, expect, it, jest } from '@jest/globals';
import { createCaptureSaveQueue, type CaptureInput } from './captureSaveQueue';
import type { QueuePhotoInput } from '@/services/database/PhotoAttachmentQueue';

const ctx = { scheduleId: 'visit', technicianId: 'tech', jobTitle: 'Cafe', scheduledStartAtUtc: '2026-09-21T17:00:00.000Z' };

function shot(uri: string, sessionId = 'session-1'): CaptureInput {
  return {
    sessionId,
    uri,
    width: 3024,
    height: 4032,
    takenAt: '2026-09-21T18:00:00.000Z',
    target: { type: 'after', categoryKey: 'hood:1' },
    categoryLabel: 'Main hood',
    categoryKind: 'hood',
    ctx
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('capture save queue', () => {
  it('saves one shot at a time in capture order', async () => {
    const gate = deferred();
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const queuePhotos = jest.fn(async ([input]: QueuePhotoInput[]) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (order.length === 0) await gate.promise;
      order.push(input.sourceUri);
      active -= 1;
      return [`photo:${input.sourceUri}`];
    });
    const queue = createCaptureSaveQueue({ getQueue: () => ({ queuePhotos }) });

    queue.enqueue(shot('a'));
    queue.enqueue(shot('b'));
    queue.enqueue(shot('c'));
    expect(queue.getSnapshot().map((job) => job.status)).toEqual(['saving', 'pending', 'pending']);

    gate.resolve();
    await queue.idle();

    expect(order).toEqual(['a', 'b', 'c']);
    expect(maxActive).toBe(1);
    expect(queue.getSnapshot().map((job) => job.photoId)).toEqual(['photo:a', 'photo:b', 'photo:c']);
  });

  it('passes taken time, camera source and category to the photo queue', async () => {
    const queuePhotos = jest.fn(async (_inputs: QueuePhotoInput[]) => ['photo-1']);
    const queue = createCaptureSaveQueue({ getQueue: () => ({ queuePhotos }), readFileSize: () => 1234 });

    queue.enqueue(shot('a'));
    await queue.idle();

    expect(queuePhotos.mock.calls[0][0][0]).toMatchObject({
      sourceUri: 'a', type: 'after', photoCategoryKey: 'hood:1', photoCategoryLabel: 'Main hood',
      takenAt: '2026-09-21T18:00:00.000Z', captureSource: 'camera', sourceSize: 1234,
      sourceWidth: 3024, sourceHeight: 4032
    });
  });

  it('keeps going after a failure, then retries or discards failed shots', async () => {
    const queuePhotos = jest.fn(async ([input]: QueuePhotoInput[]) => {
      if (input.sourceUri === 'bad' && queuePhotos.mock.calls.length < 3) throw new Error('disk full');
      return [`photo:${input.sourceUri}`];
    });
    const deleteFile = jest.fn();
    const queue = createCaptureSaveQueue({ getQueue: () => ({ queuePhotos }), deleteFile });

    queue.enqueue(shot('bad'));
    queue.enqueue(shot('good'));
    await queue.idle();

    const failed = queue.getSnapshot().find((job) => job.uri === 'bad')!;
    expect(failed).toMatchObject({ status: 'failed', error: 'disk full' });
    expect(queue.getSnapshot().find((job) => job.uri === 'good')?.status).toBe('saved');

    queue.retry([failed.id]);
    await queue.idle();
    expect(queue.getSnapshot().find((job) => job.uri === 'bad')?.status).toBe('saved');

    queuePhotos.mockRejectedValueOnce(new Error('nope'));
    queue.enqueue(shot('worse'));
    await queue.idle();
    queue.discard();
    expect(queue.getSnapshot().map((job) => job.uri)).toEqual(['bad', 'good']);
    expect(deleteFile.mock.calls).toEqual([['worse']]);
  });

  it('keeps temp files of an open session for thumbnails and deletes them when it ends', async () => {
    const deleteFile = jest.fn();
    const queue = createCaptureSaveQueue({ getQueue: () => ({ queuePhotos: async () => ['photo-1'] }), deleteFile });

    queue.enqueue(shot('a'));
    await queue.idle();
    expect(deleteFile).not.toHaveBeenCalled();

    queue.endSession('session-1');
    expect(deleteFile).toHaveBeenCalledWith('a');
    expect(queue.getSnapshot()).toHaveLength(0);
  });

  it('fails cleanly when photo storage is not ready', async () => {
    const queue = createCaptureSaveQueue({ getQueue: () => undefined });
    queue.enqueue(shot('a'));
    await queue.idle();
    expect(queue.getSnapshot()[0]).toMatchObject({ status: 'failed', error: 'Photo storage is not ready yet' });
  });

  it('keeps saving after the camera closes and reports failures from closed sessions', async () => {
    const gate = deferred();
    const queuePhotos = jest.fn(async ([input]: QueuePhotoInput[]) => {
      await gate.promise;
      if (input.sourceUri === 'bad') throw new Error('boom');
      return ['photo-1'];
    });
    const onOrphanFailure = jest.fn();
    const queue = createCaptureSaveQueue({ getQueue: () => ({ queuePhotos }), onOrphanFailure });

    queue.enqueue(shot('ok'));
    queue.enqueue(shot('bad'));
    queue.endSession('session-1');
    gate.resolve();
    await queue.idle();

    expect(queuePhotos).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().map((job) => job.uri)).toEqual(['bad']);
    expect(onOrphanFailure).toHaveBeenCalledWith(expect.objectContaining({ uri: 'bad', error: 'boom' }));
  });

  it('treats an afterSave failure as non-fatal', async () => {
    const onAfterSaveError = jest.fn();
    const queue = createCaptureSaveQueue({
      getQueue: () => ({ queuePhotos: async () => ['photo-1'] }),
      afterSave: async () => { throw new Error('camera roll denied'); },
      onAfterSaveError
    });

    queue.enqueue(shot('a'));
    await queue.idle();

    expect(queue.getSnapshot()[0].status).toBe('saved');
    expect(onAfterSaveError).toHaveBeenCalled();
  });
});
