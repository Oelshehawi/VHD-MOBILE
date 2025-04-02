import BackgroundService from 'react-native-background-actions';
import { system } from '../database/System';
import { AttachmentState } from '@powersync/attachments';
import { Platform } from 'react-native';
import { requestNotificationPermission } from '@/utils/permissions';

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

// Keep track of upload progress
let totalUploadsAtStart = 0;
let uploadedSoFar = 0;

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
    // Check how many photos need uploading
    const pendingRecords = await system.powersync.getAll<{ count: number }>(
      `SELECT COUNT(*) as count FROM attachments WHERE state = ?`,
      [AttachmentState.QUEUED_UPLOAD]
    );
    const pendingCount = pendingRecords[0]?.count || 0;

    logUpload('Found pending photos', { pendingCount });

    if (pendingCount > 0) {
      // On first run, initialize the total count
      if (totalUploadsAtStart === 0) {
        totalUploadsAtStart = pendingCount;
        uploadedSoFar = 0;
      }

      // Calculate newly uploaded files
      const newlyUploaded = totalUploadsAtStart - pendingCount - uploadedSoFar;
      if (newlyUploaded > 0) {
        uploadedSoFar += newlyUploaded;
      }

      // Update notification with current progress
      await BackgroundService.updateNotification({
        taskTitle: 'Uploading Photos',
        taskDesc: `Uploaded ${uploadedSoFar} of ${totalUploadsAtStart} photos`,
        progressBar: {
          max: totalUploadsAtStart,
          value: uploadedSoFar,
          indeterminate: false,
        },
      });

      // Trigger upload mechanism
      logUpload('Triggering PowerSync upload mechanism');
      await system.backendConnector.uploadData(system.powersync);

      // Get current pending count after upload attempt
      const afterRecords = await system.powersync.getAll<{ count: number }>(
        `SELECT COUNT(*) as count FROM attachments WHERE state = ?`,
        [AttachmentState.QUEUED_UPLOAD]
      );
      const afterCount = afterRecords[0]?.count || 0;

      // Calculate how many were uploaded in this cycle
      const uploadedThisRound = pendingCount - afterCount;
      if (uploadedThisRound > 0) {
        uploadedSoFar += uploadedThisRound;
      }

      logUpload('Upload progress', {
        totalAtStart: totalUploadsAtStart,
        remaining: afterCount,
        uploadedSoFar,
      });

      // Update notification with latest progress
      await BackgroundService.updateNotification({
        taskTitle: afterCount === 0 ? 'Upload Complete' : 'Uploading Photos',
        taskDesc:
          afterCount === 0
            ? `Successfully uploaded ${totalUploadsAtStart} photos`
            : `Uploaded ${uploadedSoFar} of ${totalUploadsAtStart} photos`,
        progressBar: {
          max: totalUploadsAtStart,
          value: uploadedSoFar,
          indeterminate: false,
        },
      });

      // If uploads remain, wait and try again
      if (afterCount > 0) {
        logUpload('Some uploads remain, waiting before next attempt');
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        return uploadTask(taskDataArguments); // Recursively call to continue uploads
      }

      // Reset counters
      totalUploadsAtStart = 0;
      uploadedSoFar = 0;

      // Stop the service after a brief delay to show completion
      logUpload('All uploads completed, stopping service after delay');
      setTimeout(async () => {
        await BackgroundService.stop();
      }, 3000);
    } else {
      // No photos to upload, stop the service
      logUpload('No pending uploads, stopping service');

      // Reset counters
      totalUploadsAtStart = 0;
      uploadedSoFar = 0;

      await BackgroundService.stop();
    }
  } catch (error) {
    console.error('[BackgroundUpload] Error:', error);

    // Update notification with error info
    await BackgroundService.updateNotification({
      taskTitle: 'Upload Error',
      taskDesc: error instanceof Error ? error.message : 'Upload failed',
    });

    // Reset counters
    totalUploadsAtStart = 0;
    uploadedSoFar = 0;

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

  // Reset counters when starting a new upload session
  totalUploadsAtStart = 0;
  uploadedSoFar = 0;

  // Check notification permission on Android 13+
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      logUpload(
        'Cannot start background upload: notification permission denied'
      );
      return;
    }
  }

  logUpload('Starting background upload service');
  await BackgroundService.start(uploadTask, backgroundOptions);
};

// Function to stop the background upload service
export const stopBackgroundUpload = async (): Promise<void> => {
  if (!BackgroundService.isRunning()) {
    return;
  }

  // Reset counters when stopping
  totalUploadsAtStart = 0;
  uploadedSoFar = 0;

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
