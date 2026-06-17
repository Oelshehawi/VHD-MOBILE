import AsyncStorage from '@react-native-async-storage/async-storage';
import { debugLogger } from '@/utils/DebugLogger';

// One-time acknowledgement flag for the Android battery-optimization nudge.
// JS-only / OTA-shippable: we cannot detect or verify the OEM battery setting,
// so completion is recorded manually once the user opens app settings.
const BATTERY_HINT_ACK_KEY = 'vhd_battery_hint_ack_v1';

export async function getBatteryHintAcknowledged(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BATTERY_HINT_ACK_KEY)) === 'true';
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to read battery hint ack', {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

export async function setBatteryHintAcknowledged(): Promise<void> {
  try {
    await AsyncStorage.setItem(BATTERY_HINT_ACK_KEY, 'true');
  } catch (error) {
    debugLogger.warn('LOCATION', 'Failed to write battery hint ack', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
