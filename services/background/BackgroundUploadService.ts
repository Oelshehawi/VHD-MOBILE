import BackgroundService from 'react-native-background-actions';
import { system } from '../database/System';
import { AttachmentState } from '@powersync/attachments';

// Simple logging utility
const logUpload = (message: string, details?: any) => {
  console.log(`[BackgroundUpload] ${message}`, details || '');
};

// Define interface for task parameters
interface TaskParameters {
  checkInterval: number;
}

// Options for background task
const backgroundOptions = {
  taskName: 'PhotoUpload',
  taskTitle: 'Uploading Photos',
  taskDesc: 'Uploading photos to cloud storage',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#00adef',
  progressBar: {
    max: 100,
    value: 0,
    indeterminate: true,
  },
  parameters: {
    checkInterval: 2000, // Check every 2 seconds
  } as TaskParameters,
};

// Background task implementation
const uploadTask = async (
  taskDataArguments?: TaskParameters
): Promise<void> => {
  // Use default value if undefined
  const { checkInterval = 2000 } = taskDataArguments || {};

  logUpload('Starting upload task');

  // Initialize system if needed
  if (!system.powersync.connected) {
    logUpload('Initializing PowerSync system');
    await system.init();
  }

  try {
    // First check how many photos need uploading for the notification
    const pendingRecords = await system.powersync.getAll<{ count: number }>(
      `SELECT COUNT(*) as count FROM attachments WHERE state = ?`,
      [AttachmentState.QUEUED_UPLOAD]
    );
    const pendingCount = pendingRecords[0]?.count || 0;

    logUpload('Found pending photos', { pendingCount });

    if (pendingCount > 0) {
      // Update notification with initial count
      await BackgroundService.updateNotification({
        taskDesc: `Uploading ${pendingCount} photo${
          pendingCount === 1 ? '' : 's'
        }`,
        progressBar: {
          max: pendingCount,
          value: 0,
          indeterminate: false,
        },
      });

      // Simply let PowerSync handle the uploads
      logUpload('Triggering PowerSync upload mechanism');
      await system.backendConnector.uploadData(system.powersync);

      // Check if all uploads completed
      const afterRecords = await system.powersync.getAll<{ count: number }>(
        `SELECT COUNT(*) as count FROM attachments WHERE state = ?`,
        [AttachmentState.QUEUED_UPLOAD]
      );
      const afterCount = afterRecords[0]?.count || 0;

      logUpload('Upload completed', {
        beforeCount: pendingCount,
        afterCount,
        uploaded: pendingCount - afterCount,
      });

      // Update notification with completion
      await BackgroundService.updateNotification({
        taskTitle: afterCount === 0 ? 'Upload Complete' : 'Upload Progress',
        taskDesc:
          afterCount === 0
            ? `Successfully uploaded ${pendingCount} photo${
                pendingCount === 1 ? '' : 's'
              }`
            : `Uploaded ${pendingCount - afterCount} of ${pendingCount} photos`,
        progressBar: {
          max: pendingCount,
          value: pendingCount - afterCount,
          indeterminate: false,
        },
      });

      // If uploads remain, wait and try again
      if (afterCount > 0) {
        logUpload('Some uploads remain, waiting before next attempt');
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        return uploadTask(taskDataArguments); // Recursively call to continue uploads
      }

      // Stop the service after a brief delay to show completion
      logUpload('All uploads completed, stopping service after delay');
      setTimeout(async () => {
        await BackgroundService.stop();
      }, 3000);
    } else {
      // No photos to upload, stop the service
      logUpload('No pending uploads, stopping service');
      await BackgroundService.stop();
    }
  } catch (error) {
    console.error('[BackgroundUpload] Error:', error);

    // Update notification with error info
    await BackgroundService.updateNotification({
      taskTitle: 'Upload Error',
      taskDesc: error instanceof Error ? error.message : 'Upload failed',
    });

    // Stop the service on error
    await BackgroundService.stop();
  }
};

// Function to start the background upload service
export const startBackgroundUpload = async (): Promise<void> => {
  if (BackgroundService.isRunning()) {
    logUpload('Service already running, not starting again');
    return;
  }

  logUpload('Starting background upload service');
  await BackgroundService.start(uploadTask, backgroundOptions);
};

// Function to stop the background upload service
export const stopBackgroundUpload = async (): Promise<void> => {
  if (!BackgroundService.isRunning()) {
    return;
  }

  logUpload('Stopping background upload service');
  await BackgroundService.stop();
};

// Function to check if uploads are needed and start the service
export const checkAndStartBackgroundUpload = async (): Promise<boolean> => {
  try {
    // Skip if service is already running
    if (BackgroundService.isRunning()) {
      logUpload('Service already running, skip check');
      return true;
    }

    const pendingRecords = await system.powersync.getAll<{ count: number }>(
      `SELECT COUNT(*) as count FROM attachments WHERE state = ?`,
      [AttachmentState.QUEUED_UPLOAD]
    );
    const pendingCount = pendingRecords[0]?.count || 0;

    logUpload('Pending uploads check', { pendingCount });

    if (pendingCount > 0) {
      await startBackgroundUpload();
      return true;
    }

    return false;
  } catch (error) {
    console.error('[BackgroundUpload] Error checking uploads:', error);
    return false;
  }
};
