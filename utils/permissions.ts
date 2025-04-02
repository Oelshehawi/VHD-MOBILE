import { Platform, PermissionsAndroid } from 'react-native';

/**
 * Request notification permission on Android 13+ (API level 33+)
 * On older Android versions, this is not required
 * @returns Promise<boolean> Whether the permission was granted
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  // Only needed on Android 13+ (API level 33+)
  if (Platform.OS !== 'android' || Platform.Version < 33) {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Notification Permission',
        message:
          'This app needs permission to show notifications for background uploads and important updates',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );

    const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;

    if (!isGranted) {
      console.log('POST_NOTIFICATIONS permission denied');
    }

    return isGranted;
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return false;
  }
};

/**
 * Request all required permissions for the app
 * @returns Promise<void>
 */
export const requestAppPermissions = async (): Promise<void> => {
  // Request notification permission
  await requestNotificationPermission();

  // Add future permission requests here
};
