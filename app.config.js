export default {
  expo: {
    runtimeVersion: '1.0.5',
    name: 'Vancouver Hood Doctors',
    slug: 'VHD-App',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'myapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    androidStatusBar: {
      backgroundColor: '#00000000',
      translucent: true,
      barStyle: 'dark-content',
    },
    splash: {
      image: './assets/images/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#111827',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.braille71.vhdapp',
      buildNumber: '1',
      infoPlist: {
        NSCameraUsageDescription:
          'This app uses the camera to capture photos of work completed.',
        NSPhotoLibraryUsageDescription:
          'This app needs access to your photos to save work documentation.',
        NSLocationWhenInUseUsageDescription:
          'VHD needs your location to track job sites and provide navigation.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'VHD needs background location to track your location during active jobs.',
        UIBackgroundModes: [
          'fetch',
          'remote-notification',
          'processing',
          'location',
        ],
        BGTaskSchedulerPermittedIdentifiers: [
          'com.braille71.vhdapp.background-sync',
          'com.braille71.vhdapp.background-fetch',
        ],
        ITSAppUsesNonExemptEncryption: false,
      },
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon-foreground.png',
        backgroundColor: '#FFFFFF',
      },
      package: 'com.braille71.VHDApp',
      permissions: [
        'android.permission.WAKE_LOCK',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.FOREGROUND_SERVICE_LOCATION',
      ],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
        },
      },
    },
    plugins: [
      'expo-router',
      'expo-sqlite',
      'expo-font',
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
          androidGoogleMapsApiKey:
            process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
        },
      ],
      'expo-web-browser',
      './plugins/withBackgroundActionsService',
      [
        'expo-local-authentication',
        {
          faceIDPermission: 'Allow $(Vancouver Hood Doctors) to use Face ID.',
        },
      ],
      [
        'expo-secure-store',
        {
          configureAndroidBackup: true,
          faceIDPermission:
            'Allow $(Vancouver Hood Doctors) to access your Face ID biometric data.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#ffffff',
          sounds: [],
          mode: 'production',
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'VHD tracks your location during active jobs to help managers coordinate schedules.',
          locationWhenInUsePermission:
            'VHD needs your location to track job sites and provide navigation.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission:
            'This app uses the camera to capture photos of work completed.',
        },
      ],
    ],
    notification: {
      icon: './assets/images/icon.png',
      color: '#1a73e8',
      androidMode: 'default',
      androidCollapsedTitle: 'VHD Schedule',
    },
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: '9b65aa8e-9c42-4db2-9033-ef5bab2d849a',
      },
    },
    updates: {
      url: 'https://u.expo.dev/9b65aa8e-9c42-4db2-9033-ef5bab2d849a',
    },
  },
};
