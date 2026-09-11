import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { requireOptionalNativeModule } from 'expo';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { readTrackingReadiness } from './TrackingReadiness';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => null) }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-location', () => ({
  hasServicesEnabledAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn()
}));

const granted = {
  status: 'granted',
  granted: true,
  canAskAgain: true,
  expires: 'never'
} as Location.LocationPermissionResponse;

describe('tracking readiness on the existing 2.0.0 binary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ ...granted });
    jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({ ...granted });
  });

  it('uses an optional diagnostic module that is absent on 2.0.0', () => {
    expect(requireOptionalNativeModule('VHDTrackingStatus')).toBeNull();
  });

  it('allows iPhone tracking without claiming that precision or battery settings were verified', async () => {
    const readiness = await readTrackingReadiness();

    expect(readiness).toMatchObject({
      permission: { kind: 'granted' },
      accuracyAuthorization: 'unknown',
      backgroundRefresh: 'unknown',
      batteryRestricted: null,
      lowPowerMode: null
    });
    expect(Number.isFinite(Date.parse(readiness.observedAt))).toBe(true);
  });

  it('still detects disabled Location Services', async () => {
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false);

    expect((await readTrackingReadiness()).permission.kind).toBe('services-disabled');
    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('still detects denied foreground access', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
      ...granted, granted: false, canAskAgain: false
    });

    expect((await readTrackingReadiness()).permission).toEqual({
      kind: 'foreground-denied', canAskAgain: false
    });
    expect(Location.getBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not mistake foreground-only access for background permission', async () => {
    jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({
      ...granted, granted: false, canAskAgain: true
    });

    expect((await readTrackingReadiness()).permission).toEqual({
      kind: 'background-denied', canAskAgain: true
    });
  });

  it('reports a failed permission check as unavailable rather than denied', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockRejectedValue(new Error('OS unavailable'));

    expect((await readTrackingReadiness()).permission.kind).toBe('unavailable');
  });

  it('can still verify Android fine location through the existing Expo module', async () => {
    Platform.OS = 'android';
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
      ...granted, android: { accuracy: 'fine' }
    });

    expect(await readTrackingReadiness()).toMatchObject({
      permission: { kind: 'granted' }, accuracyAuthorization: 'full', batteryRestricted: null
    });
  });

  it('still flags Android approximate location without the new diagnostic module', async () => {
    Platform.OS = 'android';
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
      ...granted, android: { accuracy: 'coarse' }
    });

    expect(await readTrackingReadiness()).toMatchObject({
      permission: { kind: 'precision-reduced' }, accuracyAuthorization: 'reduced'
    });
  });
});
