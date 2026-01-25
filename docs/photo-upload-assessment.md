# Photo Upload & PowerSync Assessment

**Date**: 2026-01-25  
**Status**: Analysis Complete - Recommendations Pending

---

## Executive Summary

This document captures findings from analyzing the photo upload architecture, PowerSync integration, and background sync reliability. The main issue identified is **uploads getting stuck on iOS** due to background execution limitations.

---

## 1. Current Architecture Overview

### Data Flow

```
User captures photo
       ↓
PhotoCapture.tsx (handlePhotoSelected)
       ↓
PhotoAttachmentQueue.batchSavePhotosFromUri()
  - Resizes image (2560×2560 max)
  - Copies to /attachments/ directory  
  - Saves to `attachments` table (PowerSync)
       ↓
schedules.photos JSON updated locally (for immediate UI)
       ↓
BackgroundUploadService.checkAndStartBackgroundUpload()
       ↓
react-native-background-actions (3 concurrent workers)
       ↓
CloudinaryStorageAdapter.uploadFileDirectly()
       ↓
On success: INSERT into `add_photo_operations`
       ↓
BackendConnector.uploadData() syncs to server
       ↓
Backend updates schedule, syncs back to device
```

### Key Tables

| Table | Type | Purpose |
|-------|------|---------|
| `attachments` | Normal (PowerSync) | Local attachment metadata with state tracking |
| `add_photo_operations` | INSERT-ONLY | Tracks uploads to sync to backend |
| `delete_photo_operations` | INSERT-ONLY | Tracks deletions to sync to backend |
| `schedules.photos` | JSON field | Photo metadata (duplicated for UI) |

---

## 2. Known Issues

### 2.1 🔴 Critical: Uploads Stuck on iOS

**Symptom**: When uploading multiple photos, UI gets stuck in loading state. Uploading a single photo afterwards triggers all pending uploads.

**Root Cause**: iOS background execution limitations + race condition

**Technical Details**:
1. `react-native-background-actions` starts a background task
2. iOS suspends the task almost immediately when app loses focus
3. `BackgroundService.isRunning()` returns `true` (task exists but suspended)
4. New uploads skip starting service because it appears "running"
5. When app returns to foreground, suspended task resumes and processes all queued photos

**Problematic Code**:
```typescript
// BackgroundUploadService.ts L493-497
if (BackgroundService.isRunning()) {
  logUploadService('Service already running, skip check');
  return true;  // Assumes running = actively uploading
}
```

### 2.2 🟡 Medium: PowerSync Attachment Queue Bypassed

The built-in PowerSync attachment queue is effectively disabled:

```typescript
// System.ts L43-47
this.attachmentQueue = new PhotoAttachmentQueue({
  powersync: this.powersync,
  storage: this.storage,
  performInitialSync: false,  // Disabled
  syncInterval: 0,            // Disabled
});
```

**Impact**: Loss of built-in retry logic, state management, and cache cleanup.

### 2.3 🟡 Medium: No Retry Logic Implementation

Constants defined but never used:
```typescript
// BackgroundUploadService.ts L44-45
const MAX_RETRIES = 3;           // Never used
const RETRY_DELAY_BASE = 1000;   // Never used
```

Failed uploads return to `QUEUED_UPLOAD` state indefinitely (infinite retry risk).

### 2.4 🟢 Low: Duplicate Upload Code

`CloudinaryStorageAdapter.ts` has two nearly identical methods:
- `uploadFileDirectly()` (L37-137) - Used by background uploader
- `uploadFile()` (L199-338) - PowerSync's standard method

### 2.5 🟢 Low: Triple Data Redundancy

Photos tracked in three places:
1. `attachments` table (state, local_uri, metadata)
2. `schedules.photos` JSON field
3. `add_photo_operations` table (after upload)

---

## 3. Background Upload Options Assessment

### Option A: Keep `react-native-background-actions` (Current)

| Pros | Cons |
|------|------|
| Shows foreground notification | iOS ~30 sec background limit |
| Concurrent upload (3 workers) | Can be suspended by OS |
| Works well on Android | Third-party dependency |

### Option B: `expo-background-task` / `expo-task-manager`

| Pros | Cons |
|------|------|
| Official Expo solution | **15-minute minimum interval** |
| OS-managed, battery efficient | Not for immediate uploads |

**Verdict**: NOT suitable for immediate uploads. Could be used as fallback only.

### Option C: Foreground-Only with Progress UI

| Pros | Cons |
|------|------|
| Most reliable | User must keep app open |
| Consistent cross-platform | |
| Clear progress feedback | |

### Option D: Hybrid (Recommended)

1. **Primary**: Fast foreground uploads with progress UI
2. **Background**: `react-native-background-actions` when app backgrounded
3. **Fallback**: `expo-task-manager` every 15 min to catch orphans
4. **On app open**: Force check for pending uploads

---

## 4. Recommended Fixes

### 4.1 Immediate: Stuck Upload Detection

Add detection for suspended background service:

```typescript
// BackgroundUploadService.ts - checkAndStartBackgroundUpload()
if (BackgroundService.isRunning()) {
  const pendingCount = /* get pending count */;
  if (pendingCount > 0 && activeWorkers === 0) {
    // Service running but no workers = stuck
    await BackgroundService.stop();
    await startBackgroundUpload();
    return true;
  }
  return true;
}
```

### 4.2 Short-term: Implement Retry Caps

```typescript
// Add retry tracking to attachments table or use a Map
const retryCount = new Map<string, number>();

// In processBatch, before marking failed:
const attempts = (retryCount.get(attachment.id) || 0) + 1;
if (attempts >= MAX_RETRIES) {
  await markAttachmentPermanentlyFailed(system, attachment.id);
  retryCount.delete(attachment.id);
} else {
  retryCount.set(attachment.id, attempts);
  await markAttachmentFailed(system, attachment.id);
}
```

### 4.3 Medium-term: Foreground Upload Mode

Add option to upload in foreground with progress callback:

```typescript
export const uploadInForeground = async (
  onProgress?: (uploaded: number, total: number) => void
): Promise<{ uploaded: number; failed: number }> => {
  // Direct upload without BackgroundService wrapper
  // Shows progress via callback
  // More reliable on iOS
};
```

### 4.4 Simplify Data Model

Consider removing local `schedules.photos` manipulation:
- Display pending photos from `attachments` table
- After sync, backend `schedules.photos` becomes source of truth
- Reduces sync complexity

---

## 5. `add_photo_operations` Assessment

### Current Design (Good)

The INSERT-ONLY pattern is correct for PowerSync:
1. Photo uploads to Cloudinary
2. `add_photo_operations` record inserted with URL
3. PowerSync syncs to backend
4. Backend updates schedule, record removed server-side

### Potential Improvements

1. **Add explicit ID**: Currently relies on auto-generation
2. **Add retry metadata**: Track upload attempts
3. **Consolidate with attachments**: Consider merging state tracking

---

## 6. Files to Modify

| File | Priority | Change |
|------|----------|--------|
| `BackgroundUploadService.ts` | 🔴 High | Add stuck detection, implement retry caps |
| `CloudinaryStorageAdapter.ts` | 🟡 Medium | Consolidate duplicate upload methods |
| `PhotoCapture.tsx` | 🟡 Medium | Add foreground upload option with progress |
| `AppConfig.ts` | 🟢 Low | Remove unused `cloudinaryUrl` |
| `schema.ts` | 🟢 Low | Consider adding retry_count to attachments |

---

## 7. Next Steps

1. [ ] Fix stuck upload detection (immediate)
2. [ ] Implement retry logic with MAX_RETRIES cap
3. [ ] Add foreground upload mode with progress UI
4. [ ] Consider `expo-task-manager` as 15-min fallback
5. [ ] Consolidate duplicate code in CloudinaryStorageAdapter
6. [ ] Clean up unused constants and config

---

## References

- [PowerSync Attachments Docs](https://docs.powersync.com/usage/use-case-examples/attachments-files-media)
- [react-native-background-actions](https://github.com/Rapsssito/react-native-background-actions)
- [expo-task-manager](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- Previous assessments: `powersync-assessment.md`, `powersync-cloudinary-assessment.md`
