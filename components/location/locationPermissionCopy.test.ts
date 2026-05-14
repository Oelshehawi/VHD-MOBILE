import { describe, expect, it } from '@jest/globals';
import { getLocationPermissionCopy } from '@/components/location/locationPermissionCopy';

describe('getLocationPermissionCopy', () => {
  it('returns iPhone-specific settings copy on iOS', () => {
    const copy = getLocationPermissionCopy('ios');

    expect(copy.requiredSettings).not.toBeNull();
    expect(copy.requiredSettings?.heading).toMatch(/iPhone/);
    expect(copy.requiredSettings?.detail).toMatch(/Precise Location/);
    expect(copy.openSettingsLabel).toBe('Open iPhone Settings');
    expect(copy.settingsNote).toMatch(/iOS/);
  });

  it('returns neutral copy without iPhone-specific wording on Android', () => {
    const copy = getLocationPermissionCopy('android');

    expect(copy.requiredSettings).toBeNull();
    expect(copy.settingsNote).toBeNull();
    expect(copy.openSettingsLabel).toBe('Open Settings');
    expect(copy.title).not.toMatch(/iPhone/);
    expect(copy.banner('background-denied')).not.toMatch(/iPhone/);
  });
});
