# PowerSync + Cloudinary Assessment (iOS/Android)

Date: 2026-01-21

## Cloudinary URL usage
- `EXPO_PUBLIC_CLOUDINARY_URL` is read in `services/database/AppConfig.ts`, passed into `new ApiClient(cloudinaryUrl, ...)` in `services/database/BackendConnector.ts`, and then only stored (never referenced) in `services/ApiClient.ts`.
- It is not required for the current upload/download flow.
- If `EXPO_PUBLIC_CLOUDINARY_URL` is set to Cloudinary's `CLOUDINARY_URL` (which includes the API secret), that is unsafe to ship in a client app. Cloudinary states the API secret must never be exposed in client-side code; only the cloud name (and API key) are safe to expose.

## Current data flow (local-first)
- Photos/signatures are written to PowerSync `attachments` via `PhotoAttachmentQueue`.
- Schedules JSON is updated for UI refresh.
- `BackgroundUploadService` uploads directly to Cloudinary and inserts `add_photo_operations` for backend sync via `BackendConnector`.
- This matches a PowerSync pattern: file blobs in external storage, metadata in PowerSync.

## Issues / risks
- Attachments queue is effectively disabled:
  - `syncInterval: 0`, `performInitialSync: false`, and `PhotoAttachmentQueue.init()` avoids `super.init()`.
  - `onAttachmentIdsChange` is a no-op, so attachment tracking is not set up.
  - This means you are bypassing built-in PowerSync attachment syncing, download handling, retry state management, and cache pruning.
- Background reliability:
  - `react-native-background-actions` is best-effort; iOS background execution is limited and Android 12+ restricts background starts without a foreground service notification.
  - Uploads can be interrupted when the app is killed or OS throttles background work.
- Retry loop risk:
  - `MAX_RETRIES` is defined but not used.
  - Failed uploads are reset to `QUEUED_UPLOAD`, causing potential infinite retry loops.
- Local file cleanup:
  - Because the built-in queue is bypassed, old local files can accumulate indefinitely.
- MIME type mismatch:
  - Signature images are PNG but `newAttachmentRecord` sets `media_type: 'image/jpeg'`.
  - Background uploader uses `attachment.media_type` (so signatures may be uploaded with incorrect MIME type).
- `add_photo_operations` insert has no explicit `id`:
  - If the table requires IDs or has constraints, inserts can fail or behave inconsistently.
- Cloud name hard-coded in UI:
  - `components/PhotoComponents/PhotoItem.tsx`, `components/common/FastImageViewer.tsx`, `components/PhotoComponents/JobPhotoHistory.tsx` use a hard-coded Cloudinary cloud name.
  - You already have `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` in `AppConfig`.

## Recommendations
1) Remove `EXPO_PUBLIC_CLOUDINARY_URL` from the mobile app bundle; keep Cloudinary API secret server-side only.
2) Fix signature MIME type: set `media_type: 'image/png'` when `type === 'signature'` (or derive from filename).
3) Implement retry caps and a failure state (e.g., track retry count and move to failed after N attempts).
4) Either:
   - Re-enable the PowerSync attachments queue properly (implement `onAttachmentIdsChange`, call `super.init()`, allow sync interval),
   - Or remove the queue and own cleanup/archival logic explicitly.
5) Add local file cleanup after successful backend confirmation, or use PowerSync attachment archival flow.
6) Replace hard-coded Cloudinary cloud name in UI with `AppConfig.cloudinaryCloudName`.

## Optional improvements
- Use OS-native background transfer mechanisms for reliability:
  - iOS: background URLSession
  - Android: WorkManager
- Consider Expo TaskManager-based periodic tasks for best-effort background sync.

## References (latest docs consulted)
- PowerSync React Native docs
- PowerSync attachments docs
- PowerSync MongoDB docs
- Cloudinary security guidance on API secrets
- react-native-background-actions limitations
