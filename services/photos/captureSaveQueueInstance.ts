import { File } from 'expo-file-system';
import { system } from '@/services/database/System';
import { showToast } from '@/utils/photos';
import { debugLogger } from '@/utils/DebugLogger';
import { createCaptureSaveQueue } from './captureSaveQueue';

/** App-wide camera save queue; outlives the camera so closing it never drops shots. */
export const captureSaveQueue = createCaptureSaveQueue({
  getQueue: () => system.attachmentQueue,
  readFileSize: (uri) => {
    const file = new File(uri);
    return file.exists ? file.size ?? null : null;
  },
  deleteFile: (uri) => {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  onOrphanFailure: (job) => {
    void debugLogger.info('PHOTO', 'Camera shot failed after camera closed', { error: job.error });
    showToast(`A ${job.target.type} photo couldn't be saved: ${job.error ?? 'unknown error'}`, {
      tone: 'error'
    });
  },
  onAfterSaveError: (_job, error) => {
    void debugLogger.info('PHOTO', 'Camera shot post-save step failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
