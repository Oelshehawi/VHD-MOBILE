import { useEffect } from "react";
import { useUser } from "@clerk/clerk-expo";
import { usePowerSync } from "@powersync/react-native";
import { pushNotificationService } from "@/services/notifications/PushNotificationService";
import { debugLogger } from "@/utils/DebugLogger";

/**
 * PushNotificationInitializer
 *
 * Initializes push notifications after user authentication and PowerSync initialization.
 * Must be rendered inside PowerSyncProvider to access the PowerSync database.
 */
export function PushNotificationInitializer() {
    const { user } = useUser();
    const powerSync = usePowerSync();

    useEffect(() => {
        if (user?.id && powerSync) {
            debugLogger.info(
                "PUSH",
                "Initializing push notifications for user",
                { userId: user.id },
            );
            pushNotificationService.initialize(user.id, powerSync).catch((err) => {
                debugLogger.error(
                    "PUSH",
                    "Failed to initialize push notifications",
                    { error: err },
                );
            });
        }

        // Cleanup on unmount or user change
        return () => {
            if (!user?.id) {
                pushNotificationService.unregister().catch((err) => {
                    debugLogger.error(
                        "PUSH",
                        "Failed to unregister push notifications",
                        { error: err },
                    );
                });
            }
        };
    }, [user?.id, powerSync]);

    // This component doesn't render anything
    return null;
}
