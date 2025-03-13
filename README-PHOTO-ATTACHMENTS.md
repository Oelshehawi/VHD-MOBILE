# Photo Attachments with PowerSync and Cloudinary

This document explains the complete flow of photo attachments in the VHD-App, using PowerSync's attachment system and Cloudinary for cloud storage.

## Overview

The application uses two coordinated queue systems to handle photos:

1. **PowerSync's Transaction Queue**: Handles database operations (schedules, photo operations)
2. **PowerSync's Attachment Queue**: Handles file uploads/downloads to Cloudinary

These two queues work together to provide a robust offline-first experience for photo management.

## Components

### 1. PhotoAttachmentQueue

Extends `AbstractAttachmentQueue` from `@powersync/attachments` to:

- Track photo metadata (scheduleId, photoId, technicianId, type)
- Handle attachment state changes
- Record photo operations after successful Cloudinary uploads

### 2. CloudinaryStorageAdapter

Implements `StorageAdapter` interface to:

- Get signed upload URLs from `/api/cloudinary-upload` endpoint
- Upload files directly to Cloudinary from the client
- Store the resulting Cloudinary URL for PowerSync to use

### 3. BackendConnector

Handles syncing database operations to the server:

- Processes photo operations (add/delete)
- Calls appropriate API endpoints with Cloudinary URLs

### 4. PhotoGrid Component

Displays photos with appropriate UI states:

- Shows loading indicators for pending uploads (local URLs)
- Displays photo type badges ('Before'/'After')
- Provides delete functionality for both local and remote photos
- Shows timestamp for each photo

## User Interface Handling

The UI intelligently handles both local and remote photo URLs:

### Local Photos (Pending Upload)

- URLs follow the format `local://{attachmentId}`
- Display a loading spinner to indicate pending upload
- Still available for viewing in the gallery
- Can be deleted before upload completes

### Remote Photos (Uploaded to Cloudinary)

- URLs point to Cloudinary (https://res.cloudinary.com/...)
- No loading spinner, displayed normally
- Available for full-screen viewing
- Can be deleted (which will also remove from Cloudinary)

### UI States for Photos

- **Pending**: Just captured, waiting for upload
- **Uploading**: Currently being processed by attachment queue
- **Synced**: Successfully uploaded to Cloudinary
- **Failed**: Upload failed, will be retried

## Complete Data Flow

### Adding Photos

1. **User Captures Photo** (PhotoCapture.tsx)

   - User selects/captures a photo
   - Photo is stored locally in the file system
   - A record is added to the PowerSync `attachments` table with state `QUEUED_UPLOAD`
   - Photo metadata is registered with PhotoAttachmentQueue
   - The schedule's photos array is optimistically updated with a local URL

2. **PowerSync Attachment Queue Processes Upload** (PhotoAttachmentQueue.ts)

   - Detects attachment with `QUEUED_UPLOAD` state
   - Calls CloudinaryStorageAdapter.uploadFile()
   - Gets signed URL from `/api/cloudinary-upload` endpoint
   - Uploads file directly to Cloudinary
   - Updates attachment record with Cloudinary URL and state `SYNCED`

3. **Photo Operation is Recorded** (PhotoAttachmentQueue.ts)

   - Watches for attachments with state `SYNCED`
   - Uses registered metadata to record operation in `add_photo_operations` table
   - Calls any registered callbacks with the Cloudinary URL

4. **PowerSync Transaction Queue Syncs to Server** (BackendConnector.ts)
   - Processes the `add_photo_operations` record
   - Calls `/api/update-photos` endpoint with Cloudinary URL
   - Server updates the database with the permanent URL

### Deleting Photos

1. **User Deletes Photo** (PhotoCapture.tsx)

   - User confirms deletion
   - Photo is removed from schedule's photos array
   - Operation is recorded in `delete_photo_operations` table
   - If local attachment exists, it's deleted from the attachments table

2. **PowerSync Transaction Queue Syncs to Server** (BackendConnector.ts)
   - Processes the `delete_photo_operations` record
   - Calls `/api/deletePhoto` endpoint
   - Server deletes the photo from Cloudinary and updates the database

## Offline Behavior

### When Offline:

1. **Adding Photos**:

   - Photos are stored locally
   - Attachments remain in `QUEUED_UPLOAD` state
   - Photo operations are stored in local PowerSync queue
   - UI shows photos with local URLs

2. **Deleting Photos**:
   - Deletion operations are stored in local PowerSync queue
   - UI immediately reflects the deletion

### When Coming Back Online:

1. **For Uploads**:

   - PowerSync Attachment Queue processes pending uploads
   - Files are uploaded to Cloudinary
   - Photo operations are recorded and synced
   - Local URLs are replaced with Cloudinary URLs

2. **For Deletions**:
   - PowerSync Transaction Queue processes pending deletions
   - Server deletes photos from Cloudinary

## API Endpoints Used

1. `/api/cloudinary-upload`: Returns a signed URL for direct upload to Cloudinary
2. `/api/update-photos`: Updates the database with Cloudinary URLs
3. `/api/deletePhoto`: Deletes photos from Cloudinary and updates the database

## Key Files

- `services/database/PhotoAttachmentQueue.ts`: Manages photo attachments
- `services/storage/CloudinaryStorageAdapter.ts`: Handles Cloudinary uploads
- `services/database/BackendConnector.ts`: Syncs operations to server
- `components/PhotoComponents/PhotoCapture.tsx`: UI for photo capture
- `components/PhotoComponents/PhotoGrid.tsx`: UI for displaying photos
- `services/database/schema.ts`: Database schema with insert-only tables

## Benefits of This Approach

1. **Offline-First**: Users can add/view/delete photos without internet connection
2. **Efficient Uploads**: Direct-to-Cloudinary uploads are faster and more reliable
3. **Audit Trail**: Insert-only tables provide a complete history of operations
4. **Conflict Resolution**: Server can resolve conflicts based on operation history
5. **Reduced Data Transfer**: Only operation data is synced, not full photo arrays

## Implementation Details

### PowerSync Attachments Table

The `attachments` table tracks:

- `id`: Unique identifier
- `filename`: Name of the file
- `state`: Current state (QUEUED_UPLOAD, SYNCED, etc.)
- `local_uri`: Path to local file
- `remote_uri`: Cloudinary URL after upload
- `media_type`: Type of media (image/jpeg)
- `size`: File size in bytes

### Insert-Only Operation Tables

1. **add_photo_operations**:

   - Records when photos are added
   - Includes Cloudinary URL after successful upload

2. **delete_photo_operations**:
   - Records when photos are deleted
   - Processed by BackendConnector during sync

### PhotoAttachmentQueue Callbacks

The PhotoAttachmentQueue provides callbacks:

- `registerAttachmentMetadata`: Associates metadata with an attachment
- `onUploadComplete`: Notifies when an upload completes

## Conclusion

This architecture provides a robust, offline-first approach to photo management. By leveraging PowerSync's transaction and attachment queues, the application can handle photo operations seamlessly whether online or offline.
