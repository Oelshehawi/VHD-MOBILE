import { debugLogger } from '@/utils/DebugLogger';
import { BackgroundSystem } from './BackgroundSystem';

export type BackgroundSyncReason =
  | 'app-startup'
  | 'expo-background-task'
  | 'manual-test'
  | 'future-background-actions'
  | 'future-location';

export interface BackgroundSyncOptions {
  reason: BackgroundSyncReason;
  maxMs: number;
}

export interface BackgroundSyncResult {
  runId: string;
  reason: BackgroundSyncReason;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  success: boolean;
  pendingPhotoCountBefore: number;
  pendingPhotoCountAfter: number;
  powerSyncOpsUploaded: number;
  photoUploadsAttempted: number;
  photoUploadsSucceeded: number;
  photoUploadsFailed: number;
  authUnavailableCount: number;
  deadlineStopCount: number;
  stoppedBecause: 'complete' | 'deadline' | 'error' | 'auth-unavailable';
  error?: string;
}

interface PhotoUploadStats {
  attempted: number;
  succeeded: number;
  failed: number;
  stoppedBecause: 'empty' | 'deadline' | 'max-batches' | 'already-attempted';
  batchesProcessed: number;
  uniqueAttachmentCount: number;
  repeatAttemptCount: number;
}

interface BackgroundSystemInstance {
  init(deadlineMs: number): Promise<void>;
  ensureAuthAvailable(deadlineMs: number): Promise<boolean>;
  getPendingPhotoCount(deadlineMs: number): Promise<number>;
  uploadPendingPowerSyncOps(deadlineMs: number): Promise<number>;
  processQueuedPhotoUploads(deadlineMs: number, workerRunId: string): Promise<PhotoUploadStats>;
  disconnect(): Promise<void>;
}

let inFlightSyncRun: Promise<BackgroundSyncResult> | null = null;
let syncRunSequence = 0;

const backgroundSyncCounters = {
  runsStarted: 0,
  authUnavailableCount: 0,
  deadlineStopCount: 0
};

function hasReachedDeadline(deadlineMs: number): boolean {
  return Date.now() >= deadlineMs;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createBackgroundSystem(): BackgroundSystemInstance {
  return new BackgroundSystem();
}

async function runBoundedBackgroundSyncInternal(
  options: BackgroundSyncOptions
): Promise<BackgroundSyncResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const deadlineMs = startedAtMs + options.maxMs;
  const runId = `bg-sync-${startedAtMs}-${++syncRunSequence}`;

  const backgroundSystem = createBackgroundSystem();

  let stoppedBecause: BackgroundSyncResult['stoppedBecause'] = 'complete';
  let success = true;
  let error: string | undefined;
  let pendingPhotoCountBefore = 0;
  let pendingPhotoCountAfter = 0;
  let powerSyncOpsUploaded = 0;
  let photoUploadsAttempted = 0;
  let photoUploadsSucceeded = 0;
  let photoUploadsFailed = 0;
  let authUnavailableCount = 0;
  let deadlineStopCount = 0;
  let shouldContinue = true;

  backgroundSyncCounters.runsStarted += 1;

  void debugLogger.info('SYNC', 'Background sync run started', {
    runId,
    reason: options.reason,
    maxMs: options.maxMs,
    startedAt,
    deadlineAt: new Date(deadlineMs).toISOString(),
    totalRunsStarted: backgroundSyncCounters.runsStarted
  });

  try {
    if (hasReachedDeadline(deadlineMs)) {
      stopRun('deadline');
    }

    if (shouldContinue) {
      await backgroundSystem.init(deadlineMs);
    }

    if (shouldContinue && hasReachedDeadline(deadlineMs)) {
      stopRun('deadline');
    }

    pendingPhotoCountBefore = await backgroundSystem.getPendingPhotoCount(deadlineMs);
    pendingPhotoCountAfter = pendingPhotoCountBefore;

    void debugLogger.debug('SYNC', 'Background sync pending photo snapshot before work', {
      runId,
      reason: options.reason,
      pendingPhotoCountBefore
    });

    if (shouldContinue) {
      const authAvailable = await backgroundSystem.ensureAuthAvailable(deadlineMs);
      if (!authAvailable) {
        stopRun('auth-unavailable');
      }
    }

    if (shouldContinue && hasReachedDeadline(deadlineMs)) {
      stopRun('deadline');
    }

    if (shouldContinue) {
      powerSyncOpsUploaded += await backgroundSystem.uploadPendingPowerSyncOps(deadlineMs);
    }

    if (shouldContinue && hasReachedDeadline(deadlineMs)) {
      stopRun('deadline');
    }

    if (shouldContinue) {
      const photoStats = await backgroundSystem.processQueuedPhotoUploads(deadlineMs, runId);
      photoUploadsAttempted += photoStats.attempted;
      photoUploadsSucceeded += photoStats.succeeded;
      photoUploadsFailed += photoStats.failed;
      pendingPhotoCountAfter = await backgroundSystem.getPendingPhotoCount(deadlineMs);

      void debugLogger.info('SYNC', 'Background sync photo upload phase completed', {
        runId,
        reason: options.reason,
        pendingPhotoCountBefore,
        pendingPhotoCountAfter,
        photoUploadsAttempted,
        photoUploadsSucceeded,
        photoUploadsFailed,
        photoQueueStopReason: photoStats.stoppedBecause,
        photoQueueBatchCount: photoStats.batchesProcessed,
        photoQueueUniqueAttachmentCount: photoStats.uniqueAttachmentCount,
        photoQueueRepeatAttemptCount: photoStats.repeatAttemptCount
      });
    }

    if (shouldContinue && hasReachedDeadline(deadlineMs)) {
      stopRun('deadline');
    }

    if (shouldContinue) {
      powerSyncOpsUploaded += await backgroundSystem.uploadPendingPowerSyncOps(deadlineMs);
    }

    if (shouldContinue && hasReachedDeadline(deadlineMs)) {
      stopRun('deadline');
    }
  } catch (runError) {
    success = false;
    stoppedBecause = 'error';
    error = toErrorMessage(runError);
  } finally {
    try {
      await backgroundSystem.disconnect();
    } catch (disconnectError) {
      const disconnectMessage = toErrorMessage(disconnectError);
      success = false;
      stoppedBecause = 'error';
      error = error ?? `Failed to disconnect background system: ${disconnectMessage}`;
    }
  }

  return buildResult();

  function stopRun(reason: BackgroundSyncResult['stoppedBecause']): void {
    success = false;
    stoppedBecause = reason;
    shouldContinue = false;

    if (reason === 'auth-unavailable') {
      authUnavailableCount += 1;
      backgroundSyncCounters.authUnavailableCount += 1;
    }

    if (reason === 'deadline') {
      deadlineStopCount += 1;
      backgroundSyncCounters.deadlineStopCount += 1;
    }

    void debugLogger.warn('SYNC', 'Background sync run stop requested', {
      runId,
      reason: options.reason,
      stoppedBecause: reason,
      authUnavailableCount,
      deadlineStopCount,
      totalAuthUnavailableCount: backgroundSyncCounters.authUnavailableCount,
      totalDeadlineStopCount: backgroundSyncCounters.deadlineStopCount
    });
  }

  function buildResult(): BackgroundSyncResult {
    const finishedAtMs = Date.now();
    const result: BackgroundSyncResult = {
      runId,
      reason: options.reason,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: finishedAtMs - startedAtMs,
      success,
      pendingPhotoCountBefore,
      pendingPhotoCountAfter,
      powerSyncOpsUploaded,
      photoUploadsAttempted,
      photoUploadsSucceeded,
      photoUploadsFailed,
      authUnavailableCount,
      deadlineStopCount,
      stoppedBecause,
      ...(error ? { error } : {})
    };

    if (result.success) {
      void debugLogger.info('SYNC', 'Background sync run completed', result);
    } else if (result.stoppedBecause === 'error') {
      void debugLogger.error('SYNC', 'Background sync run failed', result);
    } else {
      void debugLogger.warn('SYNC', 'Background sync run stopped early', result);
    }

    return result;
  }
}

export async function runBoundedBackgroundSync(
  options: BackgroundSyncOptions
): Promise<BackgroundSyncResult> {
  if (inFlightSyncRun) {
    void debugLogger.info('SYNC', 'Background sync already in progress; joining single-flight run', {
      reason: options.reason,
      maxMs: options.maxMs
    });
    return inFlightSyncRun;
  }

  inFlightSyncRun = runBoundedBackgroundSyncInternal(options);

  try {
    return await inFlightSyncRun;
  } finally {
    inFlightSyncRun = null;
  }
}
