import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runBoundedBackgroundSync } from '@/services/background/BackgroundSyncRunner';
import { debugLogger } from '@/utils/DebugLogger';

export const BACKGROUND_SYNC_TASK_NAME = 'com.braille71.vhdapp.background-sync';
const BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES = 15;

function isBackgroundTaskAvailable(status: BackgroundTask.BackgroundTaskStatus): boolean {
  return status === BackgroundTask.BackgroundTaskStatus.Available;
}

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK_NAME)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => {
    try {
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

export async function registerBackgroundSyncTask(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (!isBackgroundTaskAvailable(status)) {
      void debugLogger.warn('SYNC', 'Background task API unavailable; skipping registration', {
        status,
        minimumIntervalMinutes: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
        note: 'minimumInterval is a lower bound and not a guaranteed execution cadence'
      });
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK_NAME);
    if (isRegistered) {
      void debugLogger.debug('SYNC', 'Background sync task already registered', {
        taskName: BACKGROUND_SYNC_TASK_NAME
      });
      return;
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK_NAME, {
      minimumInterval: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES
    });

    void debugLogger.info('SYNC', 'Background sync task registered', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      minimumIntervalMinutes: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
      note: 'minimumInterval is a lower bound and not a guaranteed execution cadence'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    void debugLogger.error('SYNC', 'Failed to register background sync task', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      error: errorMessage
    });
  }
}

export async function unregisterBackgroundSyncTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK_NAME);
    if (!isRegistered) {
      void debugLogger.debug('SYNC', 'Background sync task already unregistered', {
        taskName: BACKGROUND_SYNC_TASK_NAME
      });
      return;
    }

    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK_NAME);
    void debugLogger.info('SYNC', 'Background sync task unregistered', {
      taskName: BACKGROUND_SYNC_TASK_NAME
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    void debugLogger.error('SYNC', 'Failed to unregister background sync task', {
      taskName: BACKGROUND_SYNC_TASK_NAME,
      error: errorMessage
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
