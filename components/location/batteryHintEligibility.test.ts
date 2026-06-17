import { describe, expect, it } from '@jest/globals';
import { shouldShowBatteryHint } from '@/components/location/batteryHintEligibility';

const ELIGIBLE = {
  isAndroid: true,
  isFieldTracker: true,
  permissionGranted: true,
  hasUpcomingWindow: true,
  acknowledged: false
} as const;

describe('shouldShowBatteryHint', () => {
  it('returns true when all conditions are met', () => {
    expect(shouldShowBatteryHint({ ...ELIGIBLE })).toBe(true);
  });

  it('returns false on iOS', () => {
    expect(shouldShowBatteryHint({ ...ELIGIBLE, isAndroid: false })).toBe(false);
  });

  it('returns false for managers / non field trackers', () => {
    expect(shouldShowBatteryHint({ ...ELIGIBLE, isFieldTracker: false })).toBe(false);
  });

  it('returns false when location permission is not granted', () => {
    expect(shouldShowBatteryHint({ ...ELIGIBLE, permissionGranted: false })).toBe(false);
  });

  it('returns false when there is no upcoming tracking window', () => {
    expect(shouldShowBatteryHint({ ...ELIGIBLE, hasUpcomingWindow: false })).toBe(false);
  });

  it('returns false once acknowledged', () => {
    expect(shouldShowBatteryHint({ ...ELIGIBLE, acknowledged: true })).toBe(false);
  });
});
