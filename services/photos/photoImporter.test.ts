import { describe, expect, it, jest } from '@jest/globals';
import { importAssignments, MAX_IMPORT_FILE_BYTES } from './photoImporter';
import type { ImportAssignment, ImportCandidate } from '@/utils/photoImport';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('@/utils/DebugLogger', () => ({ debugLogger: { info: jest.fn() } }));

const ctx = { scheduleId: 's', technicianId: 't', jobTitle: 'Cafe', scheduledStartAtUtc: '2026-09-21T17:00:00.000Z' };

function assignment(id: string, overrides: Partial<ImportCandidate> = {}): ImportAssignment {
  return {
    candidate: { id, uri: `file:///${id}.jpg`, assetId: id, takenAt: null, fileSize: 1000, source: 'picker', ...overrides },
    target: { type: 'before', categoryKey: null }
  };
}

describe('importAssignments', () => {
  it('queues in chunks of five and keeps earlier chunks when a later one fails', async () => {
    let call = 0;
    const queuePhotos = jest.fn(async (inputs: unknown[]) => {
      call += 1;
      if (call === 2) throw new Error('disk full');
      return inputs.map((_, index) => `photo-${call}-${index}`);
    });
    const progress: number[] = [];

    const result = await importAssignments(
      { queuePhotos } as never,
      Array.from({ length: 12 }, (_, index) => assignment(`a${index}`)),
      ctx,
      [],
      { onProgress: ({ done }) => progress.push(done) }
    );

    expect(queuePhotos.mock.calls.map(([inputs]) => inputs.length)).toEqual([5, 5, 2]);
    expect(result.savedIds).toHaveLength(7);
    expect(result.failed).toBe(5);
    expect(progress).toEqual([0, 5, 10, 12]);
  });

  it('skips oversized files and resolves library references before queueing', async () => {
    const queuePhotos = jest.fn(async (inputs: Array<{ sourceUri: string }>) => inputs.map((input) => input.sourceUri));
    const resolveCandidate = jest.fn(async (candidate: ImportCandidate) => ({
      ...candidate,
      uri: candidate.uri.replace('ph://', 'file:///resolved/')
    }));

    const result = await importAssignments(
      { queuePhotos } as never,
      [
        assignment('big', { fileSize: MAX_IMPORT_FILE_BYTES + 1 }),
        assignment('lib', { uri: 'ph://lib', fileSize: null })
      ],
      ctx,
      [],
      { resolveCandidate }
    );

    expect(result).toEqual({ savedIds: ['file:///resolved/lib'], tooLarge: 1, failed: 0 });
  });
});
