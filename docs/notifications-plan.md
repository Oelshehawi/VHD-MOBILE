Photo Reminder Local Notification System - Implementation Plan
Overview
Implement a local notification system to remind technicians to upload before/after photos for completed jobs. Uses Expo's local notifications (no backend needed) with SQLite to track scheduled reminders.
User Requirements
Goal: Remind technicians who forget to upload photos Notification Type: Local notifications (scheduled by app) Target Event: Missing photo reminders after job completion Platform: iOS and Android via Expo Simplicity: No backend APIs, no user settings UI, just works
Current System State
expo-notifications v0.32.12 is INSTALLED but UNUSED
Notification permissions already requested in utils/permissions.ts
Photos stored in schedules table as JSON: { id, url, type: 'before'|'after', status: 'pending'|'uploaded', timestamp, technicianId }
Upload system uses PhotoAttachmentQueue and BackgroundUploadService
PowerSync handles all data sync (offline-first SQLite)
Clerk authentication provides userId
Implementation Strategy
Local Notifications Approach
Why Local is Better Here:
✅ No backend changes needed
✅ Works offline
✅ Simpler implementation
✅ All schedules available locally via PowerSync
✅ Each technician gets their own notifications
✅ Can cancel if photos uploaded
✅ Lost if app uninstalled = acceptable tradeoff
How it works:
When schedule syncs to device, schedule a local notification
Notification triggers after schedule.hours time has passed
Before displaying, OS checks if notification is still valid
User taps notification → deep links to schedule + photo modal
If photos uploaded, notification auto-cancelled
Track scheduled notifications in local SQLite table
Reminder Logic
Send notification when ALL conditions are met:
Schedule duration has passed (currentTime > startDateTime + schedule.hours)
Photos are missing (zero photos OR missing before OR missing after)
Signature is NOT checked (only before/after photos matter)
Not already reminded for this schedule
Implementation Phases
Phase 1: Database Schema - Local-Only Table
File: services/database/schema.ts (MODIFY) Add local-only scheduled_notifications table (NOT synced to backend):

const scheduled_notifications = new Table(
  {
    id: new Column({ type: ColumnType.TEXT }),
    scheduleId: new Column({ type: ColumnType.TEXT }),
    userId: new Column({ type: ColumnType.TEXT }),
    type: new Column({ type: ColumnType.TEXT }), // 'PHOTO_REMINDER', future: 'SHIFT_REMINDER', etc.
    localNotificationId: new Column({ type: ColumnType.TEXT }), // Expo notification ID for cancellation
    scheduledFor: new Column({ type: ColumnType.TEXT }), // ISO timestamp
    createdAt: new Column({ type: ColumnType.TEXT }),
  },
  { indexes: { schedule_idx: ['scheduleId'], user_idx: ['userId'] } },
  { localOnly: true } // Don't sync to backend
);
Simplification:
✅ Photo reminders = LOCAL ONLY (no backend sync)
✅ Simple tracking for notification cancellation
✅ No API calls needed for photo reminders
✅ Future notifications (like "All photos uploaded") can use separate synced notifications table
Future Enhancement (not in this PR):
Add synced notifications table for admin dashboard notifications
Send notification to admin when techs complete ALL photos
That notification WOULD sync via PowerSync + API call
Phase 2: Notification Service
File: services/notifications/LocalNotificationService.ts (NEW) Core service for managing local notifications:

import * as Notifications from 'expo-notifications';
import { Schedule, PhotoType } from '@/types';
import { db } from '@/services/database';
import { router } from 'expo-router';

class LocalNotificationService {
  // Initialize notification handler
  static initialize() {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        // Before showing, check if photos still missing
        const { scheduleId } = notification.request.content.data;
        const photosMissing = await this.checkPhotosMissing(scheduleId);

        return {
          shouldShowAlert: photosMissing,  // Only show if still missing
          shouldPlaySound: photosMissing,
          shouldSetBadge: false,
        };
      },
    });
  }

  // Schedule reminder for a schedule
  static async scheduleReminder(schedule: Schedule, userId: string): Promise<void> {
    // Calculate trigger time: startDateTime + schedule.hours
    const startTime = new Date(schedule.startDateTime);
    const triggerTime = new Date(startTime.getTime() + schedule.hours * 60 * 60 * 1000);

    // Don't schedule if trigger is in the past
    if (triggerTime <= new Date()) return;

    // Schedule the Expo notification
    const localNotificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Photos needed for job',
        body: `Don't forget to upload before/after photos for ${schedule.jobTitle}`,
        data: {
          type: 'PHOTO_REMINDER',
          scheduleId: schedule.id,
          jobTitle: schedule.jobTitle,
        },
        sound: 'default',
      },
      trigger: triggerTime,
    });

    // Save to LOCAL-ONLY scheduled_notifications table (NO backend sync)
    await db.execute(
      `INSERT INTO scheduled_notifications (id, scheduleId, userId, type, localNotificationId, scheduledFor, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        schedule.id,
        userId,
        'PHOTO_REMINDER',
        localNotificationId,
        triggerTime.toISOString(),
        new Date().toISOString(),
      ]
    );
  }

  // Cancel reminder when photos uploaded
  static async cancelReminder(notificationId: string): Promise<void> {
    const notification = await db.execute(
      `SELECT * FROM scheduled_notifications WHERE id = ?`,
      [notificationId]
    );

    if (notification.rows.length > 0) {
      const { localNotificationId } = notification.rows._array[0];

      // Cancel the Expo notification
      if (localNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(localNotificationId);
      }

      // Delete from local database
      await db.execute(`DELETE FROM scheduled_notifications WHERE id = ?`, [notificationId]);
    }
  }

  // Check if photos are missing (before OR after)
  static async checkPhotosMissing(scheduleId: string): Promise<boolean> {
    const result = await db.execute(
      `SELECT photos FROM schedules WHERE id = ?`,
      [scheduleId]
    );

    if (result.rows.length === 0) return false;

    const { photos: photosJson } = result.rows._array[0];
    if (!photosJson) return true;

    const photos: PhotoType[] = JSON.parse(photosJson);
    if (photos.length === 0) return true;

    const uploadedPhotos = photos.filter(p => p.status === 'uploaded');
    const hasBefore = uploadedPhotos.some(p => p.type === 'before');
    const hasAfter = uploadedPhotos.some(p => p.type === 'after');

    return !hasBefore || !hasAfter;
  }

  // Set up notification tap listener
  static setupNotificationListeners() {
    Notifications.addNotificationResponseReceivedListener((response) => {
      const { scheduleId } = response.notification.request.content.data;

      if (scheduleId) {
        // Deep link to schedule and open photo modal
        router.push({
          pathname: '/(tabs)/schedule',
          params: { scheduleId, openPhotoModal: 'true' }
        });
      }
    });
  }
}

export { LocalNotificationService };
Key Methods:
initialize() - Set up notification handler (validates photos before showing)
scheduleReminder(schedule, userId) - Schedule notification and save to DB
cancelReminder(notificationId) - Cancel notification and delete from DB
checkPhotosMissing(scheduleId) - Check if before/after photos missing
setupNotificationListeners() - Handle notification taps
Key Design Decisions:
Uses local-only scheduled_notifications table (NO backend sync)
No API calls needed for photo reminders
Stores localNotificationId for cancellation
Includes userId and type for future extensibility
Simple and efficient - no backend complexity
Phase 3: Background Notification Checker (Using expo-task-manager)
File: services/notifications/PhotoReminderTask.ts (NEW) Background task using expo-task-manager to check schedules every 15 minutes:

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { db } from '@/services/database';
import { LocalNotificationService } from './LocalNotificationService';
import { Schedule, PhotoType } from '@/types';

const PHOTO_REMINDER_TASK = 'PHOTO_REMINDER_CHECK';

// Define the background task
TaskManager.defineTask(PHOTO_REMINDER_TASK, async () => {
  try {
    const userId = await AsyncStorage.getItem('userId'); // Get from storage
    if (!userId) return BackgroundFetch.BackgroundFetchResult.NoData;

    await checkAndScheduleReminders(userId);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Error in photo reminder task:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Main check logic
async function checkAndScheduleReminders(userId: string) {
  // Query schedules from past week for current user
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const result = await db.execute(
    `SELECT * FROM schedules
     WHERE assignedTechnicians LIKE ?
     AND startDateTime >= ?`,
    [`%${userId}%`, oneWeekAgo.toISOString()]
  );

  for (const schedule of result.rows._array) {
    await processSchedule(schedule, userId);
  }
}

async function processSchedule(schedule: Schedule, userId: string) {
  // Check if notification already exists for this schedule
  const existing = await db.execute(
    `SELECT * FROM scheduled_notifications
     WHERE scheduleId = ?
     AND type = 'PHOTO_REMINDER'`,
    [schedule.id]
  );

  const hasExisting = existing.rows.length > 0;

  // Check if photos are missing
  const photosMissing = isPhotosMissing(schedule.photos);

  if (photosMissing && !hasExisting) {
    // Photos missing and no notification - schedule one
    await LocalNotificationService.scheduleReminder(schedule, userId);
  } else if (!photosMissing && hasExisting) {
    // Photos uploaded - cancel notification
    const notification = existing.rows._array[0];
    await LocalNotificationService.cancelReminder(notification.id);
  }
}

function isPhotosMissing(photosJson: string | undefined): boolean {
  if (!photosJson) return true;

  const photos: PhotoType[] = JSON.parse(photosJson);
  if (photos.length === 0) return true;

  const uploadedPhotos = photos.filter(p => p.status === 'uploaded');
  const hasBefore = uploadedPhotos.some(p => p.type === 'before');
  const hasAfter = uploadedPhotos.some(p => p.type === 'after');

  return !hasBefore || !hasAfter;
}

// Register the background task
export async function registerPhotoReminderTask() {
  await BackgroundFetch.registerTaskAsync(PHOTO_REMINDER_TASK, {
    minimumInterval: 15 * 60, // 15 minutes
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

// Unregister the task
export async function unregisterPhotoReminderTask() {
  await BackgroundFetch.unregisterTaskAsync(PHOTO_REMINDER_TASK);
}
Benefits of expo-task-manager:
✅ Proper background execution - Works even when app is backgrounded/terminated
✅ OS-managed scheduling - System handles wake-ups efficiently
✅ Battery efficient - OS batches background tasks
✅ Cross-platform - Works on iOS and Android
✅ Reliable - More robust than setInterval
Why This is Better than setInterval:
setInterval only works when app is in foreground
expo-task-manager works in background and even after app termination
OS manages wake-ups to minimize battery drain
Already have expo-task-manager installed
Phase 4: App Integration
File: app/_layout.tsx (MODIFY) Initialize notification system and register background task after Clerk loads: Add to existing useEffect at line 57-71:

import { LocalNotificationService } from '@/services/notifications/LocalNotificationService';
import { registerPhotoReminderTask } from '@/services/notifications/PhotoReminderTask';
import AsyncStorage from '@react-native-async-storage/async-storage';

useEffect(() => {
  if (isLoaded && user?.id) {
    SplashScreen.hideAsync();
    initImageCache().catch(...);
    requestAppPermissions().catch(...);

    // ADD: Initialize local notification handler
    LocalNotificationService.initialize();

    // ADD: Set up notification tap listeners
    LocalNotificationService.setupNotificationListeners();

    // ADD: Store userId for background task
    AsyncStorage.setItem('userId', user.id).catch(console.warn);

    // ADD: Register background task for periodic checks
    registerPhotoReminderTask().catch(err => {
      console.warn('Failed to register photo reminder task:', err);
    });
  }
}, [isLoaded, user?.id]);
Note: Background task runs every 15 minutes automatically once registered. No manual cleanup needed. File: app/(tabs)/schedule.tsx (MODIFY) Handle deep linking from notification taps:

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function ScheduleScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { scheduleId, openPhotoModal } = params;

  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  // Auto-open PhotoDocumentationModal if scheduleId present
  useEffect(() => {
    if (scheduleId && openPhotoModal === 'true') {
      // Find schedule and open modal
      const schedule = schedules.find(s => s.id === scheduleId);
      if (schedule) {
        setSelectedSchedule(schedule);
        // Modal will open via state change

        // Clear URL params
        router.setParams({ scheduleId: '', openPhotoModal: '' });
      }
    }
  }, [scheduleId, openPhotoModal]);
}
Notification Content Design
Notification Format:

{
  title: "Photos needed for job",
  body: "Don't forget to upload before/after photos for [Job Title]",
  sound: 'default',
  data: {
    type: 'photo_reminder',
    scheduleId: string,
    jobTitle: string,
  },
}
Behavior:
Notification scheduled for startDateTime + schedule.hours
Before displaying, system checks if photos still missing via notification handler
If photos uploaded before trigger time, notification won't display
User taps notification → navigates to schedule and opens PhotoDocumentationModal
Edge Cases & Error Handling
1. Photos Uploaded Before Notification Triggers
Solution: Notification handler checks photo status before displaying
If both before/after photos exist, returns shouldShowAlert: false
Notification silently dismissed by OS
ScheduleWatcher also cancels the scheduled notification reactively
2. Schedule in the Past (Trigger Time Already Passed)
Solution: scheduleReminder() checks if trigger time is in the past
If triggerTime <= new Date(), notification is not scheduled
Prevents errors from Expo notifications API
3. Schedule Deleted/Cancelled
Solution: ScheduleWatcher runs reactively
When schedule disappears from query results, notification auto-cancelled
Database record also deleted from scheduled_photo_reminders table
4. App Uninstalled/Reinstalled
Accepted Tradeoff: All scheduled notifications lost
User confirmed this is acceptable
On reinstall, new schedules will get fresh notifications
5. Notification Permission Denied
Solution: Graceful degradation
scheduleNotificationAsync() will silently fail
App continues to work normally
Notification permissions already requested by requestAppPermissions()
6. Duplicate Notifications
Solution: Check for existing reminder before scheduling
Query scheduled_photo_reminders table by schedule_id
Only schedule if no existing record found
7. Multiple Technicians on Same Schedule
Behavior: Each technician gets their own notification
Schedule syncs to each assigned technician's device
Each device independently schedules local notification
Each tech sees reminder if THEY haven't uploaded photos
✅ This is correct behavior per user requirements
Testing Plan
Manual Testing Checklist
✅ First app launch → notification permission already requested (existing permissions.ts)
✅ New schedule assigned → notification scheduled for startDateTime + hours
✅ Upload before/after photos before trigger → notification NOT shown
✅ Don't upload photos → notification shows at trigger time
✅ Upload only before photo → notification still shows (missing after)
✅ Upload only after photo → notification still shows (missing before)
✅ Tap notification → opens schedule screen with PhotoDocumentationModal
✅ Multiple schedules → each gets independent notification
Test Scenarios
Schedule with 0 photos: Should notify
Schedule with only before photo: Should notify (missing after)
Schedule with only after photo: Should notify (missing before)
Schedule with both before/after: Should NOT notify
Photos in pending status: Should notify (not uploaded yet)
Schedule in the past: Should not schedule notification
Dev Testing Tools
Add debug method to list all scheduled notifications
Add method to trigger test notification immediately
Log notification scheduling/cancellation events
Performance Considerations
Battery Optimization
Local notifications handled by OS (very efficient)
ScheduleWatcher uses PowerSync reactive queries (no polling)
Only runs when schedule data actually changes
Database queries use indexed schedule_id column
Memory Usage
scheduled_photo_reminders table is small (one row per schedule)
Cleaned up automatically when notifications cancelled
No background timers or intervals needed
Database Performance
Single index on schedule_id for fast lookups
Simple queries (single table reads)
No joins or complex aggregations
Files to Create
services/notifications/LocalNotificationService.ts - Core notification service (schedule, cancel, check photos)
services/notifications/PhotoReminderTask.ts - Background task using expo-task-manager (runs every 15 min)
Files to Modify
services/database/schema.ts - Add scheduled_notifications table (LOCAL ONLY, no backend sync)
app/_layout.tsx - Initialize notification handler, listeners, and register background task
app/(tabs)/schedule.tsx - Handle deep linking from notification taps
Key Implementation Details
Notification Trigger Time Calculation

const triggerTime = new Date(schedule.startDateTime).getTime() + (schedule.hours * 60 * 60 * 1000);
Photo Missing Detection
Check for uploaded photos of type before AND after:

const uploadedPhotos = photos.filter(p => p.status === 'uploaded');
const hasBefore = uploadedPhotos.some(p => p.type === 'before');
const hasAfter = uploadedPhotos.some(p => p.type === 'after');
return !hasBefore || !hasAfter;
Notification Handler (Final Check Before Display)

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const { scheduleId } = notification.request.content.data;
    const photosMissing = await checkPhotosMissing(scheduleId);

    return {
      shouldShowAlert: photosMissing,
      shouldPlaySound: photosMissing,
      shouldSetBadge: false,
    };
  },
});
Success Metrics
Notification scheduling rate: 100% of new schedules
Cancellation rate when photos uploaded: 100%
False positive rate: 0% (handler validates before showing)
Photo upload rate after reminder: Target >50%
User complaints about notifications: <1%
Implementation Notes
No backend changes needed - 100% client-side solution
No API calls needed - Photo reminders are purely local
No user settings needed - Simple and automatic
Permissions already handled - utils/permissions.ts requests POST_NOTIFICATIONS
Works offline - Notifications scheduled locally, OS handles delivery
Background execution - Uses expo-task-manager for reliable background checks
Lost on uninstall - Acceptable tradeoff per user requirements
Each technician independent - Each device schedules its own notifications
Smart cancellation - Background task checks + final validation via notification handler
Future Enhancements (Not in This PR)
Admin Notifications (Synced to Backend)
When technician uploads ALL photos for a schedule:
Create notification record in synced notifications table
Call API route to write to backend MongoDB
Sync via PowerSync to admin dashboard
Admin sees "Photos completed for Job XYZ" notification
Implementation:
Add notifications table to PowerSync schema (synced)
Create API route: POST /api/notifications/create
Call from PhotoCapture component after last photo uploaded
Reuses existing MongoDB Notification model shown above
This keeps photo REMINDERS local-only while allowing photo COMPLETION notifications to sync to admin.