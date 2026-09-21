import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { requestMediaPermission } from './photos';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn()
}));

const originalPlatform = Platform.OS;
const cameraPermission = jest.mocked(ImagePicker.requestCameraPermissionsAsync);
const libraryPermission = jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync);
const denied = {
  status: 'denied' as ImagePicker.PermissionStatus,
  granted: false,
  canAskAgain: false,
  expires: 'never' as const
};
const granted = { ...denied, status: 'granted' as ImagePicker.PermissionStatus, granted: true };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  cameraPermission.mockResolvedValue(denied);
  libraryPermission.mockResolvedValue(denied);
});

afterEach(() => {
  Platform.OS = originalPlatform;
  jest.restoreAllMocks();
});

describe('photo permissions', () => {
  it('allows the iOS gallery without requesting library access, even when denied', async () => {
    Platform.OS = 'ios';

    await expect(requestMediaPermission('gallery')).resolves.toBe(true);

    expect(libraryPermission).not.toHaveBeenCalled();
    expect(cameraPermission).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'] as const)('still requires camera permission on %s', async platform => {
    Platform.OS = platform;

    await expect(requestMediaPermission('camera')).resolves.toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Permission Required', 'Camera access is needed to take photos.');

    cameraPermission.mockResolvedValue(granted);
    await expect(requestMediaPermission('camera')).resolves.toBe(true);
    expect(cameraPermission).toHaveBeenCalledTimes(2);
    expect(libraryPermission).not.toHaveBeenCalled();
  });

  it('preserves Android gallery permission checks', async () => {
    Platform.OS = 'android';

    await expect(requestMediaPermission('gallery')).resolves.toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Permission Required', 'Gallery access is needed to take photos.');

    libraryPermission.mockResolvedValue(granted);
    await expect(requestMediaPermission('gallery')).resolves.toBe(true);
    expect(libraryPermission).toHaveBeenCalledTimes(2);
  });

  it('does not request native permissions on web', async () => {
    Platform.OS = 'web';

    await expect(requestMediaPermission('gallery')).resolves.toBe(true);
    await expect(requestMediaPermission('camera')).resolves.toBe(true);
    expect(libraryPermission).not.toHaveBeenCalled();
    expect(cameraPermission).not.toHaveBeenCalled();
  });
});
