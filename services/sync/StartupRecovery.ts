import { system } from '@/services/database/System';
import { debugLogger } from '@/utils/DebugLogger';

let startupRecoveryRun = false;

export async function runForegroundStartupRecovery(): Promise<void> {
  if (startupRecoveryRun) {
    return;
  }
  startupRecoveryRun = true;

  const startedAt = Date.now();
  void debugLogger.info('SYNC', 'Foreground startup recovery starting');

  try {
    const deadlineMs = Date.now() + 8000;

    await system.attachmentQueue?.processQueue({
      triggerSource: 'interval/manual-trigger',
      deadlineMs
    });

    const uploaded = await system.backendConnector.uploadPendingTransactions(
      system.powersync,
      deadlineMs
    );

    void debugLogger.info('SYNC', 'Foreground startup recovery completed', {
      elapsedMs: Date.now() - startedAt,
      powerSyncOpsUploaded: uploaded
    });
  } catch (error) {
    startupRecoveryRun = false;
    void debugLogger.warn('SYNC', 'Foreground startup recovery failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
