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
  reason: BackgroundSyncReason;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  success: boolean;
  powerSyncOpsUploaded: number;
  photoUploadsAttempted: number;
  photoUploadsSucceeded: number;
  stoppedBecause: 'complete' | 'deadline' | 'error' | 'auth-unavailable';
  error?: string;
}

interface PhotoUploadStats {
  attempted: number;
  succeeded: number;
}

interface BackgroundSystemInstance {
  init(deadlineMs: number): Promise<void>;
  ensureAuthAvailable(deadlineMs: number): Promise<boolean>;
  uploadPendingPowerSyncOps(deadlineMs: number): Promise<number>;
  processQueuedPhotoUploads(deadlineMs: number): Promise<PhotoUploadStats>;
  disconnect(): Promise<void>;
}

let inFlightSyncRun: Promise<BackgroundSyncResult> | null = null;

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

  const backgroundSystem = createBackgroundSystem();

  let stoppedBecause: BackgroundSyncResult['stoppedBecause'] = 'complete';
  let success = true;
  let error: string | undefined;
  let powerSyncOpsUploaded = 0;
  let photoUploadsAttempted = 0;
  let photoUploadsSucceeded = 0;

  try {
    if (hasReachedDeadline(deadlineMs)) {
      success = false;
      stoppedBecause = 'deadline';
      return buildResult();
    }

    await backgroundSystem.init(deadlineMs);

    if (hasReachedDeadline(deadlineMs)) {
      success = false;
      stoppedBecause = 'deadline';
      return buildResult();
    }

    const authAvailable = await backgroundSystem.ensureAuthAvailable(deadlineMs);
    if (!authAvailable) {
      success = false;
      stoppedBecause = 'auth-unavailable';
      return buildResult();
    }

    if (hasReachedDeadline(deadlineMs)) {
      success = false;
      stoppedBecause = 'deadline';
      return buildResult();
    }

    powerSyncOpsUploaded += await backgroundSystem.uploadPendingPowerSyncOps(deadlineMs);

    if (hasReachedDeadline(deadlineMs)) {
      success = false;
      stoppedBecause = 'deadline';
      return buildResult();
    }

    const photoStats = await backgroundSystem.processQueuedPhotoUploads(deadlineMs);
    photoUploadsAttempted += photoStats.attempted;
    photoUploadsSucceeded += photoStats.succeeded;

    if (hasReachedDeadline(deadlineMs)) {
      success = false;
      stoppedBecause = 'deadline';
      return buildResult();
    }

    powerSyncOpsUploaded += await backgroundSystem.uploadPendingPowerSyncOps(deadlineMs);

    if (hasReachedDeadline(deadlineMs)) {
      success = false;
      stoppedBecause = 'deadline';
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

  function buildResult(): BackgroundSyncResult {
    const finishedAtMs = Date.now();
    const result: BackgroundSyncResult = {
      reason: options.reason,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: finishedAtMs - startedAtMs,
      success,
      powerSyncOpsUploaded,
      photoUploadsAttempted,
      photoUploadsSucceeded,
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
