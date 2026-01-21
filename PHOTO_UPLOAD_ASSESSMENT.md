# Photo Upload System Assessment

**Date**: 2026-01-20
**Status**: For Future Reference (System currently working)

This document captures potential issues identified during code review. Address if problems arise.

---

## Potential Issues Identified

### 1. Attachment Queue Disabled
**File**: `services/database/System.ts:42-46`

The PowerSync attachment queue is initialized with automatic sync disabled:
```typescript
this.attachmentQueue = new PhotoAttachmentQueue({
  performInitialSync: false,
  syncInterval: 0,
});
```

The `init()` method in `PhotoAttachmentQueue.ts:34-37` returns early without calling `super.init()`.

**Potential Impact**: Built-in retry logic and state management may be bypassed.

**Monitor For**: Photos stuck in pending state, uploads not retrying.

---

### 2. Retry Loop Potential
**File**: `services/background/BackgroundUploadService.ts:41-42, 95-102`

`MAX_RETRIES = 3` is defined but not used. Failed uploads reset to `QUEUED_UPLOAD`.

**Potential Impact**: Failed uploads could retry indefinitely.

**Monitor For**: Battery drain, "uploading" notification that never stops.

---

### 3. Missing ID Column in Operations
**File**: `services/storage/CloudinaryStorageAdapter.ts:185-189`

Inserts into `add_photo_operations` don't include `id` column.

**Potential Impact**: If PowerSync doesn't auto-generate, inserts may fail silently.

**Monitor For**: Photos that appear uploaded but don't sync to server.

---

### 4. MIME Type for Signatures
**File**: `services/database/PhotoAttachmentQueue.ts:221-223`

Signatures use `.png` extension but `media_type: 'image/jpeg'`.

**Potential Impact**: Possible Cloudinary rejection or display issues.

**Monitor For**: Signature upload failures, signatures not displaying.

---

### 5. Race Condition in Concurrent Uploads
**File**: `services/background/BackgroundUploadService.ts:150-160`

Three workers query for pending uploads simultaneously without locking.

**Potential Impact**: Same photo could be uploaded multiple times.

**Monitor For**: Duplicate photos in Cloudinary, increased storage usage.

---

### 6. Silent Batch Failures
**File**: `services/database/PhotoAttachmentQueue.ts:182-210`

Errors in batch operations are caught but not reported.

**Potential Impact**: Some photos in a batch may fail without user knowing.

**Monitor For**: "Added X photos" but fewer actually saved.

---

### 7. No File Cleanup
Local files aren't cleaned up after upload.

**Potential Impact**: Device storage fills up over time.

**Monitor For**: Storage warnings on devices with heavy photo usage.

---

## Recommended Actions (If Issues Arise)

1. **Enable retry count tracking** - Add column to track retries, mark as FAILED after 3
2. **Add upload locking** - Use `FOR UPDATE` or transaction to prevent race conditions
3. **Fix MIME type detection** - Check file extension and set correct media_type
4. **Implement batch error reporting** - Return list of failed records
5. **Add file cleanup** - Delete local files after successful upload confirmation

---

## Current Workarounds

The system currently works because:
- Background service handles most uploads successfully
- Network is generally reliable
- Photo volumes are manageable
- Users don't notice occasional failures

These issues may surface with:
- Poor network conditions
- High photo volumes
- Extended offline use
- Device storage pressure
