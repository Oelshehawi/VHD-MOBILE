# Photo Operations with Insert-Only Tables

## Overview

This application uses a special pattern for handling photo operations (add/delete) using PowerSync's "insert-only" tables. This approach offers several advantages:

1. Maintains a clear audit trail of photo operations
2. Prevents race conditions when multiple users modify photos simultaneously
3. Allows robust server-side processing of photo operations
4. Enables better conflict resolution for offline operations

## How It Works

### Database Schema

We use two insert-only tables:

1. **add_photo_operations**: Records when photos are added

   ```typescript
   const add_photo_operations = new Table(
     {
       scheduleId: column.text, // Reference to schedule
       photoId: column.text, // ID of the photo added
       timestamp: column.text, // When the add operation occurred
       technicianId: column.text, // Who added the photo
       type: column.text, // Type of photo ('before'/'after')
       attachmentId: column.text, // Reference to attachment if applicable
       cloudinaryUrl: column.text, // URL returned from Cloudinary after upload
     },
     {
       insertOnly: true,
       indexes: { schedules: ['scheduleId'] },
     }
   );
   ```

2. **delete_photo_operations**: Records when photos are deleted
   ```typescript
   const delete_photo_operations = new Table(
     {
       scheduleId: column.text, // Reference to schedule
       photoId: column.text, // ID of the photo to delete
       timestamp: column.text, // When the delete operation occurred
       technicianId: column.text, // Who deleted the photo
       type: column.text, // Type of photo ('before'/'after')
     },
     {
       insertOnly: true,
       indexes: { schedules: ['scheduleId'] },
     }
   );
   ```

### Workflow with PowerSync Attachments & Cloudinary

The photo upload workflow works as follows:

1. **Capture & Store Local Photo**:

   - User selects/captures a photo
   - Photo is stored locally as a PowerSync attachment
   - Photo is added to the schedule's photos array with a temporary local URL
   - No operation is recorded yet in the insert-only table

2. **Upload to Cloudinary**:

   - PowerSync's attachment system uploads the photo to Cloudinary
   - This happens via the `/api/cloudinary-upload` endpoint that provides a signed URL
   - Cloudinary returns a permanent URL for the uploaded image

3. **Record Operation**:

   - ONLY AFTER successful Cloudinary upload, we record in `add_photo_operations` table
   - The Cloudinary URL is included in this record

   ```typescript
   await recordPhotoAddOperation(
     tx,
     scheduleId,
     photoId,
     technicianId,
     photoType,
     cloudinaryUrl, // The URL returned from Cloudinary
     attachmentId
   );
   ```

4. **Server Processing**:
   - The BackendConnector processes these operations during sync
   - Calls the appropriate API endpoints (/api/update-photos) with the Cloudinary URLs

### Deletion Workflow

For deletions, the process is similar:

1. **Optimistic UI Update**:

   - User confirms deletion
   - Photo is removed from the schedule's photos array
   - Operation is recorded in the `delete_photo_operations` table

2. **Server Processing**:
   - BackendConnector processes the deletion operation during sync
   - Calls the `/api/deletePhoto` endpoint to remove from Cloudinary

### Client-Side Implementation

The delete workflow example:

```typescript
// Delete a photo
await powerSync.writeTransaction(async (tx) => {
  // 1. Update the photos array in the schedule
  const updatedPhotos = {
    ...currentPhotos,
    photos: currentPhotos.photos.filter((p) => p.id !== photoIdToDelete),
  };

  await tx.execute(`UPDATE schedules SET photos = ? WHERE id = ?`, [
    JSON.stringify(updatedPhotos),
    scheduleId,
  ]);

  // 2. Record the operation in the insert-only table
  await recordPhotoDeleteOperation(
    tx,
    scheduleId,
    photoIdToDelete,
    technicianId,
    photoType
  );
});
```

## API Endpoints Used

The application uses these endpoints for photo processing:

1. `/api/cloudinary-upload`: Gets a signed URL for uploading directly to Cloudinary
2. `/api/update-photos`: Updates the database with the permanent Cloudinary URLs
3. `/api/deletePhoto`: Deletes photos from Cloudinary

## Utility Functions

The application provides utility functions to standardize this pattern:

- `recordPhotoAddOperation`: Records a photo addition operation (called AFTER Cloudinary upload)
- `recordPhotoDeleteOperation`: Records a photo deletion operation
- `createOperationId`: Creates a unique ID for operation records

## Best Practices

1. Always use the utility functions to record operations
2. Only record add operations AFTER successful Cloudinary upload
3. Process operations in a transaction with the optimistic UI updates
4. Handle attachments appropriately when deleting photos

## Implementation Details

### Key Files

- `utils/photos.ts` - Utility functions for photo operations
- `components/PhotoComponents/PhotoCapture.tsx` - Example implementation
- `services/database/BackendConnector.ts` - Server-side processing
- `services/database/schema.ts` - Database schema definitions

## Advantages Over Direct Array Modification

Using insert-only tables provides several advantages over directly modifying the photos array:

1. **Clear audit trail**: Each operation is recorded with timestamp and user info
2. **Better conflict resolution**: Server can make final decisions on conflicting operations
3. **More atomic operations**: Each operation is independent and can be processed individually
4. **Simpler server logic**: Server doesn't need to diff arrays to determine what changed
5. **Reduced data transfer**: Only send operation info rather than entire arrays

## Conclusion

This pattern follows best practices for offline-first applications by providing a clear record of user intentions rather than just the final state. By using insert-only tables to record operations, we maintain a complete history of changes while enabling robust server-side processing.
