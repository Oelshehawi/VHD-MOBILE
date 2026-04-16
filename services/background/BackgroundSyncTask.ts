import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runBoundedBackgroundSync } from '@/services/background/BackgroundSyncRunner';
import { debugLogger } from '@/utils/DebugLogger';

export const BACKGROUND_SYNC_TASK_NAME = 'com.braille71.vhdapp.background-sync';
const BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES = 15;

interface TaskRegistrationContext {
  source: 'appstate-change' | 'effect-cleanup' | 'manual-trigger' | 'internal';
  previousAppState?: string;
  nextAppState?: string;
}

const taskRegistrationCounters = {
  registerAttempts: 0,
  registerSuccesses: 0,
  registerFailures: 0,
  registerSkippedUnavailable: 0,
  registerNoOps: 0,
  unregisterAttempts: 0,
  unregisterSuccesses: 0,
  unregisterFailures: 0,
  unregisterNoOps: 0
};

function isBackgroundTaskAvailable(status: BackgroundTask.BackgroundTaskStatus): boolean {
  return status === BackgroundTask.BackgroundTaskStatus.Available;
}

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK_NAME)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => {
    try {
      void debugLogger.info('SYNC', 'Expo background sync task invoked', {
        taskName: BACKGROUND_SYNC_TASK_NAME,
        minimumIntervalMinutes: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES
      });

      const result = await runBoundedBackgroundSync({
        reason: 'expo-background-task',
        maxMs: 25000
      });

      if (result.success) {
        void debugLogger.info('SYNC', 'Expo background sync task completed', result);
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      void debugLogger.warn('SYNC', 'Expo background sync task failed; requesting retry', result);
      return BackgroundTask.BackgroundTaskResult.Failed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      void debugLogger.error('SYNC', 'Expo background sync task crashed', {
        error: errorMessage
      });
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundSyncTask(context?: TaskRegistrationContext): Promise<void> {
  taskRegistrationCounters.registerAttempts += 1;

  try {
    const status = await BackgroundTask.getStatusAsync();
    if (!isBackgroundTaskAvailable(status)) {
      taskRegistrationCounters.registerSkippedUnavailable += 1;
      void debugLogger.warn('SYNC', 'Background task API unavailable; skipping registration', {
        status,
        context,
        minimumIntervalMinutes: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
        note: 'minimumInterval is a lower bound and not a guaranteed execution cadence',
        taskName: BACKGROUND_SYNC_TASK_NAME,
        counters: taskRegistrationCounters
      });
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK_NAME);
    if (isRegistered) {
      taskRegistrationCounters.registerNoOps += 1;
      void debugLogger.debug('SYNC', 'Background sync task already registered', {
        taskName: BACKGROUND_SYNC_TASK_NAME,
        context,
        counters: taskRegistrationCounters
      });
      return;
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK_NAME, {
      minimumInterval: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES
    });

    taskRegistrationCounters.registerSuccesses += 1;
    void debugLogger.info('SYNC', 'Background sync task registered', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      context,
      minimumIntervalMinutes: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
      note: 'minimumInterval is a lower bound and not a guaranteed execution cadence',
      counters: taskRegistrationCounters
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    taskRegistrationCounters.registerFailures += 1;
    void debugLogger.error('SYNC', 'Failed to register background sync task', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      context,
      error: errorMessage,
      counters: taskRegistrationCounters
    });
  }
}

export async function unregisterBackgroundSyncTask(context?: TaskRegistrationContext): Promise<void> {
  taskRegistrationCounters.unregisterAttempts += 1;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK_NAME);
    if (!isRegistered) {
      taskRegistrationCounters.unregisterNoOps += 1;
      void debugLogger.debug('SYNC', 'Background sync task already unregistered', {
        taskName: BACKGROUND_SYNC_TASK_NAME,
        context,
        counters: taskRegistrationCounters
      });
      return;
    }

    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK_NAME);
    taskRegistrationCounters.unregisterSuccesses += 1;
    void debugLogger.info('SYNC', 'Background sync task unregistered', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      context,
      counters: taskRegistrationCounters
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    taskRegistrationCounters.unregisterFailures += 1;
    void debugLogger.error('SYNC', 'Failed to unregister background sync task', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      context,
      error: errorMessage,
      counters: taskRegistrationCounters
    });
  }
}

export async function triggerBackgroundSyncForTesting(): Promise<void> {
  try {
    const didTrigger = await BackgroundTask.triggerTaskWorkerForTestingAsync();
    void debugLogger.info('SYNC', 'Requested background sync task trigger for testing', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      didTrigger
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    void debugLogger.error('SYNC', 'Failed to trigger background sync task for testing', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      error: errorMessage
    });
  }
}
