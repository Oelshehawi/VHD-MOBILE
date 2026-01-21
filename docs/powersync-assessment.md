# PowerSync Implementation Assessment

Assessment of PowerSync with MongoDB, attachments, and background sync for VHD-App.

## Executive Summary

Your PowerSync implementation is **well-architected** overall, following most best practices for offline-first mobile apps with MongoDB. However, I've identified several areas for improvement related to performance, code cleanup, and the `cloudinary_url` question.

---

## cloudinary_url Assessment

### Current Usage

`cloudinary_url` is defined in `AppConfig.ts`:

```typescript
export const AppConfig = {
  cloudinaryUrl: process.env.EXPO_PUBLIC_CLOUDINARY_URL, // ← NOT SET in .env
  cloudinaryCloudName: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY,
} as const;
```

**Finding:** `EXPO_PUBLIC_CLOUDINARY_URL` is **not defined** in your `.env` file. The only Cloudinary-related env vars are:

- `CLOUDINARY_URL` (full connection string, but not exposed to Expo)
- `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`
- `EXPO_PUBLIC_CLOUDINARY_API_KEY`

### Is cloudinary_url Needed?

> **No, `cloudinaryUrl` is NOT needed and can be removed.** Here's why:

1. In `BackendConnector.ts:41`, it's only used as a fallback value for ApiClient initialization (`'pending-initialization'` is used when empty)
2. In `PhotoAttachmentQueue.ts:30`, only `cloudinaryApiKey` is checked to determine if Cloudinary is configured
3. The actual upload flow uses server-side signed URLs via `/api/cloudinaryUpload`, not the Cloudinary URL directly

### Recommended Cleanup

```diff
// AppConfig.ts
export const AppConfig = {
-  cloudinaryUrl: process.env.EXPO_PUBLIC_CLOUDINARY_URL,
   cloudinaryCloudName: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME,
   cloudinaryApiKey: process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY,
} as const;
```

---

## PowerSync Implementation Review

### What's Working Well ✅

| Component               | Status       | Notes                                                                                       |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| **Schema Design**       | ✅ Excellent | `add_photo_operations` and `delete_photo_operations` as insert-only tables is best practice |
| **Concurrent Upload**   | ✅ Excellent | 3-worker concurrent processing with round-robin distribution                                |
| **Streaming Uploads**   | ✅ Excellent | Using FormData with file URI (not base64) for memory efficiency                             |
| **Attachment Metadata** | ✅ Correct   | Extended `AttachmentRecord` with custom columns                                             |
| **Offline Support**     | ✅ Solid     | Local queue with retry mechanism                                                            |

### Issues Found ⚠️

#### Issue 1: Dead Code in BackendConnector

The `cloudinaryUrl` private field is set but **never used** after initialization.

#### Issue 2: Redundant Sync Disable Check

Contradictory logic in `PhotoAttachmentQueue.init()` - sets interval to 5000ms when no API key, but `System.ts` already sets `syncInterval: 0`.

#### Issue 3: onAttachmentIdsChange is Empty

Required override has misleading comment but does nothing.

#### Issue 4: Duplicate Upload Logic

Both `uploadFileDirectly` and `uploadFile` in `CloudinaryStorageAdapter.ts` contain nearly identical upload logic.

#### Issue 5: Unused Constants in BackgroundUploadService

`MAX_RETRIES`, `RETRY_DELAY_BASE`, `BATCH_SIZE_SMALL_FILES` are defined but never used.

#### Issue 6: Unnecessary base64-arraybuffer Import

Used only in `readFile` for base64 encoding mode which is likely dead code path with streaming uploads.

---

## Performance Recommendations

### 1. Replace react-native-background-actions with expo-background-task

`react-native-background-actions` is a third-party library requiring native modules. `expo-background-task` is recommended for Expo apps.

### 2. Implement Retry Logic with Exponential Backoff

The constants exist but aren't used. Implement actual retry logic.

### 3. Add Image Compression Quality Option

Currently hardcoded in `imagePrep.ts`. Consider making configurable for network conditions.

### 4. Consider WebP Format for Android

WebP provides ~25-34% smaller file sizes with same quality on Android.

---

## Proposed Changes

| File                          | Change                                           |
| ----------------------------- | ------------------------------------------------ |
| `AppConfig.ts`                | Remove unused `cloudinaryUrl` export             |
| `BackendConnector.ts`         | Remove unused `cloudinaryUrl` private field      |
| `PhotoAttachmentQueue.ts`     | Fix contradictory sync interval logic            |
| `CloudinaryStorageAdapter.ts` | Consolidate duplicate upload methods             |
| `BackgroundUploadService.ts`  | Remove unused constants or implement retry logic |

---

_Generated: 2026-01-20_
