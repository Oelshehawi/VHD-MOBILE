import { useEffect } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { usePowerSync } from '@powersync/react-native';
import { usePowerSyncStatus } from '@/providers/PowerSyncProvider';
import { pushNotificationService } from '@/services/notifications/PushNotificationService';
import { debugLogger } from '@/utils/DebugLogger';
import { getMobileStaffIdentity } from '@/utils/staffIdentity';

/**
 * PushNotificationInitializer
 *
 * Initializes push notifications after user authentication and PowerSync initialization.
 * Must be rendered inside PowerSyncProvider to access the PowerSync database.
 */
export function PushNotificationInitializer() {
  const { user } = useUser();
  const powerSync = usePowerSync();
  const { isInitialized } = usePowerSyncStatus();
  const appUserId = getMobileStaffIdentity(user?.publicMetadata)?.appUserId;

  useEffect(() => {
    if (appUserId && powerSync && isInitialized) {
      debugLogger.info('PUSH', 'Initializing push notifications for app user', { appUserId });
      pushNotificationService.initialize(appUserId, powerSync).catch((err) => {
        debugLogger.error('PUSH', 'Failed to initialize push notifications', { error: err });
      });
    }

    // Cleanup on unmount or user change
    return () => {
      pushNotificationService.unregister().catch((err) => {
        debugLogger.error('PUSH', 'Failed to unregister push notifications', { error: err });
      });
    };
  }, [appUserId, isInitialized, powerSync]);

  // This component doesn't render anything
  return null;
}
