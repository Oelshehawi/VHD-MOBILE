import type { PermissionState } from '@/services/location/LocationTrackingState';

// Pure copy helper for the location permission gate. Platform-specific wording
// lives here so it can be unit-tested without rendering the bottom sheet.
//
// Note: the installed expo-location only reports iOS scope
// ('whenInUse' | 'always' | 'none') — it cannot detect or prompt for Precise
// Location or Background App Refresh. The iOS copy is therefore instructional:
// it tells the technician which iPhone settings to flip, and the "Open iPhone
// Settings" button deep-links there.

export interface LocationPermissionCopy {
  title: string;
  rationale: string;
  // iOS only: the red "Required iPhone settings" box. null on Android.
  requiredSettings: { heading: string; detail: string } | null;
  // iOS only: explanation that VHD cannot flip the settings itself. null on Android.
  settingsNote: string | null;
  requestLabel: string;
  openSettingsLabel: string;
  banner: (kind: PermissionState['kind']) => string;
}

const IOS_COPY: LocationPermissionCopy = {
  title: 'Turn on Always location',
  rationale:
    'VHD records depot and jobsite arrival/leave times during your scheduled travel windows. Choose "Always" so this works when the app is in the background.',
  requiredSettings: {
    heading: 'Required iPhone settings',
    detail: 'Location: Always, Precise Location: On, Background App Refresh: On'
  },
  settingsNote:
    "iOS does not let VHD switch these settings directly. The button opens this app's Settings page so the technician can choose Always.",
  requestLabel: 'Request Always location',
  openSettingsLabel: 'Open iPhone Settings',
  banner: (kind) => {
    switch (kind) {
      case 'services-disabled':
        return 'Location Services are off. Job tracking cannot record depot exits.';
      case 'foreground-denied':
        return 'Location permission is off. Tap to enable job tracking.';
      case 'background-denied':
        return 'Location must be set to Always for depot and job geofences.';
      default:
        return 'Location tracking needs attention.';
    }
  }
};

const ANDROID_COPY: LocationPermissionCopy = {
  title: 'Turn on location access',
  rationale:
    'VHD records depot and jobsite arrival/leave times during your scheduled travel windows. Choose "Allow all the time" so this works when the app is in the background.',
  requiredSettings: null,
  settingsNote: null,
  requestLabel: 'Allow location all the time',
  openSettingsLabel: 'Open Settings',
  banner: (kind) => {
    switch (kind) {
      case 'services-disabled':
        return 'Location Services are off. Job tracking cannot record depot exits.';
      case 'foreground-denied':
        return 'Location permission is off. Tap to enable job tracking.';
      case 'background-denied':
        return 'Location must be set to "Allow all the time" for depot and job geofences.';
      default:
        return 'Location tracking needs attention.';
    }
  }
};

export function getLocationPermissionCopy(platformOS: string): LocationPermissionCopy {
  return platformOS === 'ios' ? IOS_COPY : ANDROID_COPY;
}
