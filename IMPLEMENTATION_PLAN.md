# VHD-App Feature Implementation Plan
**Version:** 1.0
**Date:** January 20, 2025
**Features:** Push Notifications, Weekly Schedule View, Weather Integration, Live Technician Tracking

---

## Table of Contents
1. [Pre-Implementation: Build Configuration Setup](#pre-implementation-build-configuration-setup)
2. [Architecture Overview](#architecture-overview)
3. [Feature 1: Push Notifications](#feature-1-push-notifications)
4. [Feature 2: Weekly Schedule View](#feature-2-weekly-schedule-view)
5. [Feature 3: Weather Integration](#feature-3-weather-integration)
6. [Feature 4: Live Technician Tracking](#feature-4-live-technician-tracking)
7. [Location Update Interval Analysis](#location-update-interval-analysis)
8. [Implementation Timeline](#implementation-timeline)
9. [Testing Strategy](#testing-strategy)
10. [Projected Costs & API Limits](#projected-costs--api-limits)

---

## Pre-Implementation: Build Configuration Setup

**IMPORTANT:** Complete this section FIRST before implementing any features. These changes require a new EAS build and cannot be delivered via OTA updates (`npx eas update`).

### Why This Section Exists

EAS Updates (OTA) can only update JavaScript code. The following changes require a full rebuild:
- Native module installations (new packages)
- `app.json` / `app.config.js` modifications
- Native permissions and plugins
- Google Maps API key configuration

By completing all build-requiring changes upfront, you can:
1. Build once for preview (`npx eas build --profile preview --platform all`)
2. Test all features incrementally via OTA updates (`npx eas update --branch preview`)
3. Avoid multiple rebuild cycles during development

---

### Step 0.1: Install All Required Native Packages

Install all packages at once to avoid multiple rebuilds:

```bash
# All packages for all features
npx expo install expo-notifications expo-device expo-constants expo-calendar expo-location react-native-maps expo-task-manager
```

**Package Summary:**
- `expo-notifications`, `expo-device`, `expo-constants` - Push notifications (Feature 1)
- `expo-calendar` - Calendar export (Feature 2, future use)
- `expo-location`, `expo-task-manager` - Background location tracking (Feature 4)
- `react-native-maps` - Google Maps integration (Feature 4)

**Verification:**
Check `package.json` to ensure all packages are added with correct versions.

---

### Step 0.2: Update app.json with All Configuration Changes

**CRITICAL:** This is a one-time change. Update your `app.json` to include all permissions, plugins, and API keys for all features.

#### Option A: Update Existing app.json

Add/merge these sections into your existing `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff",
          "sounds": [],
          "mode": "production"
        }
      ],
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "VHD tracks your location during active jobs to help managers coordinate schedules.",
          "locationWhenInUsePermission": "VHD needs your location to track job sites and provide navigation.",
          "isIosBackgroundLocationEnabled": true,
          "isAndroidBackgroundLocationEnabled": true
        }
      ],
      [
        "react-native-maps",
        {
          "androidGoogleMapsApiKey": "YOUR_ANDROID_KEY_HERE",
          "iosGoogleMapsApiKey": "YOUR_IOS_KEY_HERE"
        }
      ]
    ],
    "notification": {
      "icon": "./assets/notification-icon.png",
      "color": "#1a73e8",
      "androidMode": "default",
      "androidCollapsedTitle": "VHD Schedule"
    },
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "VHD needs your location to track job sites and provide navigation",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "VHD needs background location to track your location during active jobs",
        "UIBackgroundModes": ["location", "remote-notification"]
      }
    },
    "android": {
      "permissions": [
        "POST_NOTIFICATIONS",
        "RECEIVE_BOOT_COMPLETED",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION"
      ]
    }
  }
}
```

#### Option B: Convert to app.config.js (Recommended for Security)

For better security with environment variables, rename `app.json` to `app.config.js`:

```javascript
export default {
  expo: {
    // ... existing config from your app.json
    plugins: [
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#ffffff',
          sounds: [],
          mode: 'production',
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'VHD tracks your location during active jobs to help managers coordinate schedules.',
          locationWhenInUsePermission: 'VHD needs your location to track job sites and provide navigation.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
          iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
        },
      ],
    ],
    notification: {
      icon: './assets/notification-icon.png',
      color: '#1a73e8',
      androidMode: 'default',
      androidCollapsedTitle: 'VHD Schedule',
    },
    ios: {
      // ... existing iOS config
      infoPlist: {
        // ... existing infoPlist entries
        NSLocationWhenInUseUsageDescription: 'VHD needs your location to track job sites and provide navigation',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'VHD needs background location to track your location during active jobs',
        UIBackgroundModes: ['location', 'remote-notification'],
      },
    },
    android: {
      // ... existing Android config
      permissions: [
        'POST_NOTIFICATIONS',
        'RECEIVE_BOOT_COMPLETED',
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
      ],
    },
  },
};
```

---

### Step 0.3: Update Environment Variables

Add to your `.env` file:

```env
# Existing variables
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_POWERSYNC_URL=https://679ff7c36bc62bf1f163ab46.powersync.journeyapps.com
EXPO_PUBLIC_API_URL=https://vhd-psi.vercel.app
CLOUDINARY_URL=cloudinary://...
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=...
EXPO_PUBLIC_CLOUDINARY_API_KEY=...

# NEW: Weather API (Feature 3)
EXPO_PUBLIC_WEATHER_API_KEY=your_weatherapi_key_here

# NEW: Google Maps API Keys (Feature 4)
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=your_android_google_maps_key
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=your_ios_google_maps_key

# NEW: Expo Project ID (Feature 1 - Push Notifications)
EXPO_PUBLIC_EXPO_PROJECT_ID=your_expo_project_id
```

**How to get these:**
- **WeatherAPI.com key:** Sign up at https://www.weatherapi.com/pricing.aspx
- **Google Maps keys:** Follow detailed setup in [Step 4.2](#step-42-setup-google-maps-api-keys)
- **Expo Project ID:** Run `npx expo config --type public` and look for `projectId`

---

### Step 0.4: Setup External Services

Before building, set up these external services to get API keys:

#### 4a. Google Cloud Console (for Google Maps)

**Time required:** 15-20 minutes

1. **Create Google Cloud Project:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Click "Select a project" → "New Project"
   - Name: "VHD-App-Maps"
   - Click "Create"

2. **Enable APIs:**
   - Go to "APIs & Services" → "Library"
   - Search and enable:
     - "Maps SDK for Android"
     - "Maps SDK for iOS"

3. **Create Android API Key:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the key → Click "Edit API key"
   - **Application restrictions:**
     - Select "Android apps"
     - Click "Add an item"
     - **Package name:** Get from `app.json` → `expo.android.package` (e.g., `com.vhd.app`)
     - **SHA-1 fingerprint:** Run this command:
       ```bash
       # Windows
       keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android

       # Mac/Linux
       keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
       ```
     - Copy the SHA-1 value (format: `AA:BB:CC:DD:...`)
   - **API restrictions:**
     - Select "Restrict key"
     - Check "Maps SDK for Android"
   - Click "Save"
   - **Copy API key to `.env` as `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`**

4. **Create iOS API Key:**
   - Go to "Credentials" → "Create Credentials" → "API Key"
   - Copy the key → Click "Edit API key"
   - **Application restrictions:**
     - Select "iOS apps"
     - Click "Add an item"
     - **Bundle ID:** Get from `app.json` → `expo.ios.bundleIdentifier` (e.g., `com.vhd.app`)
   - **API restrictions:**
     - Select "Restrict key"
     - Check "Maps SDK for iOS"
   - Click "Save"
   - **Copy API key to `.env` as `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY`**

5. **Set up billing (required even for free tier):**
   - Go to "Billing" → "Link a billing account"
   - Add credit card (you won't be charged within free tier)
   - Set billing alerts at $10, $25, $50

#### 4b. WeatherAPI.com (for Weather Integration)

**Time required:** 5 minutes

1. Sign up at https://www.weatherapi.com/signup.aspx
2. Verify email
3. Go to dashboard → Copy your API key
4. **Add to `.env` as `EXPO_PUBLIC_WEATHER_API_KEY`**
5. Verify free tier limits (check pricing page for current limits)

#### 4c. Get Expo Project ID (for Push Notifications)

**Time required:** 1 minute

Run this command in your project directory:
```bash
npx expo config --type public
```

Look for the `projectId` field in the output, copy it, and add to `.env` as `EXPO_PUBLIC_EXPO_PROJECT_ID`.

---

### Step 0.5: Create Notification Assets (Optional)

If you want custom notification icons (otherwise default app icon will be used):

1. Create a notification icon (must be white silhouette on transparent background)
2. Save as `assets/notification-icon.png` (96x96px minimum)
3. The icon configured in `app.json` will be used automatically

---

### Step 0.6: Run Prebuild (Optional, for Local Development)

If you're doing local development builds:

```bash
npx expo prebuild --clean
```

This generates native iOS/Android folders with all the configurations.

---

### Step 0.7: Build Preview Version

Now that all native changes are configured, create a preview build:

```bash
# Build for both platforms
npx eas build --profile preview --platform all

# Or build individually:
npx eas build --profile preview --platform android
npx eas build --profile preview --platform ios
```

**Build time:** 10-20 minutes per platform

**After build completes:**
1. Download and install the preview build on your test device
2. Verify the app launches successfully
3. Check that permissions are requestable (don't need to grant them yet)

---

### Step 0.8: Verify OTA Update Setup

After installing the preview build, test that OTA updates work:

1. Make a small change (e.g., add a console.log or change a text string)
2. Run:
   ```bash
   npx eas update --branch preview
   ```
3. Close and reopen the app on your device
4. Verify the change appears

**If OTA updates work, you're ready to implement features!**

---

### What's Next?

Now that you've completed the build setup:

✅ All native packages are installed
✅ All permissions are configured
✅ API keys are set up
✅ Preview build is deployed
✅ OTA updates are working

**You can now implement all features using only OTA updates** (`npx eas update --branch preview`). No more rebuilds needed unless you add additional native dependencies.

**Recommended implementation order:**
1. Feature 2: Weekly Schedule View (pure JS, easiest to test)
2. Feature 3: Weather Integration (API integration, no permissions needed)
3. Feature 4: Live Technician Tracking (uses location permissions)
4. Feature 1: Push Notifications (uses notification permissions)

Each feature can be tested immediately after publishing an OTA update!

---

## Architecture Overview

### Technology Stack
- **Frontend:** React Native (Expo)
- **Database Sync:** PowerSync + MongoDB
- **Authentication:** Clerk
- **Storage:** Cloudinary (photos), AsyncStorage (local prefs)
- **APIs:** WeatherAPI.com (weather data)

### PowerSync + MongoDB Integration Pattern

For all features requiring server sync (location tracking, notifications), follow this pattern:

1. **MongoDB Setup:**
   - Create new collection in MongoDB database
   - Define schema with required fields
   - Add appropriate indexes

2. **PowerSync Dashboard:**
   - Add collection to PowerSync sync rules
   - Configure sync parameters (bucket/global)
   - Test sync connection

3. **App Integration:**
   - Add table definition to `services/database/schema.ts`
   - Use existing PowerSync queries (`useQuery` hook)
   - Leverage offline-first capabilities

**Data Flow:**
```
App (Write) → PowerSync Local DB → Sync → MongoDB Backend
MongoDB Backend → Sync → PowerSync Local DB → App (Read)
```

---

## Feature 1: Push Notifications

### Overview
Granular notification preferences for schedule changes, new assignments, cancellations, and reminders.

### What Users Get
- ✅ Notifications for new job assignments (default ON)
- ✅ Notifications for schedule changes (default ON)
- ✅ Notifications for job cancellations (default ON)
- ⬜ 30-minute reminders before jobs (default OFF)
- ✅ Job completion notifications (managers only, default ON)
- Settings stored locally (AsyncStorage)
- Push tokens stored in Clerk user metadata

### Implementation Steps

#### Step 1.1: Install Dependencies
```bash
npx expo install expo-notifications expo-device expo-constants
```

**Why these packages:**
- `expo-notifications`: Core notification functionality
- `expo-device`: Device info for permission checks
- `expo-constants`: Access to device constants

#### Step 1.2: Update app.json
Add to existing `app.json`:
```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff",
          "sounds": ["./assets/notification-sound.wav"],
          "mode": "production"
        }
      ]
    ],
    "notification": {
      "icon": "./assets/notification-icon.png",
      "color": "#1a73e8",
      "androidMode": "default",
      "androidCollapsedTitle": "VHD Schedule"
    },
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "POST_NOTIFICATIONS",
        "RECEIVE_BOOT_COMPLETED"
      ]
    }
  }
}
```

#### Step 1.3: Create Notification Preferences Service
**File:** `services/notifications/preferences.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPreferences {
  newAssignments: boolean;
  scheduleChanges: boolean;
  cancellations: boolean;
  reminders30Min: boolean;
  completions: boolean; // Managers only
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  newAssignments: true,
  scheduleChanges: true,
  cancellations: true,
  reminders30Min: false,
  completions: true,
};

const STORAGE_KEY = '@vhd_notification_preferences';

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Error loading notification preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    throw error;
  }
}
```

#### Step 1.4: Create Notification Service
**File:** `services/notifications/NotificationService.ts`

```typescript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { getNotificationPreferences } from './preferences';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export class NotificationService {
  /**
   * Register device for push notifications and store token in Clerk
   */
  static async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permissions denied');
      return null;
    }

    // Get push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'your-expo-project-id', // TODO: Replace with actual project ID
    });

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1a73e8',
      });
    }

    return tokenData.data;
  }

  /**
   * Store push token in Clerk user metadata
   */
  static async storePushTokenInClerk(token: string, userId: string): Promise<void> {
    try {
      // Use Clerk API to update user metadata
      // This requires backend API endpoint or Clerk SDK
      await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/users/${userId}/push-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pushToken: token }),
      });
    } catch (error) {
      console.error('Error storing push token:', error);
    }
  }

  /**
   * Schedule local notification for job reminder
   */
  static async scheduleJobReminder(
    jobId: string,
    jobTitle: string,
    location: string,
    startTime: Date
  ): Promise<void> {
    const prefs = await getNotificationPreferences();
    if (!prefs.reminders30Min) return;

    const reminderTime = new Date(startTime.getTime() - 30 * 60 * 1000); // 30 min before
    if (reminderTime < new Date()) return; // Don't schedule past reminders

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Job Starting Soon',
        body: `${jobTitle} at ${location} starts in 30 minutes`,
        data: { jobId, type: 'reminder' },
        sound: true,
      },
      trigger: reminderTime,
    });
  }

  /**
   * Send local notification for schedule change
   */
  static async notifyScheduleChange(
    type: 'new' | 'update' | 'cancel',
    jobTitle: string,
    location: string
  ): Promise<void> {
    const prefs = await getNotificationPreferences();

    let shouldNotify = false;
    let title = '';
    let emoji = '';

    switch (type) {
      case 'new':
        shouldNotify = prefs.newAssignments;
        title = 'New Job Assignment';
        emoji = '🆕';
        break;
      case 'update':
        shouldNotify = prefs.scheduleChanges;
        title = 'Schedule Changed';
        emoji = '📅';
        break;
      case 'cancel':
        shouldNotify = prefs.cancellations;
        title = 'Job Cancelled';
        emoji = '❌';
        break;
    }

    if (!shouldNotify) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${emoji} ${title}`,
        body: `${jobTitle} at ${location}`,
        data: { type },
        sound: true,
      },
      trigger: null, // Show immediately
    });
  }

  /**
   * Cancel all scheduled notifications for a job
   */
  static async cancelJobNotifications(jobId: string): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const toCancel = scheduled.filter(n => n.content.data?.jobId === jobId);

    for (const notification of toCancel) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}
```

#### Step 1.5: Update Profile Page with Notification Settings
**File:** `app/(tabs)/profile.tsx`

Add new section after account details:

```typescript
import { useState, useEffect } from 'react';
import { Switch, View, Text, StyleSheet } from 'react-native';
import { getNotificationPreferences, saveNotificationPreferences, NotificationPreferences } from '@/services/notifications/preferences';

// Inside ProfileScreen component:
const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);

useEffect(() => {
  loadNotificationPreferences();
}, []);

async function loadNotificationPreferences() {
  const prefs = await getNotificationPreferences();
  setNotificationPrefs(prefs);
}

async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
  if (!notificationPrefs) return;

  const updated = { ...notificationPrefs, [key]: value };
  setNotificationPrefs(updated);
  await saveNotificationPreferences(updated);
}

// Add to JSX after Account Details section:
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Notifications</Text>

  <View style={styles.preferenceRow}>
    <Text style={styles.preferenceLabel}>New Job Assignments</Text>
    <Switch
      value={notificationPrefs?.newAssignments ?? true}
      onValueChange={(v) => updatePreference('newAssignments', v)}
      trackColor={{ true: '#1a73e8' }}
    />
  </View>

  <View style={styles.preferenceRow}>
    <Text style={styles.preferenceLabel}>Schedule Changes</Text>
    <Switch
      value={notificationPrefs?.scheduleChanges ?? true}
      onValueChange={(v) => updatePreference('scheduleChanges', v)}
      trackColor={{ true: '#1a73e8' }}
    />
  </View>

  <View style={styles.preferenceRow}>
    <Text style={styles.preferenceLabel}>Job Cancellations</Text>
    <Switch
      value={notificationPrefs?.cancellations ?? true}
      onValueChange={(v) => updatePreference('cancellations', v)}
      trackColor={{ true: '#1a73e8' }}
    />
  </View>

  <View style={styles.preferenceRow}>
    <Text style={styles.preferenceLabel}>30-Minute Reminders</Text>
    <Switch
      value={notificationPrefs?.reminders30Min ?? false}
      onValueChange={(v) => updatePreference('reminders30Min', v)}
      trackColor={{ true: '#1a73e8' }}
    />
  </View>

  {isManager && (
    <View style={styles.preferenceRow}>
      <Text style={styles.preferenceLabel}>Job Completions</Text>
      <Switch
        value={notificationPrefs?.completions ?? true}
        onValueChange={(v) => updatePreference('completions', v)}
        trackColor={{ true: '#1a73e8' }}
      />
    </View>
  )}
</View>
```

#### Step 1.6: PowerSync Change Listeners
**File:** `services/notifications/scheduleListeners.ts`

```typescript
import { PowerSyncDatabase } from '@powersync/react-native';
import { NotificationService } from './NotificationService';

export function setupScheduleChangeListeners(db: PowerSyncDatabase) {
  // Watch for schedule changes
  db.watch('SELECT * FROM schedules', [], {
    onResult: (result) => {
      // Handle new/updated/deleted schedules
      // Trigger notifications based on change type
    },
    throttleMs: 1000, // Batch changes within 1 second
  });
}
```

### Backend Requirements
**Endpoint needed:** `POST /api/users/:userId/push-token`
- Stores push token in Clerk user metadata
- No MongoDB collection needed (uses Clerk)

---

## Feature 2: Weekly Schedule View

### Overview
7-day horizontal scrollable schedule view with time slots and color-coded jobs.

### What Users Get
- Week view with Mon-Sun columns
- Hourly time slots (6 AM - 10 PM)
- Color-coded schedule cards
- Previous/Next week navigation
- "Today" quick jump button
- Syncs with existing month/day views

### Implementation Steps

#### Step 2.1: Install Calendar Package (Future Use)
```bash
npx expo install expo-calendar
```

**Note:** Installing now for future calendar export feature, but not implementing export yet.

#### Step 2.2: Create WeekView Component
**File:** `components/schedule/WeekView.tsx`

```typescript
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { Schedule } from '@/types';

interface WeekViewProps {
  schedules: Schedule[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onSchedulePress: (schedule: Schedule) => void;
}

const TIME_SLOTS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM to 10 PM

export function WeekView({ schedules, selectedDate, onDateSelect, onSchedulePress }: WeekViewProps) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 }); // Sunday
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <View style={styles.container}>
      {/* Week Header */}
      <View style={styles.header}>
        <View style={styles.timeColumn} />
        {weekDays.map((day) => (
          <Pressable
            key={day.toISOString()}
            style={[
              styles.dayHeader,
              isToday(day) && styles.todayHeader,
              isSameDay(day, selectedDate) && styles.selectedHeader,
            ]}
            onPress={() => onDateSelect(day)}
          >
            <Text style={styles.dayName}>{format(day, 'EEE')}</Text>
            <Text style={[styles.dayNumber, isToday(day) && styles.todayNumber]}>
              {format(day, 'd')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Time Grid */}
      <ScrollView>
        {TIME_SLOTS.map((hour) => (
          <View key={hour} style={styles.timeRow}>
            <View style={styles.timeColumn}>
              <Text style={styles.timeLabel}>{format(new Date().setHours(hour, 0), 'ha')}</Text>
            </View>
            {weekDays.map((day) => {
              const daySchedules = schedules.filter((s) => {
                const scheduleDate = new Date(s.startDateTime);
                return isSameDay(scheduleDate, day) && scheduleDate.getHours() === hour;
              });

              return (
                <View key={day.toISOString()} style={styles.timeSlot}>
                  {daySchedules.map((schedule) => (
                    <Pressable
                      key={schedule.id}
                      style={[styles.scheduleCard, { backgroundColor: getJobColor(schedule) }]}
                      onPress={() => onSchedulePress(schedule)}
                    >
                      <Text style={styles.scheduleTitle} numberOfLines={2}>
                        {schedule.jobTitle}
                      </Text>
                      <Text style={styles.scheduleLocation} numberOfLines={1}>
                        {schedule.location}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function getJobColor(schedule: Schedule): string {
  if (schedule.confirmed) return '#10b981'; // green
  if (schedule.deadRun) return '#ef4444'; // red
  return '#3b82f6'; // blue
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  timeColumn: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  todayHeader: {
    backgroundColor: '#dbeafe',
  },
  selectedHeader: {
    backgroundColor: '#1a73e8',
  },
  dayName: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  todayNumber: {
    color: '#1a73e8',
  },
  timeRow: {
    flexDirection: 'row',
    height: 80,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  timeLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  timeSlot: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: '#f3f4f6',
    padding: 4,
  },
  scheduleCard: {
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  scheduleTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  scheduleLocation: {
    fontSize: 10,
    color: '#ffffff',
    opacity: 0.9,
    marginTop: 2,
  },
});
```

#### Step 2.3: Add Tab Navigation to ScheduleView
**File:** `components/schedule/ScheduleView.tsx`

Update to add tab switcher:

```typescript
type ViewMode = 'month' | 'week' | 'day';

const [viewMode, setViewMode] = useState<ViewMode>('month');

// Add tab bar before existing views:
<View style={styles.tabBar}>
  <Pressable
    style={[styles.tab, viewMode === 'month' && styles.activeTab]}
    onPress={() => setViewMode('month')}
  >
    <Text style={[styles.tabText, viewMode === 'month' && styles.activeTabText]}>Month</Text>
  </Pressable>
  <Pressable
    style={[styles.tab, viewMode === 'week' && styles.activeTab]}
    onPress={() => setViewMode('week')}
  >
    <Text style={[styles.tabText, viewMode === 'week' && styles.activeTabText]}>Week</Text>
  </Pressable>
  <Pressable
    style={[styles.tab, viewMode === 'day' && styles.activeTab]}
    onPress={() => setViewMode('day')}
  >
    <Text style={[styles.tabText, viewMode === 'day' && styles.activeTabText]}>Day</Text>
  </Pressable>
</View>

{/* Conditional rendering based on viewMode */}
{viewMode === 'month' && <MonthView {...monthViewProps} />}
{viewMode === 'week' && <WeekView {...weekViewProps} />}
{viewMode === 'day' && <DailyAgenda {...dayAgendaProps} />}
```

#### Step 2.4: Week Navigation Controls
Add to WeekView header:

```typescript
<View style={styles.navigationBar}>
  <Pressable onPress={goToPreviousWeek} style={styles.navButton}>
    <Text style={styles.navButtonText}>← Previous</Text>
  </Pressable>

  <Text style={styles.weekRange}>
    {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
  </Text>

  <Pressable onPress={goToToday} style={styles.navButton}>
    <Text style={styles.navButtonText}>Today</Text>
  </Pressable>

  <Pressable onPress={goToNextWeek} style={styles.navButton}>
    <Text style={styles.navButtonText}>Next →</Text>
  </Pressable>
</View>
```

### No Backend Changes Required
Uses existing `schedules` table and PowerSync queries.

---

## Feature 3: Weather Integration

### Overview
Real-time weather data integrated into schedule views with alerts for adverse conditions.

### What Users Get
- Weather icons and temperatures on calendar days
- Hourly forecast in week view
- Weather alerts for scheduled jobs
- Offline caching (6-hour refresh)
- Temperature, precipitation, wind speed

### Implementation Steps

#### Step 3.1: Sign Up for WeatherAPI.com
1. Create account at https://www.weatherapi.com/
2. Get free API key (1 million calls/month)
3. Add to `.env`:

```env
EXPO_PUBLIC_WEATHER_API_KEY=your_weatherapi_key_here
```

#### Step 3.2: Create Weather Service
**File:** `services/weather/WeatherService.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WeatherData {
  date: string;
  temp_c: number;
  condition: {
    text: string;
    icon: string;
    code: number;
  };
  chance_of_rain: number;
  wind_kph: number;
}

export interface HourlyWeather {
  time: string;
  temp_c: number;
  condition: { text: string; icon: string };
  chance_of_rain: number;
}

const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_KEY_PREFIX = '@weather_cache_';

export class WeatherService {
  private static apiKey = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
  private static baseUrl = 'https://api.weatherapi.com/v1';

  /**
   * Fetch 7-day weather forecast for location
   */
  static async getForecast(latitude: number, longitude: number): Promise<WeatherData[]> {
    const cacheKey = `${CACHE_KEY_PREFIX}${latitude}_${longitude}`;

    // Check cache first
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(
        `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${latitude},${longitude}&days=7&aqi=no`
      );

      if (!response.ok) throw new Error('Weather API request failed');

      const data = await response.json();
      const forecast = data.forecast.forecastday.map((day: any) => ({
        date: day.date,
        temp_c: day.day.avgtemp_c,
        condition: day.day.condition,
        chance_of_rain: day.day.daily_chance_of_rain,
        wind_kph: day.day.maxwind_kph,
      }));

      // Cache for 6 hours
      await this.setCached(cacheKey, forecast);
      return forecast;
    } catch (error) {
      console.error('Error fetching weather:', error);
      return [];
    }
  }

  /**
   * Get hourly forecast for specific day
   */
  static async getHourlyForecast(
    latitude: number,
    longitude: number,
    date: string
  ): Promise<HourlyWeather[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${latitude},${longitude}&dt=${date}&aqi=no`
      );

      if (!response.ok) throw new Error('Weather API request failed');

      const data = await response.json();
      return data.forecast.forecastday[0].hour.map((hour: any) => ({
        time: hour.time,
        temp_c: hour.temp_c,
        condition: hour.condition,
        chance_of_rain: hour.chance_of_rain,
      }));
    } catch (error) {
      console.error('Error fetching hourly weather:', error);
      return [];
    }
  }

  /**
   * Check for severe weather conditions
   */
  static isSevereWeather(weather: WeatherData): boolean {
    return (
      weather.temp_c < 0 || // Freezing
      weather.temp_c > 35 || // Extreme heat
      weather.chance_of_rain > 80 || // Heavy rain likely
      weather.wind_kph > 50 || // Strong winds
      weather.condition.text.toLowerCase().includes('storm') ||
      weather.condition.text.toLowerCase().includes('snow')
    );
  }

  private static async getCached(key: string): Promise<any | null> {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;

      if (age > CACHE_DURATION_MS) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  private static async setCached(key: string, data: any): Promise<void> {
    try {
      await AsyncStorage.setItem(
        key,
        JSON.stringify({ data, timestamp: Date.now() })
      );
    } catch (error) {
      console.error('Error caching weather data:', error);
    }
  }
}
```

#### Step 3.3: Create Geocoding Service
**File:** `services/weather/GeocodingService.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Coordinates {
  latitude: number;
  longitude: number;
}

const GEOCODE_CACHE_KEY = '@geocode_cache_';

export class GeocodingService {
  /**
   * Convert address to coordinates using WeatherAPI.com's search
   */
  static async getCoordinates(address: string): Promise<Coordinates | null> {
    const cacheKey = `${GEOCODE_CACHE_KEY}${address}`;

    // Check cache (geocodes rarely change)
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const apiKey = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
      const response = await fetch(
        `https://api.weatherapi.com/v1/search.json?key=${apiKey}&q=${encodeURIComponent(address)}`
      );

      if (!response.ok) throw new Error('Geocoding failed');

      const results = await response.json();
      if (results.length === 0) return null;

      const coords = {
        latitude: results[0].lat,
        longitude: results[0].lon,
      };

      // Cache permanently (addresses don't move)
      await this.setCached(cacheKey, coords);
      return coords;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  private static async getCached(key: string): Promise<Coordinates | null> {
    try {
      const cached = await AsyncStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private static async setCached(key: string, coords: Coordinates): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(coords));
    } catch (error) {
      console.error('Error caching coordinates:', error);
    }
  }
}
```

#### Step 3.4: Integrate into MonthView
**File:** `components/schedule/MonthView.tsx`

Add weather data fetching:

```typescript
import { WeatherService } from '@/services/weather/WeatherService';
import { GeocodingService } from '@/services/weather/GeocodingService';

const [weatherData, setWeatherData] = useState<Map<string, WeatherData>>(new Map());

useEffect(() => {
  loadWeatherForSchedules();
}, [schedules]);

async function loadWeatherForSchedules() {
  const locationSet = new Set(schedules.map(s => s.location));
  const weatherMap = new Map();

  for (const location of locationSet) {
    const coords = await GeocodingService.getCoordinates(location);
    if (!coords) continue;

    const forecast = await WeatherService.getForecast(coords.latitude, coords.longitude);
    forecast.forEach(day => {
      weatherMap.set(`${location}_${day.date}`, day);
    });
  }

  setWeatherData(weatherMap);
}

// In day cell rendering:
const weather = weatherData.get(`${schedule.location}_${dateStr}`);
{weather && (
  <View style={styles.weatherIndicator}>
    <Image source={{ uri: `https:${weather.condition.icon}` }} style={styles.weatherIcon} />
    <Text style={styles.weatherTemp}>{Math.round(weather.temp_c)}°</Text>
  </View>
)}
```

#### Step 3.5: Add Weather Alerts to DailyAgenda
**File:** `components/schedule/DailyAgenda.tsx`

```typescript
const severeWeatherJobs = schedules.filter(schedule => {
  const weather = getWeatherForSchedule(schedule);
  return weather && WeatherService.isSevereWeather(weather);
});

{severeWeatherJobs.length > 0 && (
  <View style={styles.weatherAlert}>
    <Text style={styles.alertIcon}>⚠️</Text>
    <Text style={styles.alertText}>
      Severe weather expected for {severeWeatherJobs.length} job(s) today
    </Text>
  </View>
)}
```

### Environment Variables Required
```env
EXPO_PUBLIC_WEATHER_API_KEY=your_weatherapi_key_here
```

### No Backend Changes Required
All API calls from client to WeatherAPI.com directly.

---

## Feature 4: Live Technician Tracking

### Overview
Real-time location tracking for technicians while on active jobs, with map view for managers.

### What Users Get
- **Technicians:** Location tracked only during active jobs
- **Managers:** Live map showing all active technicians
- Real-time updates via PowerSync
- Privacy-focused (auto-clears after job completion)
- Offline support (syncs when back online)

### Implementation Steps

#### Step 4.1: Install Dependencies
```bash
npx expo install expo-location react-native-maps
```

**Required Packages:**
- `expo-location`: Location tracking and background updates
- `react-native-maps`: Google Maps integration for iOS and Android

#### Step 4.2: Setup Google Maps API Keys

**IMPORTANT:** Google Maps requires API keys for both iOS and Android. Follow these steps carefully.

##### For Android:

1. **Create Google Cloud Project:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Name it (e.g., "VHD-App-Maps")

2. **Enable Required APIs:**
   - Go to "APIs & Services" → "Library"
   - Search for and enable:
     - **Maps SDK for Android**
     - **Maps SDK for iOS** (if using iOS)
   - Click "Enable" for each API

3. **Create API Key for Android:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the API key (save it securely)
   - Click "Edit API key" to restrict it

4. **Restrict Android API Key:**
   - Under "Application restrictions":
     - Select "Android apps"
     - Click "Add an item"
   - **Package name:** Enter your Android package from `app.json`
     - Example: `com.vhd.app` (found in `app.json` under `android.package`)
   - **SHA-1 certificate fingerprint:**
     - For development, get your debug keystore SHA-1:
       ```bash
       # On Windows:
       keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android

       # On Mac/Linux:
       keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
       ```
     - Copy the SHA-1 fingerprint (format: `AA:BB:CC:...`)
     - For production, use your release keystore SHA-1
   - Under "API restrictions":
     - Select "Restrict key"
     - Check "Maps SDK for Android"
   - Click "Save"

5. **Add to app.json:**
   ```json
   {
     "expo": {
       "android": {
         "config": {
           "googleMaps": {
             "apiKey": "YOUR_ANDROID_API_KEY_HERE"
           }
         }
       }
     }
   }
   ```

##### For iOS:

1. **Enable Maps SDK for iOS:**
   - In Google Cloud Console, go to "APIs & Services" → "Library"
   - Search for "Maps SDK for iOS"
   - Click "Enable"

2. **Create API Key for iOS:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the API key
   - Click "Edit API key"

3. **Restrict iOS API Key:**
   - Under "Application restrictions":
     - Select "iOS apps"
     - Click "Add an item"
   - **Bundle ID:** Enter your iOS bundle identifier from `app.json`
     - Example: `com.vhd.app` (found in `app.json` under `ios.bundleIdentifier`)
   - Under "API restrictions":
     - Select "Restrict key"
     - Check "Maps SDK for iOS"
   - Click "Save"

4. **Add to app.json:**
   ```json
   {
     "expo": {
       "ios": {
         "config": {
           "googleMapsApiKey": "YOUR_IOS_API_KEY_HERE"
         }
       }
     }
   }
   ```

##### Alternative: Using Plugin Configuration (Recommended)

For Expo SDK 53+, you can use the react-native-maps plugin:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-maps",
        {
          "androidGoogleMapsApiKey": "YOUR_ANDROID_KEY",
          "iosGoogleMapsApiKey": "YOUR_IOS_KEY"
        }
      ]
    ]
  }
}
```

**Security Note:** For production, consider using environment variables:

1. Add to `.env`:
   ```env
   EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=your_android_key
   EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=your_ios_key
   ```

2. In `app.config.js` (rename from `app.json`):
   ```javascript
   export default {
     expo: {
       plugins: [
         [
           'react-native-maps',
           {
             androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
             iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
           },
         ],
       ],
     },
   };
   ```

#### Step 4.3: Update app.json for Location Permissions
Add to existing `app.json`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "VHD needs your location to track job sites and provide navigation",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "VHD needs background location to track your location during active jobs",
        "UIBackgroundModes": ["location"]
      }
    },
    "android": {
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION"
      ]
    },
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "VHD tracks your location during active jobs to help managers coordinate schedules.",
          "locationWhenInUsePermission": "VHD needs your location to track job sites."
        }
      ]
    ]
  }
}
```

#### Step 4.3: MongoDB Collection Setup

**Collection Name:** `technician_locations`

**Schema:**
```json
{
  "_id": "uuid",
  "technicianId": "user_xxx",
  "latitude": 49.2827,
  "longitude": -123.1207,
  "timestamp": "2025-01-20T10:30:00Z",
  "isActive": true,
  "currentJobId": "schedule_xxx",
  "accuracy": 10.5
}
```

**Indexes:**
- `{ technicianId: 1, timestamp: -1 }`
- `{ isActive: 1 }`
- `{ currentJobId: 1 }`

**MongoDB Setup Steps:**
1. Open MongoDB Atlas → Database → Collections
2. Create new collection: `technician_locations`
3. Add indexes via MongoDB Compass or Atlas UI
4. Go to PowerSync Dashboard → Sync Rules
5. Add sync rule for `technician_locations`:
   ```yaml
   bucket_definitions:
     user_data:
       data:
         - SELECT * FROM technician_locations WHERE isActive = 1
   ```

#### Step 4.4: Update PowerSync Schema
**File:** `services/database/schema.ts`

Add new table:

```typescript
const technician_locations = new Table({
  technicianId: column.text,
  latitude: column.real,
  longitude: column.real,
  timestamp: column.text,
  isActive: column.integer, // SQLite doesn't have boolean
  currentJobId: column.text,
  accuracy: column.real,
}, { indexes: {
  technician: ['technicianId'],
  active: ['isActive'],
} });

// Update AppSchema to include new table:
export const AppSchema = new Schema({
  schedules,
  invoices,
  payrollperiods,
  delete_photo_operations,
  add_photo_operations,
  technician_locations, // ← Add this
});
```

#### Step 4.5: Create Location Tracking Service
**File:** `services/location/LocationTracker.ts`

```typescript
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { PowerSyncDatabase } from '@powersync/react-native';
import { v4 as uuidv4 } from 'uuid';

const LOCATION_TASK_NAME = 'background-location-task';

export class LocationTracker {
  private static isTracking = false;
  private static currentJobId: string | null = null;

  /**
   * Request location permissions
   */
  static async requestPermissions(): Promise<boolean> {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('Foreground location permission denied');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('Background location permission denied');
      return false;
    }

    return true;
  }

  /**
   * Start tracking location when job starts
   */
  static async startTracking(jobId: string, technicianId: string, db: PowerSyncDatabase): Promise<void> {
    if (this.isTracking) {
      console.log('Location tracking already active');
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permissions not granted');
    }

    this.currentJobId = jobId;
    this.isTracking = true;

    // Define background task
    TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
      if (error) {
        console.error('Location task error:', error);
        return;
      }

      if (data) {
        const { locations } = data;
        const location = locations[0];

        // Update location in PowerSync
        await db.execute(
          `INSERT INTO technician_locations (id, technicianId, latitude, longitude, timestamp, isActive, currentJobId, accuracy)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            technicianId,
            location.coords.latitude,
            location.coords.longitude,
            new Date().toISOString(),
            1,
            jobId,
            location.coords.accuracy,
          ]
        );
      }
    });

    // Start background location updates
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5 * 60 * 1000, // 5 minutes (see analysis below)
      distanceInterval: 100, // Or 100 meters moved
      foregroundService: {
        notificationTitle: 'VHD - Tracking Active Job',
        notificationBody: 'Location tracking enabled for current job',
        notificationColor: '#1a73e8',
      },
    });

    console.log(`Location tracking started for job ${jobId}`);
  }

  /**
   * Stop tracking and clear location data
   */
  static async stopTracking(technicianId: string, db: PowerSyncDatabase): Promise<void> {
    if (!this.isTracking) return;

    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);

    // Mark all locations as inactive
    await db.execute(
      `UPDATE technician_locations
       SET isActive = 0
       WHERE technicianId = ? AND isActive = 1`,
      [technicianId]
    );

    this.isTracking = false;
    this.currentJobId = null;

    console.log('Location tracking stopped');
  }

  /**
   * Get current tracking status
   */
  static getTrackingStatus(): { isTracking: boolean; jobId: string | null } {
    return {
      isTracking: this.isTracking,
      jobId: this.currentJobId,
    };
  }
}
```

#### Step 4.6: Create Technician Map Modal
**File:** `components/location/TechnicianMapModal.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useQuery } from '@powersync/react-native';

interface TechnicianLocation {
  id: string;
  technicianId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  currentJobId: string;
}

interface TechnicianMapModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TechnicianMapModal({ visible, onClose }: TechnicianMapModalProps) {
  const { data: locations = [] } = useQuery<TechnicianLocation>(
    `SELECT * FROM technician_locations WHERE isActive = 1 ORDER BY timestamp DESC`
  );

  // Get unique technicians (latest location only)
  const uniqueLocations = locations.reduce((acc, loc) => {
    if (!acc.has(loc.technicianId)) {
      acc.set(loc.technicianId, loc);
    }
    return acc;
  }, new Map<string, TechnicianLocation>());

  const markers = Array.from(uniqueLocations.values());

  // Calculate map region to fit all markers
  const region = markers.length > 0 ? {
    latitude: markers.reduce((sum, m) => sum + m.latitude, 0) / markers.length,
    longitude: markers.reduce((sum, m) => sum + m.longitude, 0) / markers.length,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  } : {
    latitude: 49.2827,
    longitude: -123.1207,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Live Technician Locations</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>

        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton
        >
          {markers.map((location) => (
            <Marker
              key={location.id}
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              title={`Technician ${location.technicianId}`}
              description={`Job: ${location.currentJobId}\nUpdated: ${new Date(location.timestamp).toLocaleTimeString()}`}
              pinColor="#1a73e8"
            />
          ))}
        </MapView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {markers.length} technician{markers.length !== 1 ? 's' : ''} on active jobs
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#1a73e8',
    fontSize: 16,
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
```

#### Step 4.7: Add Map Button to Schedule Screen
**File:** `app/(tabs)/schedule.tsx`

Add floating action button (managers only):

```typescript
import { TechnicianMapModal } from '@/components/location/TechnicianMapModal';

const [mapModalVisible, setMapModalVisible] = useState(false);

// Add after existing UI:
{isManager && (
  <>
    <Pressable
      style={styles.mapButton}
      onPress={() => setMapModalVisible(true)}
    >
      <Text style={styles.mapButtonText}>📍</Text>
      <Text style={styles.mapButtonLabel}>Live Map</Text>
    </Pressable>

    <TechnicianMapModal
      visible={mapModalVisible}
      onClose={() => setMapModalVisible(false)}
    />
  </>
)}

const styles = StyleSheet.create({
  mapButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#1a73e8',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  mapButtonText: {
    fontSize: 24,
  },
  mapButtonLabel: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600',
    marginTop: 2,
  },
});
```

#### Step 4.8: Integrate with Job Start/End
**File:** `components/schedule/DailyAgenda.tsx`

Add location tracking to job controls:

```typescript
import { LocationTracker } from '@/services/location/LocationTracker';
import { useSystem } from '@/services/database/System';

async function handleStartJob(schedule: Schedule) {
  const { powersync } = useSystem();
  const userId = user?.id;

  if (!userId) return;

  try {
    await LocationTracker.startTracking(schedule.id, userId, powersync);
    // ... existing job start logic
  } catch (error) {
    Alert.alert('Location Error', 'Could not start location tracking. Please check permissions.');
  }
}

async function handleCompleteJob(schedule: Schedule) {
  const { powersync } = useSystem();
  const userId = user?.id;

  if (!userId) return;

  await LocationTracker.stopTracking(userId, powersync);
  // ... existing job completion logic
}
```

#### Step 4.9: Add Tracking Status to Profile
**File:** `app/(tabs)/profile.tsx`

Show current tracking status:

```typescript
import { LocationTracker } from '@/services/location/LocationTracker';

const trackingStatus = LocationTracker.getTrackingStatus();

// Add to profile UI:
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Location Tracking</Text>
  <View style={styles.trackingStatus}>
    <Text style={styles.trackingLabel}>Status:</Text>
    <Text style={[styles.trackingValue, trackingStatus.isTracking && styles.trackingActive]}>
      {trackingStatus.isTracking ? '🟢 Active' : '⚫ Inactive'}
    </Text>
  </View>
  {trackingStatus.isTracking && (
    <Text style={styles.trackingJobId}>
      Job: {trackingStatus.jobId}
    </Text>
  )}
  <Text style={styles.privacyNote}>
    Your location is only tracked during active jobs and automatically cleared when you complete a job.
  </Text>
</View>
```

### Backend Requirements

**MongoDB Collection:** `technician_locations`
- Create in MongoDB Atlas
- Add to PowerSync sync rules
- No backend API endpoint needed (PowerSync handles sync)

**PowerSync Sync Rule:**
```yaml
bucket_definitions:
  user_data:
    data:
      - SELECT * FROM technician_locations WHERE isActive = 1
```

---

## Location Update Interval Analysis

### Industry Standards & Recommendations

#### Common Update Intervals in Production Apps

| App Type | Update Interval | Rationale |
|----------|----------------|-----------|
| **Uber/Lyft (Driver)** | 4-5 seconds | Real-time passenger tracking, critical for ETA |
| **Uber/Lyft (Rider)** | 10-15 seconds | Less critical, reduces server load |
| **Delivery (DoorDash, UberEats)** | 10-30 seconds | Balance between ETA accuracy and battery |
| **Fleet Management** | 1-5 minutes | Route optimization, not time-critical |
| **Field Service (HVAC/Plumbing)** | 5-10 minutes | Manager awareness, battery-conscious |
| **Fitness Tracking (Strava)** | 1-5 seconds | High precision for route mapping |

---

### Recommended Interval for VHD-App: **5 Minutes**

**Reasoning:**
1. **Use Case:** Managers need awareness of technician locations, not real-time tracking
2. **Battery Impact:** 5 min provides good balance between updates and battery drain
3. **Network Efficiency:** Reduces PowerSync sync operations and data usage
4. **User Acceptance:** Technicians less likely to feel "micromanaged"

---

### Pros/Cons of Various Intervals

#### 1 Minute Updates
**Pros:**
- Near real-time location updates
- Quickly detect if technician is off-route
- Better ETA calculations

**Cons:**
- ❌ **Heavy battery drain** (can reduce battery life by 20-30%)
- ❌ Increased network data usage
- ❌ More PowerSync sync operations (higher server load)
- ❌ May feel invasive to technicians

**Best For:** Emergency response, high-value asset tracking

---

#### 5 Minutes Updates (RECOMMENDED)
**Pros:**
- ✅ **Balanced battery impact** (~5-10% extra drain)
- ✅ Sufficient for manager awareness
- ✅ Reasonable network usage
- ✅ Less invasive feeling for technicians
- ✅ Works well for 2-4 hour job durations

**Cons:**
- Location may be slightly outdated (up to 5 min old)
- Won't detect quick stops/diversions

**Best For:** Field service, HVAC, plumbing, delivery (non-food)

---

#### 10 Minutes Updates
**Pros:**
- ✅ Minimal battery impact (~3-5% extra drain)
- ✅ Very low network usage
- ✅ Technicians barely notice tracking

**Cons:**
- Location data can be stale
- May miss important route changes
- Less useful for real-time coordination

**Best For:** Long jobs (4+ hours), route logging only

---

#### 15+ Minutes Updates
**Pros:**
- ✅ Negligible battery impact
- ✅ Minimal data usage

**Cons:**
- ❌ **Too infrequent** for practical use
- ❌ Manager can't coordinate effectively
- ❌ Defeats purpose of "live" tracking

**Best For:** Historical route logging, compliance tracking

---

### Additional Optimization: Distance-Based Updates

**Recommendation:** Combine time + distance triggers

```typescript
await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 5 * 60 * 1000, // 5 minutes
  distanceInterval: 200, // OR 200 meters moved
});
```

**Benefits:**
- Updates more frequently when technician is moving (driving between jobs)
- Updates less frequently when stationary (working on-site)
- **Best of both worlds:** battery efficiency + useful data

---

### Battery Impact Comparison

| Interval | Battery Drain | Daily Impact (8hr shift) |
|----------|---------------|-------------------------|
| 1 minute | High | -20% to -30% |
| 2 minutes | Medium-High | -15% to -20% |
| **5 minutes** | **Medium** | **-8% to -12%** |
| 10 minutes | Low | -5% to -8% |
| 15 minutes | Very Low | -3% to -5% |

*Assumes GPS accuracy: Balanced, Background mode, iOS/Android*

---

### Implementation Recommendation

Use **5 minutes + 200 meters** hybrid approach:

```typescript
{
  accuracy: Location.Accuracy.Balanced, // Not High (saves battery)
  timeInterval: 5 * 60 * 1000, // 5 minutes
  distanceInterval: 200, // 200 meters
  pausesUpdatesAutomatically: true, // iOS stops updates when stationary
  activityType: Location.ActivityType.AutomotiveNavigation, // Optimizes for driving
}
```

**Result:**
- Updates every 5 min OR when technician moves 200m (whichever comes first)
- Pauses when device is stationary (battery savings)
- ~8-10% battery drain over 8-hour shift
- Manager sees fresh data without excessive updates

---

### User Control Option (Future Enhancement)

Add setting in Profile for managers to adjust:
- **Low Power:** 10 min / 500m
- **Balanced:** 5 min / 200m (default)
- **Frequent:** 2 min / 100m

---

## Implementation Timeline

### Estimated Time per Feature

| Feature | Estimated Time | Complexity |
|---------|---------------|------------|
| **Push Notifications** | 4-5 hours | Medium-High |
| - Package setup & permissions | 1 hour | |
| - Notification service | 1.5 hours | |
| - Profile settings UI | 1 hour | |
| - PowerSync listeners | 1.5 hours | |
| **Weekly Schedule View** | 3-4 hours | Medium |
| - WeekView component | 2 hours | |
| - Tab navigation | 1 hour | |
| - Polish & responsive | 1 hour | |
| **Weather Integration** | 2-3 hours | Low-Medium |
| - Weather service & caching | 1 hour | |
| - UI integration | 1 hour | |
| - Alerts & geocoding | 1 hour | |
| **Live Technician Tracking** | 5-6 hours | High |
| - Location permissions & tracking | 1.5 hours | |
| - Map modal component | 2 hours | |
| - PowerSync schema & sync | 1 hour | |
| - UI integration & testing | 1.5 hours | |

**Total Estimated Time:** 14-18 hours

---

### Recommended Implementation Order

#### Phase 1: Standalone Features (No Dependencies)
1. **Weekly Schedule View** (3-4 hours)
   - Immediate user value
   - No external APIs or permissions
   - Uses existing PowerSync data
   - Can test thoroughly before proceeding

2. **Weather Integration** (2-3 hours)
   - Enhances week view immediately
   - Simple API integration
   - Independent of other features
   - Low risk

#### Phase 2: Complex Features (Requires Setup)
3. **Live Technician Tracking** (5-6 hours)
   - Requires MongoDB setup first
   - Needs thorough permission testing
   - High user value for managers
   - Build on existing PowerSync infrastructure

4. **Push Notifications** (4-5 hours)
   - Most complex implementation
   - Requires backend endpoint for push tokens
   - Depends on PowerSync listeners working correctly
   - Build last to leverage knowledge from previous features

---

## Testing Strategy

### Unit Testing
- Weather service caching logic
- Notification preference storage
- Location tracking state management
- Date utilities for week view

### Integration Testing
- PowerSync sync for location data
- Weather API calls with mock responses
- Notification triggering from schedule changes
- Location updates during active jobs

### User Acceptance Testing

#### Push Notifications
- [ ] Notifications appear for new assignments
- [ ] Notifications respect user preferences
- [ ] 30-min reminders fire at correct time
- [ ] Notifications work in foreground/background
- [ ] No notifications when all toggles OFF

#### Weekly Schedule View
- [ ] Week view displays correct 7 days
- [ ] Jobs appear in correct time slots
- [ ] Switching tabs maintains selected date
- [ ] Navigation arrows work correctly
- [ ] Today button jumps to current week

#### Weather Integration
- [ ] Weather icons appear on calendar days
- [ ] Hourly forecast shows in week view
- [ ] Weather alerts display for severe conditions
- [ ] Cached weather loads offline
- [ ] Geocoding caches addresses correctly

#### Live Technician Tracking
- [ ] Location permissions requested correctly
- [ ] Tracking starts when job starts
- [ ] Location updates every 5 minutes
- [ ] Manager sees live markers on map
- [ ] Tracking stops when job completes
- [ ] Locations clear after job ends
- [ ] Offline locations sync when back online

---

## Environment Variables Summary

Add to `.env` file:

```env
# Existing variables
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_POWERSYNC_URL=https://679ff7c36bc62bf1f163ab46.powersync.journeyapps.com
EXPO_PUBLIC_API_URL=https://vhd-psi.vercel.app
CLOUDINARY_URL=cloudinary://...
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=...
EXPO_PUBLIC_CLOUDINARY_API_KEY=...

# New variables for features
EXPO_PUBLIC_WEATHER_API_KEY=your_weatherapi_key_here
EXPO_PUBLIC_EXPO_PROJECT_ID=your_expo_project_id # For push notifications
```

---

## Database Schema Summary

### New PowerSync Table: `technician_locations`

```typescript
const technician_locations = new Table({
  technicianId: column.text,
  latitude: column.real,
  longitude: column.real,
  timestamp: column.text,
  isActive: column.integer,
  currentJobId: column.text,
  accuracy: column.real,
}, {
  indexes: {
    technician: ['technicianId'],
    active: ['isActive'],
  }
});
```

**MongoDB Equivalent:**
```json
{
  "_id": "uuid",
  "technicianId": "user_123",
  "latitude": 49.2827,
  "longitude": -123.1207,
  "timestamp": "2025-01-20T10:30:00Z",
  "isActive": true,
  "currentJobId": "schedule_456",
  "accuracy": 10.5
}
```

---

## Backend API Requirements

### Endpoint 1: Store Push Token (Feature 1)
**Endpoint:** `POST /api/users/:userId/push-token`

**Request Body:**
```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Response:**
```json
{
  "success": true
}
```

**Implementation Notes:**
- Store in Clerk user `publicMetadata` or `privateMetadata`
- Use Clerk Admin API: `clerkClient.users.updateUserMetadata(userId, { publicMetadata: { pushToken } })`

### No Other Backend Endpoints Needed
All other features use:
- Client-side APIs (WeatherAPI.com)
- PowerSync sync (location tracking)
- Local storage (preferences, caching)

---

## File Structure Summary

```
VHD-App/
├── app/
│   └── (tabs)/
│       ├── schedule.tsx (add map button, tracking integration)
│       └── profile.tsx (add notification settings, tracking status)
│
├── components/
│   ├── schedule/
│   │   ├── WeekView.tsx (NEW - weekly schedule grid)
│   │   ├── ScheduleView.tsx (UPDATE - add tab navigation)
│   │   ├── MonthView.tsx (UPDATE - add weather indicators)
│   │   └── DailyAgenda.tsx (UPDATE - add weather alerts, tracking)
│   └── location/
│       └── TechnicianMapModal.tsx (NEW - live map view)
│
├── services/
│   ├── database/
│   │   └── schema.ts (UPDATE - add technician_locations table)
│   ├── notifications/
│   │   ├── NotificationService.ts (NEW)
│   │   ├── preferences.ts (NEW)
│   │   └── scheduleListeners.ts (NEW)
│   ├── weather/
│   │   ├── WeatherService.ts (NEW)
│   │   └── GeocodingService.ts (NEW)
│   └── location/
│       └── LocationTracker.ts (NEW)
│
└── .env (UPDATE - add EXPO_PUBLIC_WEATHER_API_KEY)
```

---

## Key Advantages of This Architecture

✅ **No Complex Backend Changes:** All features use PowerSync, Clerk, or client-side APIs
✅ **Offline-First:** Weather caching, local preferences, PowerSync sync queue
✅ **Privacy-Focused:** Location tracking only during active jobs, auto-clears
✅ **Scalable:** PowerSync handles real-time sync, no custom WebSocket infrastructure
✅ **Battery-Efficient:** 5-min location updates with distance triggers
✅ **User Control:** Granular notification preferences, transparent tracking status

---

## Next Steps

1. **Review this plan** and confirm approach
2. **Set up external accounts:**
   - WeatherAPI.com API key
   - MongoDB collection `technician_locations`
   - PowerSync sync rule update
3. **Implement in recommended order:**
   - Phase 1: Weekly Schedule View → Weather Integration
   - Phase 2: Live Tracking → Push Notifications
4. **Test thoroughly** with physical devices (especially location tracking)
5. **Build with EAS** for production testing (push notifications require EAS build)

---

## Projected Costs & API Limits

### 1. Google Maps Platform (Feature 4: Live Tracking)

#### New Pricing Structure (March 1, 2025)

Google replaced the monthly $200 credit with **free monthly API call limits per SKU**:

| Service Tier | Free Calls per SKU | Overage Cost |
|-------------|-------------------|--------------|
| **Essentials** (Map Tiles) | 100,000/month | $2.00 per 1,000 calls |
| **Pro** (Dynamic Maps) | 5,000/month | $7.00 per 1,000 calls |

#### APIs Used by VHD-App:

1. **Maps SDK for Android** (Essentials tier)
   - **Free limit:** 100,000 map loads/month
   - **Overage:** $2.00 per 1,000 loads

2. **Maps SDK for iOS** (Essentials tier)
   - **Free limit:** 100,000 map loads/month
   - **Overage:** $2.00 per 1,000 loads

#### Usage Estimate for VHD-App:

**Assumptions:**
- 5 managers open the live map 10 times/day
- 22 working days/month
- Each map view = 1 map load

**Monthly Usage:**
```
5 managers × 10 views/day × 22 days = 1,100 map loads/month
```

**Cost Analysis:**
- **Free tier covers:** 100,000 loads/month
- **VHD-App usage:** 1,100 loads/month
- **Overage:** $0 (well within free tier)

**Annual Cost:** $0

#### Scaling Considerations:

Even with 100 managers viewing the map 20 times/day:
```
100 managers × 20 views/day × 22 days = 44,000 loads/month
Still within 100,000 free tier → $0 cost
```

**Conclusion:** Google Maps will be **FREE** for VHD-App unless you exceed 100,000 map loads/month.

---

### 2. WeatherAPI.com (Feature 3: Weather Integration)

#### Pricing Tiers (2025):

| Plan | Calls/Month | Features | Cost |
|------|------------|----------|------|
| **Free** | 1,000,000 | 3-day forecast, hourly data, search API | $0 |
| **Starter** | 5,000,000 | 3-day forecast, alerts | $4/month |
| **Pro** | 10,000,000 | 14-day forecast, marine data | $10/month |

**Note:** Free tier information is conflicting in recent sources. Latest data suggests WeatherAPI.com may have removed their free plan. **Verify at [weatherapi.com/pricing.aspx](https://www.weatherapi.com/pricing.aspx).**

#### Usage Estimate for VHD-App:

**API Calls per Feature:**
1. **7-day forecast:** 1 call per location
2. **Hourly forecast:** 1 call per day per location
3. **Geocoding (search):** 1 call per unique address (cached permanently)

**Assumptions:**
- 10 unique job locations per day
- Fetch forecast for each location once per day
- Weather cached for 6 hours (4 fetches/day max)
- Geocoding cached permanently (one-time per address)

**Daily Usage:**
```
10 locations × 1 forecast call = 10 calls/day (7-day forecast)
10 locations × 1 hourly call = 10 calls/day (hourly data)
5 new addresses × 1 geocoding call = 5 calls/day (search API)

Total: 25 calls/day
```

**Monthly Usage:**
```
25 calls/day × 30 days = 750 calls/month
```

**Cost Analysis:**

| Scenario | Monthly Calls | Plan Required | Cost |
|----------|--------------|---------------|------|
| **Current (10 locations/day)** | 750 | Free (if available) | $0 |
| **Growth (50 locations/day)** | 3,750 | Free or Starter | $0-$4 |
| **Large scale (100 locations/day)** | 7,500 | Starter or Pro | $4-$10 |

**Recommendation:**
- Start with **Free plan** (if available) or **Starter ($4/month)**
- With aggressive caching (6-hour), costs remain minimal
- Annual cost: **$0-$48**

---

### 3. Expo Push Notifications (Feature 1)

#### Expo Push Notification Service:

| Plan | Free Tier | Overage Cost |
|------|-----------|--------------|
| **Hobby/Free** | Unlimited | $0 |
| **Production** | Unlimited | $0 |

**Expo Push Notifications are FREE** for all plans. No usage limits.

**Cost:** $0/year

---

### 4. PowerSync (Database Sync)

#### Pricing (as of 2025):

PowerSync pricing is based on **monthly active users (MAU)** and **data transfer**.

| Tier | MAU | Storage | Data Transfer | Cost |
|------|-----|---------|---------------|------|
| **Free** | 50 MAU | 1 GB | 10 GB/month | $0 |
| **Starter** | 500 MAU | 10 GB | 100 GB/month | $50/month |
| **Pro** | 2,000 MAU | 50 GB | 500 GB/month | $200/month |

**VHD-App Usage:**

**Assumptions:**
- 5 managers + 10 technicians = 15 active users
- Location updates: 5 minutes × 8 hours = 96 updates/day/technician
- Each location update: ~200 bytes
- Schedule/invoice data: ~50 MB/month

**Data Transfer Calculation:**
```
Location tracking:
10 technicians × 96 updates/day × 22 days × 200 bytes = 4.2 MB/month

Schedule/invoice sync: 50 MB/month

Total: ~55 MB/month data transfer
```

**Cost Analysis:**
- **Free tier covers:** 10 GB/month transfer, 50 MAU
- **VHD-App usage:** 55 MB/month, 15 MAU
- **Current cost:** $0 (well within free tier)

**Scaling:**
- Up to 50 users with moderate usage: **FREE**
- 100 users: Likely need **Starter plan ($50/month)**

---

### 5. Cloudinary (Photo Storage)

**Current usage:** Already integrated in VHD-App

#### Pricing:

| Plan | Storage | Bandwidth | Transformations | Cost |
|------|---------|-----------|----------------|------|
| **Free** | 25 GB | 25 GB/month | 25,000/month | $0 |
| **Plus** | 250 GB | 250 GB/month | 250,000/month | $99/month |

**VHD-App Current:** Likely on **Free plan** ($0)

**No additional cost** from new features (weather icons use WeatherAPI CDN, not Cloudinary).

---

### 6. MongoDB Atlas (Database)

**Current usage:** Already integrated via PowerSync

#### Pricing:

| Tier | Storage | RAM | Cost |
|------|---------|-----|------|
| **M0 (Free)** | 512 MB | Shared | $0 |
| **M10 (Starter)** | 10 GB | 2 GB | $57/month |
| **M20 (Production)** | 20 GB | 4 GB | $114/month |

**New Collection:** `technician_locations`

**Storage Estimate:**
```
1 location record = ~100 bytes
10 technicians × 96 updates/day × 30 days = 28,800 records/month
28,800 × 100 bytes = 2.88 MB/month

Old records deleted weekly (auto-cleanup script)
Average storage: ~5 MB
```

**Cost Impact:**
- **Free tier (M0):** 512 MB storage → **No upgrade needed**
- **Current cost:** $0 (if already on free tier)

---

## Total Cost Summary

### Initial Setup Costs: $0

No upfront costs. All services have free tiers.

---

### Monthly Operating Costs (Current Scale: 15 users)

| Service | Feature | Monthly Cost | Annual Cost |
|---------|---------|--------------|-------------|
| **Google Maps** | Live tracking | $0 | $0 |
| **WeatherAPI.com** | Weather integration | $0-$4 | $0-$48 |
| **Expo Push** | Notifications | $0 | $0 |
| **PowerSync** | Database sync | $0 | $0 |
| **Cloudinary** | Photo storage | $0 | $0 |
| **MongoDB Atlas** | Database | $0 | $0 |
| **TOTAL** | All features | **$0-$4/month** | **$0-$48/year** |

---

### Scaling Costs (100 users, high usage)

| Service | Estimated Usage | Monthly Cost | Notes |
|---------|----------------|--------------|-------|
| **Google Maps** | 44,000 loads/month | $0 | Still within 100K free tier |
| **WeatherAPI.com** | 7,500 calls/month | $4-$10 | Starter or Pro plan |
| **PowerSync** | 100 MAU, 500 MB transfer | $50 | Starter plan |
| **MongoDB Atlas** | 5 GB storage | $57 | M10 tier |
| **TOTAL** | | **$111-$117/month** | **$1,332-$1,404/year** |

---

### Cost Optimization Strategies

1. **Weather API Caching:**
   - 6-hour cache reduces calls by 75%
   - Permanent geocoding cache eliminates repeat lookups
   - **Savings:** Stay on free tier longer

2. **Location Update Interval:**
   - 5-minute updates (recommended): 96 updates/day
   - 10-minute updates: 48 updates/day → 50% data reduction
   - **Savings:** Extends free tier, reduces PowerSync costs

3. **Data Retention:**
   - Delete location records older than 7 days
   - Archive old schedules/invoices to cold storage
   - **Savings:** Stay on MongoDB free tier

4. **Map Load Optimization:**
   - Cache map tiles locally
   - Limit map refresh rate
   - **Savings:** Reduce Google Maps API calls

---

### When to Upgrade:

| Metric | Free Tier Limit | Upgrade Trigger | Estimated Monthly Cost |
|--------|-----------------|-----------------|----------------------|
| **Active Users** | 50 | >50 users | PowerSync: $50 |
| **Weather Calls** | 1M (if available) | >750K calls | WeatherAPI: $4-$10 |
| **MongoDB Storage** | 512 MB | >500 MB | MongoDB M10: $57 |
| **Map Loads** | 100,000 | >100K loads | Google Maps: $2/1K |

---

### Cost Comparison: Build vs. Buy

#### Alternative Solutions:

| Solution | Monthly Cost | Features | Limitations |
|----------|-------------|----------|-------------|
| **VHD-App (this plan)** | $0-$4 | Full control, offline-first, custom | Requires development time |
| **Samsara** | $35/user | Fleet tracking, ELD, dashcam | Overkill for HVAC, no offline |
| **ServiceTitan** | $99/user | Full field service suite | Expensive, complex |
| **Housecall Pro** | $49/user | Scheduling, invoicing, GPS | Limited customization |

**Conclusion:** VHD-App's custom solution costs **$0-$4/month** vs. $490-$1,485/month for 15 users on commercial platforms.

**Annual savings:** $5,880 - $17,820 per year

---

## Risk Assessment

### API Dependency Risks:

1. **WeatherAPI.com Free Tier Removal:**
   - **Risk:** Free plan may no longer exist (conflicting info online)
   - **Mitigation:** Budget $4/month for Starter plan
   - **Alternative:** Switch to OpenWeatherMap (1,000 calls/day free)

2. **Google Maps Pricing Changes:**
   - **Risk:** Google may change free tier limits
   - **Mitigation:** Monitor usage dashboard, set billing alerts
   - **Alternative:** Use native device maps (Apple Maps, OpenStreetMap)

3. **PowerSync Pricing:**
   - **Risk:** Pricing may increase as service matures
   - **Mitigation:** Self-host PowerSync (open-source option available)
   - **Alternative:** Migrate to Supabase Realtime or AWS AppSync

---

## Recommendations

### Phase 1 (Immediate):

1. **Confirm WeatherAPI.com free tier availability**
   - Sign up at [weatherapi.com](https://www.weatherapi.com)
   - If no free tier, budget $4/month for Starter

2. **Set up Google Cloud billing alerts**
   - Alert at $10, $25, $50 thresholds
   - Prevents surprise charges

3. **Implement all features on free tiers**
   - Total cost: $0-$4/month
   - No financial risk

### Phase 2 (Growth):

1. **Monitor usage metrics monthly**
   - Google Maps loads
   - Weather API calls
   - PowerSync MAU and data transfer

2. **Optimize before upgrading**
   - Increase cache durations
   - Reduce location update frequency if needed
   - Archive old data

3. **Budget for scaling at 50+ users**
   - Allocate $100-$150/month for infrastructure
   - Still far cheaper than commercial solutions

---

**Questions? Clarifications needed?** Let me know which feature to start with!
