import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import { PowerSyncDatabase } from '@powersync/react-native';

const LOCATION_TASK_NAME = 'background-location-task';
const DEFAULT_TIME_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_DISTANCE_INTERVAL_METERS = 200;

type TrackingStatus = {
  isTracking: boolean;
  jobId: string | null;
};

type Listener = (status: TrackingStatus) => void;

interface TaskContext {
  isTracking: boolean;
  jobId: string | null;
  technicianId: string | null;
  db: PowerSyncDatabase | null;
}

const taskContext: TaskContext = {
  isTracking: false,
  jobId: null,
  technicianId: null,
  db: null,
};

const listeners = new Set<Listener>();

const notifyListeners = () => {
  const status = LocationTracker.getTrackingStatus();
  listeners.forEach((listener) => listener(status));
};

const getUUID = () => {
  if (typeof Crypto.randomUUID === 'function') {
    return Crypto.randomUUID();
  }

  // Fallback for environments without randomUUID support
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const ensureTaskDefined = () => {
  if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
    return;
  }

  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('Background location task error', error);
      return;
    }

    if (!data || !taskContext.db || !taskContext.technicianId) {
      return;
    }

    const { locations } = data as { locations: Location.LocationObject[] };
    if (!Array.isArray(locations) || locations.length === 0) {
      return;
    }

    const location = locations[0];
    const timestamp =
      'timestamp' in location && location.timestamp
        ? new Date(location.timestamp).toISOString()
        : new Date().toISOString();

    try {
      await taskContext.db.execute(
        `INSERT INTO technician_locations (id, technicianId, latitude, longitude, timestamp, isActive, currentJobId, accuracy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          getUUID(),
          taskContext.technicianId,
          location.coords.latitude,
          location.coords.longitude,
          timestamp,
          1,
          taskContext.jobId,
          location.coords.accuracy ?? null,
        ]
      );
    } catch (insertError) {
      console.error('Failed to persist background location update', insertError);
    }
  });
};

export class LocationTracker {
  static subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(LocationTracker.getTrackingStatus());
    return () => {
      listeners.delete(listener);
    };
  }

  static getTrackingStatus(): TrackingStatus {
    return {
      isTracking: taskContext.isTracking,
      jobId: taskContext.jobId,
    };
  }

  static async initialize(db: PowerSyncDatabase, technicianId?: string) {
    taskContext.db = db;

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );

      if (!hasStarted || !technicianId) {
        return;
      }

      const activeRecord = await db.get<{
        currentJobId: string | null;
      }>(
        `SELECT currentJobId FROM technician_locations
         WHERE technicianId = ? AND isActive = 1
         ORDER BY timestamp DESC
         LIMIT 1`,
        [technicianId]
      );

      taskContext.isTracking = true;
      taskContext.technicianId = technicianId;
      taskContext.jobId = activeRecord?.currentJobId ?? null;
      notifyListeners();
    } catch (error) {
      console.warn('Failed to restore location tracking state', error);
    }
  }

  static async requestPermissions(): Promise<boolean> {
    const { status: foregroundStatus } =
      await Location.requestForegroundPermissionsAsync();

    if (foregroundStatus !== Location.PermissionStatus.GRANTED) {
      console.log('Foreground location permission denied');
      return false;
    }

    const { status: backgroundStatus } =
      await Location.requestBackgroundPermissionsAsync();

    if (backgroundStatus !== Location.PermissionStatus.GRANTED) {
      console.log('Background location permission denied');
      return false;
    }

    return true;
  }

  static async startTracking(
    jobId: string,
    technicianId: string,
    db: PowerSyncDatabase
  ): Promise<void> {
    ensureTaskDefined();

    if (taskContext.isTracking && taskContext.jobId === jobId) {
      console.log('Location tracking already active for job', jobId);
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permissions not granted');
    }

    taskContext.db = db;
    taskContext.jobId = jobId;
    taskContext.technicianId = technicianId;

    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME
    );

    if (alreadyRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: DEFAULT_TIME_INTERVAL_MS,
      distanceInterval: DEFAULT_DISTANCE_INTERVAL_METERS,
      pausesUpdatesAutomatically: true,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'VHD - Tracking Active Job',
        notificationBody: 'Location tracking is active for your current job.',
        notificationColor: '#1a73e8',
      },
      deferredUpdatesInterval: DEFAULT_TIME_INTERVAL_MS,
      deferredUpdatesDistance: DEFAULT_DISTANCE_INTERVAL_METERS,
    });

    taskContext.isTracking = true;
    notifyListeners();

    await this.recordImmediateLocation();
  }

  static async stopTracking(
    technicianId: string,
    db: PowerSyncDatabase
  ): Promise<void> {
    ensureTaskDefined();

    taskContext.db = db;

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );

      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (error) {
      console.warn('Failed to stop background location updates', error);
    }

    try {
      await db.execute(
        `UPDATE technician_locations
         SET isActive = 0
         WHERE technicianId = ? AND isActive = 1`,
        [technicianId]
      );
    } catch (error) {
      console.error('Failed to mark technician locations as inactive', error);
    }

    taskContext.isTracking = false;
    taskContext.jobId = null;
    taskContext.technicianId = null;
    notifyListeners();
  }

  private static async recordImmediateLocation() {
    if (!taskContext.db || !taskContext.technicianId) {
      return;
    }

    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      await taskContext.db.execute(
        `INSERT INTO technician_locations (id, technicianId, latitude, longitude, timestamp, isActive, currentJobId, accuracy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          getUUID(),
          taskContext.technicianId,
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
          new Date().toISOString(),
          1,
          taskContext.jobId,
          currentLocation.coords.accuracy ?? null,
        ]
      );
    } catch (error) {
      console.warn('Failed to capture immediate location fix', error);
    }
  }
}

