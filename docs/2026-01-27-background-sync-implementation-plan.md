# Background Sync Implementation Plan for VHD-App

**Date:** 2026-01-27
**Status:** Planning (not yet implemented)

## Overview

This plan adds background task scheduling to enable PowerSync data sync and Cloudinary photo uploads to continue when the app is backgrounded. The implementation follows the official [PowerSync Expo Background Sync](https://github.com/powersync-community/powersync-react-native-expo-background-sync) pattern.

## Current State Analysis

### Already Configured

- `expo-background-task` plugin in app.config.js (line 79)
- `expo-task-manager` package installed (v14.0.8)
- iOS UIBackgroundModes: `fetch`, `remote-notification`, `processing`, `location`
- iOS BGTaskSchedulerPermittedIdentifiers configured
- Android permissions: WAKE_LOCK, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC

### How It Will Work

**PowerSync Data Sync (schedules, invoices, etc.):**

1. App goes to background → background task is scheduled
2. Task runs (system decides when based on battery/network/usage)
3. Creates isolated PowerSync connection with cached Clerk token
4. Calls `uploadData()` to push pending local changes (upload-only focus)
5. PowerSync handles downloads automatically when connection is active
6. Closes connection when complete

**Error Handling:** Silent retry - errors are logged but no user notification. System will retry on next scheduled run.

**Photo Uploads (Cloudinary):**

1. PhotoAttachmentQueue has photos in `QUEUED_UPLOAD` state
2. Background task calls `processQueue()` on the attachment queue
3. Gets batch signed URLs from `/api/cloudinaryUpload` (authenticated)
4. Uploads files to Cloudinary (10 concurrent max)
5. Updates local database with cloudinaryUrl
6. Marks attachments as `SYNCED`

## Critical Implementation Requirements

### 1. Use `expo/fetch` for Background Network Requests

The default React Native fetch doesn't work in background. Must override fetch:

```typescript
import { fetch } from 'expo/fetch';
```

### 2. Avoid Multiple PowerSync Connections

- Unregister task when app comes to foreground
- Only one sync operation at a time (already have `isProcessing` flag)
- Close connection when task completes

### 3. Token Caching

Clerk tokens are cached via `tokenCache` - should work in background as long as session is valid.

---

## Implementation Steps

### Step 1: Create Background Sync Service

**File:** `services/background/BackgroundSync.ts`

This module will:

- Define the background task using `TaskManager.defineTask()`
- Export functions to register/unregister the task
- Handle the sync logic in isolation

Key implementation:

```typescript
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { fetch } from 'expo/fetch';
// ... PowerSync setup with expo/fetch override
```

### Step 2: Create Background-Compatible System Instance

**File:** `services/background/BackgroundSystem.ts`

A lightweight PowerSync system for background use that:

- Creates its own PowerSync database connection
- Uses `expo/fetch` for all network requests
- Can run independently of the main app thread

### Step 3: Integrate with App Lifecycle

**File:** `app/_layout.tsx` (modify)

Add AppState listener to:

- Register background task when app goes to background
- Unregister when app comes to foreground
- Avoid conflicts with foreground sync

### Step 4: Update PhotoAttachmentQueue for Background

**File:** `services/database/PhotoAttachmentQueue.ts` (modify)

- Accept optional `fetch` parameter for background compatibility
- Ensure `getBatchSignedUploadUrls()` uses provided fetch

### Step 5: Update ApiClient for Background

**File:** `services/ApiClient.ts` (modify)

- Accept optional `fetch` override
- Pass to all network requests

---

## Files to Create

| File                                      | Purpose                                          |
| ----------------------------------------- | ------------------------------------------------ |
| `services/background/BackgroundSync.ts`   | Main background task definition and registration |
| `services/background/BackgroundSystem.ts` | Isolated PowerSync system for background         |
| `services/background/index.ts`            | Exports for background services                  |

## Files to Modify

| File                                        | Changes                                     |
| ------------------------------------------- | ------------------------------------------- |
| `app/_layout.tsx`                           | Add AppState listener for task registration |
| `services/database/PhotoAttachmentQueue.ts` | Support custom fetch function               |
| `services/ApiClient.ts`                     | Support custom fetch override               |
| `services/database/BackendConnector.ts`     | Support custom fetch for credentials        |

---

## Detailed Implementation

### BackgroundSync.ts Structure

```typescript
// Constants
const BACKGROUND_SYNC_TASK = 'com.braille71.vhdapp.background-sync';

// 1. Define task (must be at module level, not in component)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    // Initialize background system
    const backgroundSystem = new BackgroundSystem();
    await backgroundSystem.init();

    // Sync PowerSync data
    await backgroundSystem.sync();

    // Process photo uploads
    await backgroundSystem.processPhotoUploads();

    // Cleanup
    await backgroundSystem.disconnect();

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('[Background Sync] Error:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// 2. Registration functions
export async function registerBackgroundSync() {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Available) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 // 15 minutes (minimum allowed)
    });
  }
}

export async function unregisterBackgroundSync() {
  await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
}
```

### BackgroundSystem.ts Structure

```typescript
import { PowerSyncDatabase } from '@powersync/react-native';
import { fetch as expoFetch } from 'expo/fetch';

export class BackgroundSystem {
  private powersync: PowerSyncDatabase;
  private attachmentQueue: PhotoAttachmentQueue;

  constructor() {
    // Create isolated instances with expo/fetch
    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: new OPSqliteOpenFactory({ dbFilename: 'powersync.db' })
    });
  }

  async init() {
    await this.powersync.init();
    // Connect with background-compatible connector
    await this.powersync.connect(new BackgroundConnector());
  }

  async sync() {
    // Upload pending changes - PowerSync handles download automatically
    // when connected. We focus on ensuring uploads complete.
    const tx = await this.powersync.getNextCrudTransaction();
    if (tx) {
      await this.connector.uploadData(this.powersync);
    }
  }

  async processPhotoUploads() {
    // Process photo queue with expo/fetch
  }

  async disconnect() {
    await this.powersync.disconnect();
  }
}
```

### App Lifecycle Integration

```typescript
// In _layout.tsx
useEffect(() => {
  const subscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'background') {
      // App going to background - register task
      registerBackgroundSync().catch(console.warn);
    } else if (nextState === 'active') {
      // App coming to foreground - unregister task
      unregisterBackgroundSync().catch(console.warn);
    }
  });

  return () => subscription.remove();
}, []);
```

---

## Platform Considerations

### iOS

- Background tasks require physical device (not simulator)
- System decides when to run based on battery/network/usage patterns
- Minimum interval: 15 minutes
- Task may not run immediately when backgrounded

### Android

- Uses WorkManager API
- Minimum interval: 15 minutes (enforced by platform)
- More predictable scheduling than iOS
- Testing: `adb shell cmd jobscheduler run -f com.braille71.VHDApp [JOB_ID]`

---

## Testing Strategy

### iOS Testing

1. Build development client: `npx expo run:ios --device`
2. Queue some photos for upload
3. Background the app
4. Wait 15+ minutes (or use Instruments to trigger)
5. Check if photos uploaded via Cloudinary dashboard

### Android Testing

1. Build: `npx expo run:android`
2. Queue photos
3. Background app
4. Force task execution:
   ```bash
   adb shell dumpsys jobscheduler | grep -A 40 com.braille71.VHDApp
   adb shell cmd jobscheduler run -f com.braille71.VHDApp [JOB_ID]
   ```
5. Check logs: `adb logcat | grep "Background Sync"`

### Debug Mode

Use `BackgroundTask.triggerTaskWorkerForTestingAsync()` in development to manually trigger the task.

---

## Verification Checklist

- [ ] Background task registers when app backgrounded
- [ ] Background task unregisters when app foregrounded
- [ ] PowerSync data syncs in background
- [ ] Queued photos upload in background
- [ ] No multiple PowerSync connections conflict
- [ ] Works on iOS physical device
- [ ] Works on Android device
- [ ] Clerk tokens work in background (cached)
- [ ] Graceful handling when offline

---

## Sources

- [PowerSync Expo Background Sync Demo](https://github.com/powersync-community/powersync-react-native-expo-background-sync)
- [PowerSync Background Syncing Docs](https://docs.powersync.com/usage/use-case-examples/background-syncing)
- [Expo BackgroundTask Docs](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Expo Blog: Goodbye background-fetch, hello expo-background-task](https://expo.dev/blog/goodbye-background-fetch-hello-expo-background-task)
