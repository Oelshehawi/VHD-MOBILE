import { requireOptionalNativeModule } from 'expo';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { PermissionState } from './LocationTrackingState';

export interface NativeTrackingStatus {
  accuracyAuthorization: 'full' | 'reduced' | 'unknown';
  backgroundRefresh: 'available' | 'denied' | 'restricted' | 'unknown';
  batteryRestricted: boolean | null;
  lowPowerMode: boolean | null;
}
export interface TrackingReadiness extends NativeTrackingStatus { permission: PermissionState; observedAt: string; }
// The 2.0.0 binary lacks this diagnostic module. Unknown diagnostics must not
// disable tracking when the existing Expo location permissions are granted.
const native = requireOptionalNativeModule<{ getStatus(): Promise<NativeTrackingStatus> }>('VHDTrackingStatus');

export async function readTrackingReadiness(): Promise<TrackingReadiness> {
  const unknown: NativeTrackingStatus = { accuracyAuthorization: 'unknown', backgroundRefresh: 'unknown', batteryRestricted: null, lowPowerMode: null };
  const status = await native?.getStatus().catch(() => unknown) ?? unknown;
  const observedAt = new Date().toISOString();
  try {
    if (!await Location.hasServicesEnabledAsync()) return { ...status, observedAt, permission: { kind: 'services-disabled' } };
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) return { ...status, observedAt, permission: { kind: 'foreground-denied', canAskAgain: foreground.canAskAgain } };
    if (Platform.OS === 'android') status.accuracyAuthorization = foreground.android?.accuracy === 'fine' ? 'full' : 'reduced';
    const background = await Location.getBackgroundPermissionsAsync();
    if (!background.granted) return { ...status, observedAt, permission: { kind: 'background-denied', canAskAgain: background.canAskAgain } };
    if (status.accuracyAuthorization === 'reduced') return { ...status, observedAt, permission: { kind: 'precision-reduced' } };
    return { ...status, observedAt, permission: { kind: 'granted' } };
  } catch { return { ...status, observedAt, permission: { kind: 'unavailable' } }; }
}
