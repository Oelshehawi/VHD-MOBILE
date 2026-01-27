# Photo Upload & PowerSync Assessment

**Date**: 2026-01-26  
**Status**: Updated for Photo Revamp Plan (photos table + 10-concurrent uploads)

---

## Executive Summary

This update aligns the assessment with the new photo revamp plan:

- **Photos are synced via a dedicated `photos` table** (no more `schedules.photos` JSON).
- **Local upload queue stays in `attachments`** (local-only) with **10 concurrent uploads**.
- **Loading state uses `photos.cloudinaryUrl = NULL`**.
- **`react-native-background-actions` remains** the background mechanism for now.

Key risk remains **iOS background suspension** causing stuck uploads unless the background service can detect and restart stalled work.

---

## 1. Target Architecture Overview (Revamp)

### Data Flow

```
User captures photos
       ↓
PhotoCapture.tsx → PhotoAttachmentQueue.queuePhotos()
  - Prepare image (resize/compress)
  - Copy to /attachments/ directory
  - INSERT photos (cloudinaryUrl = NULL)
  - INSERT attachments (state = QUEUED_UPLOAD)
       ↓
UI reads photos table
  - cloudinaryUrl = NULL => show local file + loading spinner
       ↓
BackgroundUploadService starts (react-native-background-actions)
  - triggers PhotoAttachmentQueue.processQueue()
  - uploads 10 at a time to Cloudinary
       ↓
On success:
  - UPDATE photos.cloudinaryUrl
  - UPDATE attachments.state = SYNCED
  - delete local file to save space
       ↓
PowerSync syncs photos to backend via /api/photos
```

### Key Tables

| Table | Type | Purpose |
|-------|------|---------|
| `photos` | Synced | Photo metadata + `cloudinaryUrl` (NULL = loading) |
| `attachments` | Local-only | Upload queue state + local file paths |
| `schedules` | Synced | Job data only (no photos/signature JSON) |

---

## 2. Known Issues / Risks

### 2.1 🔴 Critical: Uploads Stuck on iOS

**Symptom**: Background task looks "running" but is suspended, causing new uploads to skip restarting.

**Fix still needed**: Detect "running but idle" and restart the service.

```typescript
// BackgroundUploadService.ts - checkAndStartBackgroundUpload()
if (BackgroundService.isRunning()) {
  const pendingCount = /* get pending count */;
  if (pendingCount > 0 && activeWorkers === 0) {
    await BackgroundService.stop();
    await startBackgroundUpload();
    return true;
  }
  return true;
}
```

### 2.2 🟡 Medium: Queue Trigger Coverage

`PhotoAttachmentQueue.processQueue()` must be triggered reliably in these cases:
- after `queuePhotos()` is called
- when app returns to foreground
- periodically while background service is active

If any trigger path is missing, queued items can stall indefinitely.

### 2.3 🟡 Medium: Retry / Backoff Strategy

Failures should not re-queue forever without backoff or caps. Add:
- retry count per attachment
- exponential delay
- permanent-fail state after N retries

### 2.4 🟡 Medium: Local File Cleanup vs Remote Deletion

We **do not want to delete Cloudinary assets** when an attachment record expires or is deleted. PowerSync attachments will call the storage adapter delete path on expiration, so the storage adapter must **only delete local files**.

**Recommended**:
- On successful Cloudinary upload + `photos.cloudinaryUrl` update, **delete the local file directly**.
- Keep the attachment record (state = SYNCED) until cache eviction.
- Ensure `deleteFile()` in the storage adapter never deletes from Cloudinary.

### 2.5 🟢 Low: Concurrency vs Memory

10 concurrent uploads is fine, but watch for memory pressure on older devices. Consider lowering concurrency dynamically if crashes or OOM events appear.

---

## 3. Background Upload Strategy (Current Decision)

**Decision**: Keep `react-native-background-actions` for now and integrate it with the new queue-based flow.

- **Foreground**: call `processQueue()` immediately after enqueue.
- **Background**: background service loops and calls `processQueue()` with 10 concurrency.
- **Expo background tasks**: deferred for later evaluation.

---

## 4. PowerSync Attachment Cache Behavior (Important)

- Orphaned attachments are set to `ARCHIVED` on next sync.
- The queue keeps the last `100` records by default; older ones expire (configurable via `cacheLimit`).
- When an attachment is deleted by user action or cache expiration, PowerSync also calls the storage adapter delete path.

**Implication**: If the adapter deletes remote files, Cloudinary assets could be removed unintentionally. Keep delete local-only.

---

## 5. Files to Modify (Updated)

| File | Priority | Change |
|------|----------|--------|
| `services/database/PhotoAttachmentQueue.ts` | 🔴 High | Rewrite for batch queue + 10 concurrent Cloudinary uploads |
| `services/background/BackgroundUploadService.ts` | 🔴 High | Trigger `processQueue()` + fix iOS stuck detection |
| `components/PhotoComponents/PhotoCapture.tsx` | 🔴 High | Use `queuePhotos()` + query `photos` table |
| `components/PhotoComponents/PhotoItem.tsx` | 🟡 Medium | Loading state via `cloudinaryUrl === null` |
| `services/storage/CloudinaryStorageAdapter.ts` | 🟡 Medium | Ensure `deleteFile()` is local-only |
| `services/database/schema.ts` | 🟡 Medium | Add `photos` table, remove `schedules.photos` + ops tables |

---

## 6. Next Steps (Updated)

1. [ ] Implement `PhotoAttachmentQueue.queuePhotos()` + `processQueue()` with 10 concurrency
2. [ ] Wire `BackgroundUploadService` to trigger queue + fix iOS stuck detection
3. [ ] Switch UI to `photos` table and `cloudinaryUrl` loading state
4. [ ] Delete local files after successful upload (do not delete remote)
5. [ ] Add retry/backoff + permanent-fail state
6. [ ] Remove `add_photo_operations` / `delete_photo_operations` + `schedules.photos`

---

## References

- [PowerSync Attachments Docs](https://docs.powersync.com/usage/use-case-examples/attachments-files-media)
- [@powersync/attachments (npm)](https://www.npmjs.com/package/%40powersync/attachments)
- [react-native-background-actions](https://github.com/Rapsssito/react-native-background-actions)
