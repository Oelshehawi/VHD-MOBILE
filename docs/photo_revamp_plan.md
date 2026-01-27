# Photo System Revamp Plan

## Overview

This document outlines the plan to simplify and improve the photo upload system in the VHD-App. The new system uses:

- **Batch operations** for all photo syncs (no single-photo API calls)
- **Null cloudinaryUrl as loading state** - photos are inserted immediately, visible locally with loading indicator
- **Parallel Cloudinary uploads** (10 concurrent) for fast bulk photo processing
- **`attachments` table (local-only)** for upload queue management
- **`photos` table (synced)** for photo metadata (includes signatures as type='signature')
- **Single API route** (`/api/photos`) handles all photo operations

---

## Table of Contents

1. [Current System Problems](#current-system-problems)
2. [New Architecture](#new-architecture)
3. [ID Generation Strategy](#id-generation-strategy)
4. [Data Flow](#data-flow)
5. [Database Schema Changes](#database-schema-changes)
6. [Backend API Reference](#backend-api-reference)
7. [File-by-File Changes](#file-by-file-changes)
8. [Implementation Details](#implementation-details)
9. [UI Component Updates](#ui-component-updates)
10. [Error Handling & Retry](#error-handling--retry)
11. [Migration Steps](#migration-steps)
12. [Implementation Checklist](#implementation-checklist)

---

## Current System Problems

### 1. One API Call Per Photo

- Current system makes separate API calls for each photo
- 50 photos = 50 API calls = slow and error-prone
- Network overhead, potential rate limiting, partial failures

### 2. Unnecessary Tables & JSON Storage

- `add_photo_operations` - INSERT-only table to queue photo additions
- `delete_photo_operations` - INSERT-only table to queue photo deletions
- `schedules.photos` - JSON column storing photo arrays (REMOVED - already migrated)
- `schedules.signature` - JSON column storing signature data (TO BE REMOVED)

### 3. Overcomplicated PhotoAttachmentQueue

- 578 lines of code with many unused/redundant methods
- Complex file handling that duplicates functionality

### 4. No Loading State

- User has no feedback while photos upload
- Photos don't appear until fully uploaded

### 5. Sequential Uploads

- Photos upload one at a time
- 50 photos could take 5+ minutes

---

## New Architecture

### Core Principles

1. **Batch everything** - Multiple photos = single API call
2. **Null URL = loading state** - Insert immediately, show loading indicator
3. **Parallel uploads** - Upload 10 photos to Cloudinary concurrently
4. **Two tables, two purposes**:
   - `photos` (synced) - metadata + cloudinaryUrl
   - `attachments` (local-only) - upload queue state
5. **Single API route** - All photo operations go through `/api/photos`

### Tables

| Table         | Purpose                                         | Synced via PowerSync? |
| ------------- | ----------------------------------------------- | --------------------- |
| `photos`      | Photo metadata + cloudinaryUrl                  | ✅ Yes                |
| `attachments` | Upload queue tracking (local file paths, state) | ❌ No (local-only)    |
| `schedules`   | Job data (NO more photos/signature JSON)        | ✅ Yes                |

### Key Insight: Shared ID + Loading State

```
1. User takes 10 photos
2. Generate 10 MongoDB-compatible ObjectIds
3. Copy 10 files to local attachments directory
4. INSERT 10 rows into `photos` (cloudinaryUrl = NULL) → triggers sync to backend
5. INSERT 10 rows into `attachments` (local file paths, state = QUEUED)
6. UI shows 10 photos with loading spinners (cloudinaryUrl = NULL)
7. Background: upload to Cloudinary in parallel (10 at a time)
8. As each completes: UPDATE photos SET cloudinaryUrl = ?
9. PowerSync batches completed photos and syncs to backend
10. Backend/other devices now see the photos
```

### Display Logic

| cloudinaryUrl | Local Device              | Backend/Other Devices                        |
| ------------- | ------------------------- | -------------------------------------------- |
| NULL          | Show with loading spinner | Filter out (WHERE cloudinaryUrl IS NOT NULL) |
| Has URL       | Show from Cloudinary      | Show from Cloudinary                         |

---

## ID Generation Strategy

### MongoDB ObjectId Compatibility

The backend accepts client-provided IDs if they're valid 24-character hex strings (MongoDB ObjectId format).

**Client-side ID generation:**

```typescript
// utils/objectId.ts
export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return timestamp + random;
}
```

**Why not UUID?**
- MongoDB expects 24-character hex strings for `_id`
- UUIDs are 36 characters with dashes
- Using MongoDB-compatible IDs avoids conversion issues

**Backend handles both cases:**
- If `photo.id` is provided → uses it as `_id`
- If `photo.id` is missing → generates new ObjectId

---

## Data Flow

### Photo Capture Flow (Batch)

```
1. User selects 50 photos from gallery
   ↓
2. Immediately (instant UX feedback):
   a. Generate 50 MongoDB-compatible ObjectIds
   b. Copy 50 files to local attachments directory (BEFORE transaction)
   c. In single transaction:
      - BATCH INSERT into photos (cloudinaryUrl = NULL for all)
      - BATCH INSERT into attachments (state = QUEUED_UPLOAD)
   d. Show "50 photos saved, uploading in background..."
   ↓
3. UI shows 50 photos with loading spinners
   ↓
4. PowerSync syncs photos (with NULL URLs) to backend
   - BackendConnector batches all 50 into single API call
   - POST /api/photos with array of 50 photos
   ↓
5. Background upload to Cloudinary (parallel, 10 at a time):
   a. Get batch of 10 QUEUED attachments
   b. For each: get signed URL, upload to Cloudinary
   c. On success: UPDATE photos SET cloudinaryUrl = ?
   d. Mark attachment as SYNCED
   e. Repeat until all done
   ↓
6. PowerSync detects cloudinaryUrl updates, syncs to backend:
   - BackendConnector batches all updates into single API call
   - POST /api/photos with updated URLs
   ↓
7. Done! Photos visible everywhere with URLs.
```

### API Calls Summary

| Step | API Call               | Photos              | Total Calls |
| ---- | ---------------------- | ------------------- | ----------- |
| 4    | POST /api/photos       | 50 (with NULL URLs) | 1           |
| 5    | GET /api/cloudinaryUpload | 50 (signed URLs) | 50*         |
| 6    | POST /api/photos       | 50 (with URLs)      | 1           |

*Cloudinary signed URL requests are lightweight and fast. The actual upload goes directly to Cloudinary CDN.

### Photo Delete Flow (Batch)

```
1. User selects 5 photos to delete
   ↓
2. DELETE FROM photos WHERE id IN (?, ?, ?, ?, ?) (LOCAL)
   ↓
3. PowerSync batches deletions, syncs to backend:
   - DELETE /api/photos with array of 5 IDs
   - Backend deletes from MongoDB + Cloudinary cleanup
   ↓
4. Orphaned attachments cleaned up locally
```

### Edge Case: Delete While Uploading

If a user deletes a photo while it is still queued or uploading (cloudinaryUrl = NULL), we must prevent a late upload from re-introducing the photo:

```
1. User deletes a photo with cloudinaryUrl = NULL
2. DELETE FROM photos WHERE id = ? (LOCAL)
3. Mark attachment as CANCELLED (or delete attachment row)
4. Upload worker checks:
   - If photos row no longer exists, skip upload
   - Delete local file immediately
5. Backend delete should safely ignore Cloudinary cleanup when URL is null
```

**Required safeguards:**
- `uploadToCloudinary()` must verify the photo still exists before uploading.
- If missing, skip upload and remove local file.
- Backend delete handler should be no-op for Cloudinary cleanup when `cloudinaryUrl` is null.

### Signature Capture Flow

Signatures use the same `photos` table with `type = 'signature'`:

```
1. User signs on canvas
   ↓
2. Save signature as PNG data URI
   ↓
3. Same flow as photos:
   a. Generate ObjectId
   b. Copy file to attachments directory
   c. INSERT into photos (type = 'signature', cloudinaryUrl = NULL, signerName = ?)
   d. INSERT into attachments
   ↓
4. Background upload same as photos
   ↓
5. UI queries: SELECT * FROM photos WHERE scheduleId = ? AND type = 'signature'
```

---

## Database Schema Changes

### New: photos table

```typescript
// schema.ts
const photos = new Table(
  {
    // id column (text) is automatically included - MongoDB ObjectId format
    scheduleId: column.text,
    cloudinaryUrl: column.text, // NULL = loading, has value = uploaded
    type: column.text, // 'before' | 'after' | 'signature' | 'estimate'
    technicianId: column.text,
    timestamp: column.text, // ISO string
    signerName: column.text, // Only for type='signature'
  },
  { indexes: { schedules: ['scheduleId'] } }
);
```

### Simplified: attachments table

```typescript
// Keep existing AttachmentTable but remove unused additionalColumns
attachments: new AttachmentTable({
  name: 'attachments',
  additionalColumns: [
    // Minimal columns needed for upload queue
    new Column({ name: 'scheduleId', type: ColumnType.TEXT }),
  ],
}),
```

### Remove from schedules table

```typescript
// REMOVE these columns from schedules table
// photos: column.text,     // REMOVED - migrated to photos table
// signature: column.text,  // REMOVED - migrated to photos table with type='signature'
```

### Remove: operation tables

- DELETE `add_photo_operations` table entirely
- DELETE `delete_photo_operations` table entirely

### Updated Schema Export

```typescript
export const AppSchema = new Schema({
  invoices,
  schedules,
  payrollperiods,
  availabilities,
  timeoffrequests,
  photos, // NEW
  attachments: new AttachmentTable({
    name: 'attachments',
    additionalColumns: [
      new Column({ name: 'scheduleId', type: ColumnType.TEXT }),
    ],
  }),
});
```

---

## Backend API Reference

The backend `/api/photos` route handles all photo operations:

### POST /api/photos - Create/Update Photos (Batch)

**Request:**
```json
{
  "photos": [
    {
      "id": "507f1f77bcf86cd799439011",  // Optional - generated if not provided
      "scheduleId": "507f1f77bcf86cd799439012",
      "cloudinaryUrl": null,  // null = loading state
      "type": "before",
      "technicianId": "user_abc123",
      "timestamp": "2024-01-15T10:30:00Z",
      "signerName": null
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "ids": ["507f1f77bcf86cd799439011"],
  "result": {
    "matchedCount": 0,
    "modifiedCount": 0,
    "upsertedCount": 1
  }
}
```

### GET /api/photos - Get Photos for Schedule

**Query params:**
- `scheduleId` (required) - The schedule to get photos for
- `type` (optional) - Filter by type ('before', 'after', 'signature', 'estimate')

**Note:** Backend automatically filters out photos with `cloudinaryUrl = null`

**Response:**
```json
{
  "photos": [
    {
      "id": "507f1f77bcf86cd799439011",
      "scheduleId": "507f1f77bcf86cd799439012",
      "cloudinaryUrl": "https://res.cloudinary.com/...",
      "type": "before",
      "technicianId": "user_abc123",
      "timestamp": "2024-01-15T10:30:00Z",
      "signerName": null
    }
  ]
}
```

### DELETE /api/photos - Delete Photos (Batch)

**Request (body):**
```json
{
  "ids": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

**Or query param:**
```
DELETE /api/photos?id=507f1f77bcf86cd799439011
```

**Response:**
```json
{
  "success": true,
  "deletedCount": 2
}
```

---

## File-by-File Changes

### 1. `services/database/schema.ts`

**Changes:**
- ADD `photos` table definition
- REMOVE `add_photo_operations` table
- REMOVE `delete_photo_operations` table
- REMOVE `photos` and `signature` columns from `schedules` table
- SIMPLIFY `attachments` table (minimal additionalColumns)

### 2. `services/database/BackendConnector.ts`

**Changes:**
- ADD batch photo operation handling
- REMOVE skip logic for photos/signature in schedules table
- REMOVE special handling for operation tables

### 3. `services/ApiClient.ts`

**Changes:**
- ADD `batchUpsertPhotos()` method
- ADD `batchDeletePhotos()` method
- REMOVE `updatePhotos()` method
- REMOVE `processPhotoAddOperation()` method
- REMOVE `processPhotoDeleteOperation()` method

### 4. `services/database/PhotoAttachmentQueue.ts`

**Changes:**
- COMPLETE REWRITE (~200 lines)
- ADD `queuePhotos()` - batch queue photos with parallel upload
- ADD `processQueue()` - parallel Cloudinary uploads (10 concurrent)
- ADD `uploadToCloudinary()` - single upload helper
- REMOVE all legacy methods

### 5. `services/storage/CloudinaryStorageAdapter.ts`

**Changes:**
- SIMPLIFY to minimal implementation
- REMOVE duplicate upload methods
- ADD retry check (skip if cloudinaryUrl already exists)

### 6. `services/background/BackgroundUploadService.ts`

**Changes:**
- DELETE entire file (replaced by attachment queue)

### 7. `utils/objectId.ts`

**Changes:**
- NEW FILE - MongoDB-compatible ObjectId generation

### 8. UI Components

**Changes:**
- UPDATE `PhotoCapture.tsx` - Use `queuePhotos()`, query `photos` table
- UPDATE `PhotoGrid.tsx` - Receive photos from `useQuery()` hook
- UPDATE `PhotoItem.tsx` - Check `cloudinaryUrl === null` for loading state
- UPDATE `SignatureCapture.tsx` - Use `queuePhotos()` with type='signature'
- UPDATE `InvoiceModal.tsx` - Query `photos` table for signature

---

## Implementation Details

### utils/objectId.ts (NEW FILE)

```typescript
/**
 * Generate a MongoDB-compatible ObjectId (24 hex characters)
 * Format: 8 chars timestamp + 16 chars random
 */
export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return timestamp + random;
}
```

### PhotoAttachmentQueue (Complete Rewrite)

```typescript
import { File, Directory } from 'expo-file-system';
import {
  AbstractAttachmentQueue,
  AttachmentRecord,
  AttachmentState,
} from '@powersync/attachments';
import { generateObjectId } from '@/utils/objectId';
import { prepareImageForUpload } from '@/utils/imagePrep';

interface QueuePhotoInput {
  sourceUri: string;
  scheduleId: string;
  type: 'before' | 'after' | 'signature' | 'estimate';
  technicianId: string;
  signerName?: string;
}

export class PhotoAttachmentQueue extends AbstractAttachmentQueue {
  private readonly CONCURRENT_UPLOADS = 10;
  private isProcessing = false;

  /**
   * Queue multiple photos for upload (instant, returns immediately)
   * Photos are inserted with cloudinaryUrl = NULL (loading state)
   * 
   * IMPORTANT: File copying happens BEFORE the transaction to avoid
   * mixing I/O operations with database atomicity.
   */
  async queuePhotos(photos: QueuePhotoInput[]): Promise<string[]> {
    if (!photos || photos.length === 0) return [];

    const ids: string[] = [];
    const timestamp = new Date().toISOString();
    const preparedFiles: Array<{
      id: string;
      filename: string;
      destUri: string;
      photo: QueuePhotoInput;
    }> = [];

    // STEP 1: Prepare and copy all files BEFORE transaction
    for (const photo of photos) {
      const id = generateObjectId();
      const ext = photo.type === 'signature' ? 'png' : 'jpg';
      const filename = `${id}.${ext}`;
      const destUri = this.getLocalUri(filename);

      // Prepare image (resize, compress)
      const prepared = await prepareImageForUpload(photo.sourceUri, {
        format: photo.type === 'signature' ? 'png' : 'jpeg',
      });

      // Copy file to attachments directory
      await this.storage.copyFile(prepared.uri, destUri);

      preparedFiles.push({ id, filename, destUri, photo });
      ids.push(id);
    }

    // STEP 2: Database transaction (atomic)
    await this.powersync.writeTransaction(async (tx) => {
      for (const { id, filename, photo } of preparedFiles) {
        // INSERT into photos table (cloudinaryUrl = NULL = loading state)
        await tx.execute(
          `INSERT INTO photos (id, scheduleId, cloudinaryUrl, type, technicianId, timestamp, signerName)
           VALUES (?, ?, NULL, ?, ?, ?, ?)`,
          [
            id,
            photo.scheduleId,
            photo.type,
            photo.technicianId,
            timestamp,
            photo.signerName || null,
          ]
        );

        // INSERT into attachments table (local-only queue)
        await tx.execute(
          `INSERT INTO attachments (id, filename, local_uri, media_type, state, scheduleId)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            filename,
            this.getLocalFilePathSuffix(filename),
            photo.type === 'signature' ? 'image/png' : 'image/jpeg',
            AttachmentState.QUEUED_UPLOAD,
            photo.scheduleId,
          ]
        );
      }
    });

    // STEP 3: Trigger background upload (don't await)
    this.processQueue();

    return ids;
  }

  /**
   * Process upload queue with parallel Cloudinary uploads (10 concurrent)
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        // Get batch of QUEUED attachments
        const queued = await this.powersync.getAll<AttachmentRecord & { id: string }>(
          `SELECT id, filename, local_uri, media_type 
           FROM attachments 
           WHERE state = ? 
           LIMIT ?`,
          [AttachmentState.QUEUED_UPLOAD, this.CONCURRENT_UPLOADS]
        );

        if (queued.length === 0) break;

        // Upload in parallel (10 at a time)
        const results = await Promise.allSettled(
          queued.map((att) => this.uploadToCloudinary(att))
        );

        // Log results
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;
        console.log(`[Upload] Batch complete: ${succeeded} succeeded, ${failed} failed`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Upload single attachment to Cloudinary
   * Updates photos table with cloudinaryUrl on success
   */
  private async uploadToCloudinary(
    attachment: AttachmentRecord & { id: string }
  ): Promise<void> {
    try {
      // Check if already uploaded (duplicate prevention / retry case)
      const [photo] = await this.powersync.getAll<{ cloudinaryUrl: string | null }>(
        `SELECT cloudinaryUrl FROM photos WHERE id = ?`,
        [attachment.id]
      );

      if (photo?.cloudinaryUrl) {
        // Already uploaded, just mark as synced
        await this.markAsSynced(attachment.id);
        return;
      }

      // Get signed URL from backend
      const signedUrl = await this.getSignedUploadUrl(
        attachment.filename,
        attachment.media_type
      );

      // Upload to Cloudinary
      const localUri = this.getLocalUri(attachment.filename);
      const formData = new FormData();
      formData.append('file', {
        uri: localUri,
        type: attachment.media_type,
        name: attachment.filename,
      } as any);
      formData.append('api_key', signedUrl.apiKey);
      formData.append('timestamp', signedUrl.timestamp);
      formData.append('signature', signedUrl.signature);
      formData.append('folder', signedUrl.folderPath);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${signedUrl.cloudName}/image/upload`,
        { method: 'POST', body: formData }
      );

      if (!uploadResponse.ok) {
        throw new Error(`Cloudinary upload failed: ${uploadResponse.status}`);
      }

      const { secure_url } = await uploadResponse.json();

      // Update photos table with cloudinaryUrl (triggers PowerSync sync)
      await this.powersync.execute(
        `UPDATE photos SET cloudinaryUrl = ? WHERE id = ?`,
        [secure_url, attachment.id]
      );

      // Mark attachment as synced
      await this.markAsSynced(attachment.id);

      console.log(`[Upload] ✅ ${attachment.id}`);
    } catch (error) {
      console.error(`[Upload] ❌ ${attachment.id}:`, error);
      // Leave as QUEUED_UPLOAD for retry on next processQueue()
      throw error;
    }
  }

  private async markAsSynced(id: string): Promise<void> {
    await this.powersync.execute(
      `UPDATE attachments SET state = ? WHERE id = ?`,
      [AttachmentState.SYNCED, id]
    );
  }

  private async getSignedUploadUrl(
    filename: string,
    mediaType: string
  ): Promise<{
    apiKey: string;
    timestamp: string;
    signature: string;
    cloudName: string;
    folderPath: string;
  }> {
    // Call your existing /api/cloudinaryUpload endpoint
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL}/api/cloudinaryUpload?filename=${filename}&mimeType=${mediaType}`
    );
    if (!response.ok) throw new Error('Failed to get signed URL');
    return response.json();
  }
}
```

### BackendConnector: Batching Photo Operations

```typescript
// BackendConnector.ts
import { UpdateType } from '@powersync/react-native';

async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;

  // Extract photo operations for batching
  const photoUpserts = transaction.crud
    .filter(op => op.table === 'photos' && (op.op === UpdateType.PUT || op.op === UpdateType.PATCH))
    .map(op => ({ ...op.opData, id: op.id }));

  const photoDeletes = transaction.crud
    .filter(op => op.table === 'photos' && op.op === UpdateType.DELETE)
    .map(op => op.id);

  // Batch API calls for photos
  if (photoUpserts.length > 0) {
    const result = await this.apiClient.batchUpsertPhotos(photoUpserts);
    if (result.error) throw new Error(result.error);
  }

  if (photoDeletes.length > 0) {
    const result = await this.apiClient.batchDeletePhotos(photoDeletes);
    if (result.error) throw new Error(result.error);
  }

  // Process non-photo operations normally (existing loop)
  for (const op of transaction.crud) {
    if (op.table === 'photos') continue; // Already handled

    const table = this.apiClient.from(op.table);
    switch (op.op) {
      case UpdateType.PUT:
        await table.upsert({ ...op.opData, id: op.id });
        break;
      case UpdateType.PATCH:
        await table.update(op.opData).eq('id', op.id);
        break;
      case UpdateType.DELETE:
        await table.delete().eq('id', op.id);
        break;
    }
  }

  await transaction.complete();
}
```

### ApiClient: Batch Methods

```typescript
// ApiClient.ts

async batchUpsertPhotos(
  photos: Array<{
    id: string;
    scheduleId: string;
    cloudinaryUrl: string | null;
    type: string;
    technicianId: string;
    timestamp: string;
    signerName?: string | null;
  }>
): Promise<{ success?: boolean; ids?: string[]; error?: string }> {
  const response = await fetch(`${this.baseUrl}/api/photos`, {
    method: 'POST',
    headers: this.headers,
    body: JSON.stringify({ photos }),
  });

  if (!response.ok) {
    return { error: `HTTP ${response.status}` };
  }
  return response.json();
}

async batchDeletePhotos(
  ids: string[]
): Promise<{ success?: boolean; deletedCount?: number; error?: string }> {
  const response = await fetch(`${this.baseUrl}/api/photos`, {
    method: 'DELETE',
    headers: this.headers,
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    return { error: `HTTP ${response.status}` };
  }
  return response.json();
}
```

---

## UI Component Updates

### PhotoCapture.tsx Changes

**Current flow (to be replaced):**
1. Calls `queue.batchSavePhotosFromUri()`
2. Updates `schedules.photos` JSON column
3. Starts background upload service

**New flow:**
1. Calls `queue.queuePhotos()` with photo data
2. That's it! The queue handles everything

```typescript
// PhotoCapture.tsx - NEW handlePhotoSelected

const handlePhotoSelected = async (result: ImagePicker.ImagePickerResult) => {
  if (result.canceled || !result.assets?.length || !scheduleId || !system?.attachmentQueue) {
    return;
  }

  try {
    setIsUploading(true);
    const queue = system.attachmentQueue;

    // Validate file sizes
    const validAssets = await filterValidAssets(result.assets);
    if (validAssets.length === 0) {
      showToast('No valid photos to upload');
      return;
    }

    // Prepare photo data
    const photoData = validAssets.map((asset) => ({
      sourceUri: asset.uri,
      scheduleId: scheduleId!,
      type: type, // 'before' | 'after'
      technicianId: technicianId,
    }));

    // Queue photos - this handles everything!
    const savedIds = await queue.queuePhotos(photoData);

    showToast(`Added ${savedIds.length} ${type} photo${savedIds.length > 1 ? 's' : ''} - uploading in background`);
  } catch (error) {
    console.error('Photo save failed:', error);
    Alert.alert('Error', 'Failed to save photos. Please try again.');
  } finally {
    setIsUploading(false);
  }
};
```

**PhotoCapture props change:**

```typescript
// OLD - photos passed as prop from parent (parsed from JSON)
interface PhotoCaptureProps {
  photos: PhotoType[];
  // ...
}

// NEW - query photos table directly
interface PhotoCaptureProps {
  scheduleId: string;
  type: 'before' | 'after';
  technicianId: string;
  // photos NO LONGER a prop - queried internally
}
```

**Query photos in PhotoCapture:**

```typescript
// Inside PhotoCapture component
const { data: photos = [] } = useQuery<PhotoRecord>(
  `SELECT * FROM photos WHERE scheduleId = ? AND type = ? ORDER BY timestamp ASC`,
  [scheduleId, type]
);
```

### PhotoItem.tsx Changes

**Current:** Checks `photo.status === 'pending'` for loading state

**New:** Checks `photo.cloudinaryUrl === null` for loading state

```typescript
// PhotoItem.tsx - Loading state detection

// OLD
const isPending = photo.status === 'pending';

// NEW - cloudinaryUrl null = loading
const isLoading = photo.cloudinaryUrl === null;
```

**Display logic:**

```typescript
// For loading photos, show local file from attachments
if (isLoading) {
  // Query attachments for local_uri
  const localUri = await getLocalUri(photo.id);
  // Show image from localUri with loading spinner overlay
}

// For uploaded photos, show from Cloudinary
if (photo.cloudinaryUrl) {
  // Show optimized Cloudinary URL
}
```

### SignatureCapture.tsx Changes

**Current flow:**
1. Calls `queue.savePhotoFromUri()` (single)
2. Updates `schedules.signature` JSON column
3. Starts background upload

**New flow:**
1. Calls `queue.queuePhotos()` with single signature
2. That's it!

```typescript
// SignatureCapture.tsx - NEW handleSignature

const handleSignature = async (signatureDataUri: string) => {
  if (!schedule?.id || !signerName.trim() || !system?.attachmentQueue) {
    Alert.alert('Error', 'Missing required information');
    return;
  }

  try {
    setIsSaving(true);
    const queue = system.attachmentQueue;

    // Queue signature - same as photos but with type='signature' and signerName
    const [signatureId] = await queue.queuePhotos([{
      sourceUri: signatureDataUri,
      scheduleId: schedule.id,
      type: 'signature',
      technicianId: technicianId,
      signerName: signerName.trim(),
    }]);

    showToast('Signature saved and will sync when online');
    onSignatureCapture();
  } catch (error) {
    console.error('Signature save failed:', error);
    Alert.alert('Error', 'Failed to save signature. Please try again.');
  } finally {
    setIsSaving(false);
  }
};
```

### InvoiceModal.tsx Changes

**Current:** Queries `schedules.signature` JSON and `attachments` table for signature state

**New:** Query `photos` table for signature directly

```typescript
// InvoiceModal.tsx - Query signature from photos table

// OLD - complex signature detection
const hasSignatureData = useMemo(() => {
  const signature = (schedule as any)?.signature;
  if (!signature) return false;
  const parsed = typeof signature === 'string' ? JSON.parse(signature) : signature;
  return !!parsed;
}, [(schedule as any)?.signature]);

// NEW - simple query from photos table
const { data: signaturePhotos = [] } = useQuery<PhotoRecord>(
  scheduleId
    ? `SELECT * FROM photos WHERE scheduleId = ? AND type = 'signature' ORDER BY timestamp DESC LIMIT 1`
    : `SELECT * FROM photos WHERE 0`,
  [scheduleId || '']
);

const signature = signaturePhotos[0] || null;
const hasSignature = !!signature;
const isSignatureUploading = signature && signature.cloudinaryUrl === null;
```

---

## Error Handling & Retry

### Cloudinary Upload Failures

```
Scenario: Upload to Cloudinary fails (network error, timeout)

1. uploadToCloudinary() throws error
2. Attachment stays in QUEUED_UPLOAD state
3. On next processQueue() call (triggered by app activity or sync interval):
   - Same attachment is picked up again
   - Retries upload
4. Retry loop continues until success
```

### PowerSync Sync Failures

```
Scenario: Batch API call to /api/photos fails

1. BackendConnector.uploadData() throws error
2. PowerSync keeps transaction in queue
3. On next sync attempt (automatic):
   - Same transaction is processed
   - Retries batch API call
4. PowerSync handles exponential backoff automatically
```

### Duplicate Upload Prevention

```typescript
// At start of uploadToCloudinary()
const [photo] = await this.powersync.getAll(
  `SELECT cloudinaryUrl FROM photos WHERE id = ?`,
  [attachment.id]
);

if (photo?.cloudinaryUrl) {
  // Already uploaded in previous attempt
  // Mark as synced and return (no duplicate upload)
  await this.markAsSynced(attachment.id);
  return;
}
```

---

## Migration Steps

### Phase 1: Backend (Already Done)
- ✅ `/api/photos` route handles batch POST/GET/DELETE
- ✅ Accepts client-provided IDs (valid ObjectId format)
- ✅ GET filters by `cloudinaryUrl: { $ne: null }`
- ✅ Returns `ids` array in response

### Phase 2: App Schema
1. ADD `photos` table to schema
2. REMOVE `add_photo_operations` table
3. REMOVE `delete_photo_operations` table
4. REMOVE `photos` column from `schedules` table
5. REMOVE `signature` column from `schedules` table
6. SIMPLIFY `attachments` table

### Phase 3: Utils
1. CREATE `utils/objectId.ts` for MongoDB-compatible ID generation

### Phase 4: Core Services
1. REWRITE `PhotoAttachmentQueue.ts` (batch + parallel uploads)
2. SIMPLIFY `CloudinaryStorageAdapter.ts`
3. UPDATE `BackendConnector.ts` (batch photo operations)
4. UPDATE `ApiClient.ts` (add batch methods, remove old methods)
5. DELETE `BackgroundUploadService.ts`

### Phase 5: UI Components
1. UPDATE `PhotoCapture.tsx` - Use `queuePhotos()`, query `photos` table
2. UPDATE `PhotoItem.tsx` - Check `cloudinaryUrl === null` for loading
3. UPDATE `SignatureCapture.tsx` - Use `queuePhotos()` with type='signature'
4. UPDATE `InvoiceModal.tsx` - Query `photos` table for signature

### Phase 6: Cleanup
1. Remove unused imports and methods
2. Run `npm run lint:types`
3. Test all photo flows

---

## Implementation Checklist

### Phase 1: Backend
- [x] `/api/photos` POST endpoint with bulkWrite
- [x] `/api/photos` DELETE endpoint with Cloudinary cleanup
- [x] GET filters `cloudinaryUrl: { $ne: null }`
- [ ] Update sync rules to include `photos` table

### Phase 2: App Schema (schema.ts)
- [ ] ADD `photos` table definition
- [ ] REMOVE `add_photo_operations` table
- [ ] REMOVE `delete_photo_operations` table
- [ ] REMOVE `photos` column from `schedules`
- [ ] REMOVE `signature` column from `schedules`
- [ ] SIMPLIFY `attachments` table

### Phase 3: Utils
- [ ] CREATE `utils/objectId.ts`

### Phase 4: BackendConnector.ts
- [ ] ADD batch extraction for photo operations
- [ ] ADD call to `batchUpsertPhotos()` for PUT/PATCH operations
- [ ] ADD call to `batchDeletePhotos()` for DELETE operations
- [ ] ADD skip logic for photos in main loop

### Phase 5: ApiClient.ts
- [ ] ADD `batchUpsertPhotos()` method
- [ ] ADD `batchDeletePhotos()` method
- [ ] REMOVE `updatePhotos()` method (if exists)
- [ ] REMOVE `processPhotoAddOperation()` method (if exists)
- [ ] REMOVE `processPhotoDeleteOperation()` method (if exists)

### Phase 6: PhotoAttachmentQueue.ts
- [ ] REWRITE with `queuePhotos()` method
- [ ] ADD parallel upload processing (CONCURRENT_UPLOADS = 10)
- [ ] ADD duplicate upload prevention
- [ ] REMOVE all legacy methods (`saveToQueue`, `batchSaveToQueue`, `savePhotoFromUri`, etc.)

### Phase 7: CloudinaryStorageAdapter.ts
- [ ] SIMPLIFY to minimal implementation
- [ ] REMOVE duplicate methods

### Phase 8: System.ts
- [ ] ENABLE attachment queue sync (syncInterval: 30000)
- [ ] ENABLE performInitialSync: true

### Phase 9: Background Service
- [ ] DELETE `BackgroundUploadService.ts`
- [ ] REMOVE `react-native-background-actions` from package.json (if no longer needed)

### Phase 10: PhotoCapture.tsx
- [ ] REMOVE `handlePhotoSelected` JSON update logic
- [ ] ADD `useQuery` for photos from `photos` table
- [ ] UPDATE to call `queue.queuePhotos()`
- [ ] REMOVE PowerSync transaction for `schedules.photos`
- [ ] REMOVE `checkAndStartBackgroundUpload()` call

### Phase 11: PhotoItem.tsx
- [ ] CHANGE loading detection from `status === 'pending'` to `cloudinaryUrl === null`
- [ ] UPDATE local file resolution to use attachments table

### Phase 12: SignatureCapture.tsx
- [ ] REMOVE `savePhotoFromUri()` call
- [ ] ADD `queuePhotos()` call with type='signature'
- [ ] REMOVE `schedules.signature` JSON update
- [ ] REMOVE `checkAndStartBackgroundUpload()` call

### Phase 13: InvoiceModal.tsx
- [ ] REMOVE signature parsing from `schedules.signature`
- [ ] ADD `useQuery` for signature from `photos` table
- [ ] UPDATE `hasSignature` / `isSignatureUploading` logic

### Phase 14: Cleanup & Testing
- [ ] Remove unused imports across all files
- [ ] Run `npm run lint:types`
- [ ] Test: capture single photo
- [ ] Test: capture 50 photos (batch)
- [ ] Test: capture signature
- [ ] Test: delete photos
- [ ] Test: offline capture + sync when online
- [ ] Test: retry after upload failure

---

## Summary

### Before vs After

| Aspect                  | Before                               | After                      |
| ----------------------- | ------------------------------------ | -------------------------- |
| API calls for 50 photos | 100+ (individual)                    | 2 (batch)                  |
| Upload parallelism      | Sequential (1 at a time)             | Parallel (10 at a time)    |
| Loading state           | `status === 'pending'`               | `cloudinaryUrl === null`   |
| Photo storage           | `schedules.photos` JSON + 2 op tables| `photos` table (synced)    |
| Signature storage       | `schedules.signature` JSON           | `photos` table (type=signature) |
| PhotoAttachmentQueue    | ~578 lines                           | ~200 lines                 |
| Background service      | Separate service file                | Built into queue           |
| Complexity              | High (many code paths)               | Low (single flow)          |

### Key Benefits

1. **Fast batch uploads** - 50 photos in ~2 API calls, not 100
2. **Parallel Cloudinary uploads** - 10x faster than sequential
3. **Instant feedback** - Photos appear immediately with loading state
4. **Simpler code** - ~500 lines removed
5. **Automatic retry** - PowerSync + attachment queue handle failures
6. **Offline-first** - Works offline, syncs when online
7. **Unified storage** - Photos and signatures in same table

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BATCH PHOTO UPLOAD SYSTEM                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ User selects 50 photos / captures signature                            │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                     │                                       │
│                                     ▼                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ PhotoAttachmentQueue.queuePhotos()                                     │ │
│  │ 1. Copy 50 files to local storage (BEFORE transaction)                 │ │
│  │ 2. INSERT 50 into photos (cloudinaryUrl = NULL)                        │ │
│  │ 3. INSERT 50 into attachments (state = QUEUED)                         │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│           │                                              │                  │
│           ▼                                              ▼                  │
│  ┌─────────────────────────┐              ┌─────────────────────────────┐  │
│  │ PowerSync Sync          │              │ processQueue() (background) │  │
│  │ • Batch 50 photos       │              │ • 10 concurrent uploads     │  │
│  │ • POST /api/photos      │              │ • Get signed URLs           │  │
│  │ • cloudinaryUrl = NULL  │              │ • Upload to Cloudinary      │  │
│  └─────────────────────────┘              │ • UPDATE photos with URLs   │  │
│           │                               └─────────────────────────────┘  │
│           ▼                                              │                  │
│  ┌─────────────────────────┐                             │                  │
│  │ Backend /api/photos     │                             │                  │
│  │ • bulkWrite to MongoDB  │◀────────────────────────────┘                  │
│  │ • 50 photos (NULL URLs) │              (After uploads complete,          │
│  └─────────────────────────┘               PowerSync syncs updated URLs)    │
│           │                                                                 │
│           ▼                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ MongoDB: photos collection                                             │ │
│  │ • 50 records with cloudinaryUrl = NULL (loading state)                 │ │
│  │ • GET query filters: cloudinaryUrl != null                             │ │
│  │ • After upload: 50 records with cloudinaryUrl = "https://..."          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Questions Resolved

| Question                | Answer                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| **ID Format**           | MongoDB-compatible ObjectId (24 hex chars). Client generates, backend accepts. |
| **Loading State**       | `cloudinaryUrl = NULL` = loading. Show spinner locally, filter on backend GET. |
| **Offline Display**     | Use `local_uri` from attachments table to show local file.              |
| **Concurrent Uploads**  | 10 concurrent (configurable via `CONCURRENT_UPLOADS`).                  |
| **Batch vs Single**     | Batch only. No single-photo methods needed.                             |
| **Signatures**          | Same `photos` table with `type = 'signature'` and `signerName` field.   |
| **File Copy Timing**    | BEFORE transaction to avoid mixing I/O with DB atomicity.               |
| **API Route**           | Single `/api/photos` handles all operations (POST/GET/DELETE).          |
