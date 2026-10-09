import type { PhotoAttachmentQueue } from '@/services/database/PhotoAttachmentQueue';
import type { PhotoCategoryKind } from '@/types';
import type { CaptureTarget } from '@/utils/equipmentCategories';
import type { PhotoJobContext } from '@/utils/photoImport';

export type CaptureJobStatus = 'pending' | 'saving' | 'saved' | 'failed';

export interface CaptureJob {
  id: string;
  /** One camera opening; lets the camera show only its own shots. */
  sessionId: string;
  uri: string;
  width: number;
  height: number;
  takenAt: string;
  target: CaptureTarget;
  categoryLabel: string | null;
  categoryKind: PhotoCategoryKind | null;
  ctx: PhotoJobContext;
  status: CaptureJobStatus;
  photoId: string | null;
  error: string | null;
}

export type CaptureInput = Omit<CaptureJob, 'id' | 'status' | 'photoId' | 'error'>;

export interface CaptureSaveQueueDeps {
  getQueue: () => Pick<PhotoAttachmentQueue, 'queuePhotos'> | null | undefined;
  readFileSize?: (uri: string) => number | null;
  /** Runs after the photo row exists (e.g. camera-roll backup). Failures are logged, not fatal. */
  afterSave?: (job: CaptureJob, photoId: string) => Promise<void>;
  /** Removes the camera's temp file once it is no longer needed. */
  deleteFile?: (uri: string) => void;
  /** A shot from a camera session that already closed failed to save. */
  onOrphanFailure?: (job: CaptureJob) => void;
  onAfterSaveError?: (job: CaptureJob, error: unknown) => void;
}

export interface CaptureSaveQueue {
  enqueue(input: CaptureInput): string;
  retry(ids?: readonly string[]): void;
  discard(ids?: readonly string[]): void;
  /** Forget a job and its temp file without touching its photo (the caller deleted it). */
  remove(id: string): void;
  /** The camera closed: drop its saved shots and temp files; pending ones keep saving. */
  endSession(sessionId: string): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly CaptureJob[];
  /** Resolves when nothing is pending or saving. */
  idle(): Promise<void>;
}

let jobCounter = 0;

export function createCaptureSaveQueue(deps: CaptureSaveQueueDeps): CaptureSaveQueue {
  let jobs: readonly CaptureJob[] = [];
  let running: Promise<void> | null = null;
  const endedSessions = new Set<string>();
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());

  const update = (id: string, patch: Partial<CaptureJob>) => {
    jobs = jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
    emit();
  };

  const drop = (predicate: (job: CaptureJob) => boolean) => {
    const before = jobs.length;
    jobs = jobs.filter((job) => !predicate(job));
    if (jobs.length !== before) emit();
  };

  const cleanup = (job: CaptureJob) => {
    try {
      deps.deleteFile?.(job.uri);
    } catch {
      // A leftover cache file is harmless.
    }
  };

  async function saveOne(job: CaptureJob) {
    update(job.id, { status: 'saving', error: null });

    let photoId: string;
    try {
      const queue = deps.getQueue();
      if (!queue) throw new Error('Photo storage is not ready yet');

      const [id] = await queue.queuePhotos([
        {
          sourceUri: job.uri,
          scheduleId: job.ctx.scheduleId,
          type: job.target.type,
          technicianId: job.ctx.technicianId,
          photoCategoryKey: job.target.categoryKey,
          photoCategoryLabel: job.categoryLabel,
          photoCategoryKind: job.categoryKind,
          jobTitle: job.ctx.jobTitle,
          scheduledStartAtUtc: job.ctx.scheduledStartAtUtc,
          timeZone: job.ctx.timeZone ?? undefined,
          sourceWidth: job.width,
          sourceHeight: job.height,
          sourceSize: deps.readFileSize?.(job.uri) ?? undefined,
          mediaType: 'image/jpeg',
          takenAt: job.takenAt,
          captureSource: 'camera'
        }
      ]);
      if (!id) throw new Error('Photo was not saved');
      photoId = id;
    } catch (error) {
      const failed = { ...job, status: 'failed' as const, error: error instanceof Error ? error.message : String(error) };
      update(job.id, { status: 'failed', error: failed.error });
      if (endedSessions.has(job.sessionId)) deps.onOrphanFailure?.(failed);
      return;
    }

    update(job.id, { status: 'saved', photoId });

    try {
      await deps.afterSave?.(job, photoId);
    } catch (error) {
      deps.onAfterSaveError?.(job, error);
    }

    // The open camera still shows this file as a thumbnail; endSession cleans it up.
    if (endedSessions.has(job.sessionId)) {
      cleanup(job);
      drop((entry) => entry.id === job.id);
    }
  }

  function pump(): Promise<void> {
    if (running) return running;

    running = (async () => {
      try {
        // Serial: one prepare/copy at a time keeps memory flat during rapid shooting.
        for (let next = jobs.find((job) => job.status === 'pending'); next; next = jobs.find((job) => job.status === 'pending')) {
          await saveOne(next);
        }
      } finally {
        running = null;
      }
    })();

    return running;
  }

  const matches = (ids: readonly string[] | undefined) => (job: CaptureJob) =>
    job.status === 'failed' && (!ids || ids.includes(job.id));

  return {
    enqueue(input) {
      const id = `capture-${Date.now()}-${++jobCounter}`;
      endedSessions.delete(input.sessionId);
      jobs = [...jobs, { ...input, id, status: 'pending', photoId: null, error: null }];
      emit();
      void pump();
      return id;
    },

    retry(ids) {
      const isMatch = matches(ids);
      jobs = jobs.map((job) => (isMatch(job) ? { ...job, status: 'pending', error: null } : job));
      emit();
      void pump();
    },

    discard(ids) {
      const isMatch = matches(ids);
      jobs.filter(isMatch).forEach(cleanup);
      drop(isMatch);
    },

    remove(id) {
      jobs.filter((job) => job.id === id).forEach(cleanup);
      drop((job) => job.id === id);
    },

    endSession(sessionId) {
      endedSessions.add(sessionId);
      const isSaved = (job: CaptureJob) => job.sessionId === sessionId && job.status === 'saved';
      jobs.filter(isSaved).forEach(cleanup);
      drop(isSaved);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return jobs;
    },

    async idle() {
      while (running) await running;
    }
  };
}
