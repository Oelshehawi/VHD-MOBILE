// Copy constants for the Android battery-optimization nudge. Kept here (like
// locationPermissionCopy.ts) so the wording can be unit-tested without rendering.
//
// This nudge is Android-only: it guides field workers to mark VHD's battery
// usage "Unrestricted" so OEM power management cannot deep-sleep the app and
// suppress depot/jobsite geofence delivery. There is no API to read or set this
// device setting from JS, so the action button just opens the app info page.
export const batteryHintCopy = {
  title: 'Keep job tracking running in the background',
  body:
    'To save battery, Android can pause VHD and stop recording your depot and ' +
    'jobsite arrivals. Set VHD’s battery usage to “Unrestricted” so tracking keeps ' +
    'working when the app is closed.',
  steps: [
    'Tap “Open app settings” below',
    'Open Battery (or “App battery usage”)',
    'Choose “Unrestricted” / turn off “Optimize”',
    'Samsung: also remove VHD from Settings → Battery → Background usage limits → Sleeping apps'
  ],
  openLabel: 'Open app settings',
  dismissLabel: 'Not now',
  banner: 'Set VHD battery usage to Unrestricted so tracking isn’t paused.'
} as const;
