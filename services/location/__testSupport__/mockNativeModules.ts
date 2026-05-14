import { jest } from '@jest/globals';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: 49.1,
      longitude: -123.1,
      accuracy: 25,
      speed: null,
      heading: null
    },
    timestamp: Date.now()
  })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  hasStartedGeofencingAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn()
}));

jest.mock('expo-task-manager', () => ({
  isTaskDefined: () => true,
  defineTask: jest.fn()
}));

jest.mock('@/services/location/LocationEventQueue', () => ({
  postOrQueueLocationEvent: jest.fn(),
  flushLocationEventQueue: jest.fn()
}));

jest.mock('@/utils/DebugLogger', () => ({
  debugLogger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
