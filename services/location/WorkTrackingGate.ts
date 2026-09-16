import { Alert, Linking, Platform } from 'react-native';
import { getLocationOwner } from './LocationAccount';
import { readTrackingReadiness, type TrackingReadiness } from './TrackingReadiness';

export function workTrackingProblem(readiness: TrackingReadiness, platform: string): string | null {
  if (readiness.permission.kind !== 'granted') return 'Enable Location Services and Always location access.';
  if (readiness.accuracyAuthorization !== 'full') return 'Enable Precise Location. Its current state must be verified.';
  if (platform === 'ios' && readiness.backgroundRefresh !== 'available') return 'Enable Background App Refresh.';
  if (platform === 'android' && readiness.batteryRestricted !== false) return 'Set battery usage to Unrestricted.';
  return null;
}

// Guard user-initiated work writes only. Never gate delivery of existing queues.
export async function assertTrackingReadyForWork(): Promise<void> {
  if (!await getLocationOwner()) return;
  const problem = workTrackingProblem(await readTrackingReadiness(), Platform.OS);
  if (!problem) return;
  Alert.alert('Location settings required', problem, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } }
  ]);
  throw new Error(problem);
}
