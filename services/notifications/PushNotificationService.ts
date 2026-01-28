import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { debugLogger } from '@/utils/DebugLogger';
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import type { PushNotificationData } from '@/types/notifications';

/**
 * PushNotificationService
 *
 * Manages Expo push notifications with PowerSync integration:
 * - Registers device for push notifications
 * - Stores token in PowerSync (auto-syncs to backend)
 * - Handles incoming notifications
 * - Navigates to appropriate screen on tap
 */
class PushNotificationService {
  private static instance: PushNotificationService;
  private expoPushToken: string | null = null;
  private notificationListener: Notifications.EventSubscription | null = null;
  private responseListener: Notifications.EventSubscription | null = null;
  private powerSync: AbstractPowerSyncDatabase | null = null;
  private userId: string | null = null;

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Initialize push notification service
   * Should be called after user authentication
   */
  async initialize(
    userId: string,
    powerSync: AbstractPowerSyncDatabase,
  ): Promise<void> {
    debugLogger.info('PUSH', 'Initializing push notification service');

    this.userId = userId;
    this.powerSync = powerSync;

    // Configure notification handler for foreground notifications
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Register for push notifications
    const token = await this.registerForPushNotifications();

    if (token) {
      this.expoPushToken = token;
      await this.saveTokenToDatabase(userId, token);
    }

    // Set up notification listeners
    this.setupNotificationListeners();
  }

  /**
   * Register device for push notifications and get Expo push token
   */
  private async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      debugLogger.warn('PUSH', 'Push notifications require physical device');
      return null;
    }

    try {
      // Check existing permissions
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not already granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        debugLogger.warn('PUSH', 'Push notification permission denied');
        return null;
      }

      // Get Expo push token
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        process.env.EXPO_PUBLIC_PROJECT_ID;
      if (!projectId) {
        debugLogger.error('PUSH', 'Missing EAS project ID');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      debugLogger.info('PUSH', 'Got Expo push token', {
        token: tokenData.data,
      });
      return tokenData.data;
    } catch (error) {
      debugLogger.error('PUSH', 'Failed to get push token', { error });
      return null;
    }
  }

  /**
   * Save push token to PowerSync database (auto-syncs to backend)
   */
  private async saveTokenToDatabase(
    userId: string,
    token: string,
  ): Promise<void> {
    if (!this.powerSync) {
      debugLogger.error('PUSH', 'PowerSync not initialized');
      return;
    }

    try {
      // Check if token already exists for this user
      const existing = await this.powerSync.getAll(
        'SELECT * FROM expopushtokens WHERE userId = ? AND token = ?',
        [userId, token],
      );

      const now = new Date().toISOString();
      const deviceName = Device.deviceName || 'Unknown Device';

      if (existing.length > 0) {
        // Update existing token
        await this.powerSync.execute(
          'UPDATE expopushtokens SET lastUsedAt = ?, updatedAt = ?, platform = ?, deviceName = ? WHERE userId = ? AND token = ?',
          [now, now, Platform.OS, deviceName, userId, token],
        );
        debugLogger.info('PUSH', 'Updated existing push token');
      } else {
        // Insert new token with default preferences (both enabled)
        const id = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await this.powerSync.execute(
          'INSERT INTO expopushtokens (id, userId, token, platform, deviceName, notifyNewJobs, notifyScheduleChanges, lastUsedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            id,
            userId,
            token,
            Platform.OS,
            deviceName,
            1, // notifyNewJobs enabled
            1, // notifyScheduleChanges enabled
            now,
            now,
            now,
          ],
        );
        debugLogger.info('PUSH', 'Saved new push token to database');
      }
    } catch (error) {
      debugLogger.error('PUSH', 'Failed to save token to database', {
        error,
      });
    }
  }

  /**
   * Set up listeners for incoming notifications and user interactions
   */
  private setupNotificationListeners(): void {
    // Handle notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        debugLogger.info('PUSH', 'Notification received in foreground', {
          data: notification.request.content.data,
        });
      },
    );

    // Handle user tapping on notification
    this.responseListener =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const rawData = response.notification.request.content.data;
        const data = rawData as unknown as PushNotificationData;
        debugLogger.info('PUSH', 'Notification tapped', { data });
        this.handleNotificationTap(data);
      });
  }

  /**
   * Handle notification tap - navigate to appropriate screen
   */
  private handleNotificationTap(data: PushNotificationData): void {
    switch (data.type) {
      case 'NEW_JOB_ASSIGNED':
      case 'SCHEDULE_UPDATED':
        if (data.scheduleId) {
          router.push({
            pathname: '/(tabs)/schedule',
            params: {
              scheduleId: data.scheduleId,
              highlight: 'true',
            },
          });
        } else {
          router.push('/(tabs)/schedule');
        }
        break;
      default:
        router.push('/(tabs)');
    }
  }

  /**
   * Unregister push token (e.g., on sign out)
   */
  async unregister(): Promise<void> {
    if (!this.powerSync || !this.userId || !this.expoPushToken) {
      return;
    }

    try {
      // Delete token from PowerSync (will sync to backend)
      await this.powerSync.execute(
        'DELETE FROM expopushtokens WHERE userId = ? AND token = ?',
        [this.userId, this.expoPushToken],
      );

      // Clean up listeners
      if (this.notificationListener) {
        this.notificationListener.remove();
      }
      if (this.responseListener) {
        this.responseListener.remove();
      }

      this.expoPushToken = null;
      this.userId = null;
      this.powerSync = null;

      debugLogger.info('PUSH', 'Push notifications unregistered');
    } catch (error) {
      debugLogger.error('PUSH', 'Failed to unregister push token', {
        error,
      });
    }
  }

  getToken(): string | null {
    return this.expoPushToken;
  }
}

export const pushNotificationService = PushNotificationService.getInstance();
