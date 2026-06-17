// Pure, unit-testable predicate for the Android battery-optimization nudge.
// Mirrors locationPermissionEligibility's style: all gating logic lives here so
// it can be tested without rendering the bottom sheet.
//
// The nudge is the step *after* "Allow all the time": it only makes sense once
// location permission is fully granted, and only on Android where OEM battery
// optimization (Doze, Samsung "Sleeping apps", etc.) can suppress geofences.
export function shouldShowBatteryHint(args: {
  isAndroid: boolean;
  isFieldTracker: boolean;
  permissionGranted: boolean;
  hasUpcomingWindow: boolean;
  acknowledged: boolean;
}): boolean {
  return (
    args.isAndroid &&
    args.isFieldTracker &&
    args.permissionGranted &&
    args.hasUpcomingWindow &&
    !args.acknowledged
  );
}
