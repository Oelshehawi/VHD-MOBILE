# Background Sync Research and Implementation Plan

**Date:** 2026-04-13
**Status:** Planning
**Related prior plan:** `docs/2026-01-27-background-sync-implementation-plan.md`

## Verdict

The January plan is directionally correct, but it should not be implemented exactly as written.

Use Expo `expo-background-task` with `expo-task-manager` as the primary cross-platform mechanism. Keep the PowerSync community demo pattern of registering work when the app backgrounds and avoiding multiple live PowerSync connections. However, tighten the design around these risks:

- Background execution is best effort. iOS and Android decide when the task actually runs, so this cannot guarantee immediate photo uploads after the user backgrounds the app.
- Expo runs registered JS background tasks through a single native worker, so VHD should use one orchestrator task for PowerSync data and photo uploads rather than adding multiple independent tasks.
- The task must be defined at module top level and imported from app startup code so it is registered when the app is launched in the background.
- The old pseudocode accidentally calls `getNextCrudTransaction()` and then delegates to `uploadData()`, which calls `getNextCrudTransaction()` again. The implementation should process pending CRUD transactions through one code path and loop until there are no pending uploads or the time budget is reached.
- Do not assume PowerSync exposes a generic `fetch` override. Inject `expo/fetch` into this app's REST and Cloudinary network paths. Only use a PowerSync transport override if the installed SDK version documents one.
- Clerk session availability in a headless/background task is a high-risk assumption. Cache the last valid PowerSync/API token in secure storage during foreground use, and verify that the background task can retrieve or refresh it before relying on `getClerkInstance()`.

## Online Research Snapshot

Sources reviewed on 2026-04-13:

- Expo BackgroundTask docs: https://docs.expo.dev/versions/v54.0.0/sdk/background-task/
- Expo TaskManager docs: https://docs.expo.dev/versions/v54.0.0/sdk/task-manager/
- Expo SDK docs for native fetch / `expo/fetch`: https://docs.expo.dev/versions/v54.0.0/sdk/expo/#nativefetch-api
- Expo blog announcing `expo-background-task`: https://expo.dev/blog/goodbye-background-fetch-hello-expo-background-task
- PowerSync Background Syncing docs: https://docs.powersync.com/client-sdks/advanced/background-syncing
- PowerSync Expo background sync demo: https://github.com/powersync-community/powersync-react-native-expo-background-sync
- PowerSync March 2026 changelog: https://www.powersync.com/blog/powersync-changelog-march-2026
- npm package metadata checked with `pnpm view` for `@powersync/react-native`, `@powersync/attachments`, `@powersync/op-sqlite`, and `expo-background-task`.

Package state in this app:

- `expo`: `54.0.17`
- `expo-background-task`: `~1.0.10`
- `expo-task-manager`: `~14.0.8`
- `@powersync/react-native`: `^1.24.2`
- `@powersync/attachments`: `^2.4.1`
- `@powersync/op-sqlite`: `^0.7.11`

Current latest package metadata from npm on 2026-04-13:

- `@powersync/react-native`: `1.33.1`, published 2026-03-30
- `@powersync/attachments`: `2.4.3`, published 2026-02-16
- `@powersync/op-sqlite`: `0.9.5`, published 2026-03-30
- `expo-background-task`: latest is SDK 55 oriented, so use Expo's SDK 54 compatible install flow instead of manually jumping to the SDK 55 package line while the app remains on Expo 54.

## Current Local State

Already configured in `app.config.js`:

- `expo-background-task` plugin exists.
- iOS `UIBackgroundModes` includes `fetch`, `processing`, `remote-notification`, and `location`.
- iOS `BGTaskSchedulerPermittedIdentifiers` includes `com.braille71.vhdapp.background-sync`.
- Android permissions include `WAKE_LOCK`, `FOREGROUND_SERVICE`, and `FOREGROUND_SERVICE_DATA_SYNC`.

Current sync/photo paths:

- `providers/PowerSyncProvider.tsx` initializes foreground PowerSync after Clerk is loaded.
- `services/database/System.ts` creates the main `PowerSyncDatabase`, `BackendConnector`, `CloudinaryStorageAdapter`, and `PhotoAttachmentQueue`.
- `services/database/BackendConnector.ts` uploads local CRUD operations to `/api/sync` through `ApiClient`.
- `services/database/PhotoAttachmentQueue.ts` uploads queued files to Cloudinary and updates `photos.cloudinaryUrl` locally.
- `services/ApiClient.ts` and `PhotoAttachmentQueue.ts` currently use global `fetch` and Clerk's foreground-oriented `getClerkInstance()` token lookup.

## Recommended Architecture

Use one background orchestrator:

```text
app/_layout.tsx imports background task module at top level
  -> TaskManager.defineTask('com.braille71.vhdapp.background-sync') is registered
  -> AppState listener registers task when app backgrounds
  -> AppState listener unregisters task when app returns active
  -> background task opens isolated PowerSync/OPSQLite instances
  -> task drains PowerSync CRUD uploads first
  -> task processes queued photo uploads with expo/fetch
  -> task lets the updated local photo rows sync through PowerSync
  -> task disconnects/cleans up
```

Use one task rather than separate PowerSync and photo tasks because Expo background tasks are run sequentially through a single native worker and the two jobs share the same SQLite database and auth state.

## Files To Create

| File | Purpose |
| --- | --- |
| `services/background/BackgroundSync.ts` | Top-level `TaskManager.defineTask()`, registration helpers, and task orchestration. |
| `services/background/BackgroundSystem.ts` | Isolated background PowerSync, connector, storage adapter, and photo queue setup. |
| `services/background/BackgroundAuth.ts` | Read/write cached background token support, ideally backed by `expo-secure-store`. |
| `services/background/index.ts` | Re-export registration APIs for app lifecycle integration. |

## Files To Modify

| File | Change |
| --- | --- |
| `app/_layout.tsx` | Import the background module at top level and add AppState registration/unregistration inside authenticated app lifecycle. |
| `services/ApiClient.ts` | Accept an injectable `fetch` implementation and an optional token provider. Use it in `/api/sync`, `/api/cloudinaryUpload`, and invoice endpoints. |
| `services/database/BackendConnector.ts` | Accept injected `ApiClient` or constructor options. Add an upload drain helper that does not double-consume `getNextCrudTransaction()`. |
| `services/database/PhotoAttachmentQueue.ts` | Accept an injectable `fetch` implementation and token provider. Use it for signed URL and Cloudinary upload calls. |
| `services/storage/CloudinaryStorageAdapter.ts` | Accept an injectable `fetch` implementation for download calls if used in background. |
| `services/database/System.ts` | Keep foreground system unchanged except for passing explicit foreground dependencies. |

## Implementation Plan

### Phase 1 - Dependency and SDK Alignment

1. Keep Expo packages on SDK 54 compatible versions unless the app is upgraded to Expo SDK 55 as a separate task.
2. Consider upgrading PowerSync packages in a separate dependency PR before or after background work:
   - `@powersync/react-native` from `^1.24.2` to a tested current version.
   - `@powersync/op-sqlite` from `^0.7.11` to the matching current line.
   - `@powersync/attachments` from `^2.4.1` to `^2.4.3` if compatible.
3. Do not combine a major native dependency bump with background-task implementation unless there is a documented PowerSync background fix needed for SDK 54.
4. After any PowerSync bump, run `pnpm install`, `pnpm run lint:types`, `pnpm run lint:eslint`, and physical-device smoke tests for normal foreground sync before enabling background sync.

### Phase 2 - Network Abstraction

Add a narrow fetch type:

```ts
type FetchLike = typeof fetch;
```

Update `ApiClient` constructor:

```ts
constructor(token = '', options?: { fetchImpl?: FetchLike; tokenProvider?: () => Promise<string | null> })
```

Use `this.fetchImpl` instead of global `fetch` in every API request.

Update `PhotoAttachmentQueue` constructor options similarly:

```ts
type PhotoAttachmentQueueOptions = ConstructorParameters<typeof AbstractAttachmentQueue>[0] & {
  fetchImpl?: FetchLike;
  tokenProvider?: () => Promise<string | null>;
};
```

Use `fetchImpl` for:

- `/api/cloudinaryUpload` signed URL requests.
- `https://api.cloudinary.com/.../image/upload` uploads.

For the background system, pass:

```ts
import { fetch as expoFetch } from 'expo/fetch';
```

### Phase 3 - Background Auth

Create `services/background/BackgroundAuth.ts`:

- `getForegroundPowerSyncToken()` attempts Clerk `session.getToken({ template: 'Powersync', skipCache: false })`.
- `cacheBackgroundToken(token)` stores a short-lived token in `expo-secure-store` with timestamp metadata.
- `getBackgroundToken()` first tries Clerk if available, then falls back to the secure-store cached token if it is still inside an acceptable TTL.
- `clearBackgroundToken()` runs on sign-out.

Foreground integration:

- When `BackendConnector.fetchCredentials()` successfully gets a token, cache it for background use.
- When the user signs out, clear it.

Risk to verify:

- If the Clerk token is expired by the time the background task runs, uploads should fail as an auth pause and retry on the next foreground/background opportunity. Do not try to silently use an expired token.

### Phase 4 - BackendConnector Upload Drain

Refactor the upload code so background jobs can drain all pending transactions safely.

Target shape:

```ts
async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;
  await this.processCrudTransaction(transaction);
}

async uploadPendingTransactions(database: AbstractPowerSyncDatabase, deadlineMs: number): Promise<number> {
  let uploaded = 0;
  while (Date.now() < deadlineMs) {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) break;
    await this.processCrudTransaction(transaction);
    uploaded += transaction.crud.length;
  }
  return uploaded;
}
```

Important: do not call `getNextCrudTransaction()` once in `BackgroundSystem.sync()` and then call `uploadData()`, because `uploadData()` currently calls `getNextCrudTransaction()` internally.

### Phase 5 - Background System

Create `services/background/BackgroundSystem.ts` with isolated instances:

```ts
import { fetch as expoFetch } from 'expo/fetch';
import { PowerSyncDatabase } from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';

export class BackgroundSystem {
  async init(): Promise<void>;
  async syncPowerSync(deadlineMs: number): Promise<void>;
  async processPhotoUploads(deadlineMs: number): Promise<void>;
  async disconnect(): Promise<void>;
}
```

Implementation notes:

- Use the same `dbFilename: 'powersync.db'` so the background task sees the same pending local CRUD and attachment rows.
- Create a new `BackendConnector`/`ApiClient` instance configured with `expoFetch` and background token provider.
- Create a new `PhotoAttachmentQueue` configured with the background database, storage adapter, `expoFetch`, and background token provider.
- Do not call `watchUploads()` from the background instance. The task should explicitly call `processQueue()` once or until the deadline.
- Always disconnect in `finally`.

### Phase 6 - Background Task Definition

Create `services/background/BackgroundSync.ts`:

```ts
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';

export const BACKGROUND_SYNC_TASK = 'com.braille71.vhdapp.background-sync';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const deadlineMs = Date.now() + 25_000;
  const system = new BackgroundSystem();

  try {
    await system.init();
    await system.syncPowerSync(deadlineMs);
    await system.processPhotoUploads(deadlineMs);
    await system.syncPowerSync(deadlineMs);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    await system.disconnect().catch(() => {});
  }
});
```

Why sync twice:

- First PowerSync pass uploads non-photo local edits.
- Photo upload pass writes `photos.cloudinaryUrl` locally.
- Second PowerSync pass uploads those `photos` updates to the backend.

Keep the first implementation conservative with a short deadline budget. Increase only after real-device logs show it is safe.

### Phase 7 - App Lifecycle Integration

In `app/_layout.tsx`:

- Add a top-level import of `services/background` so `defineTask()` runs outside React render.
- Add `AppState` listener after Clerk is loaded and the user is signed in.
- Register on `background` or `inactive` transitions.
- Unregister on `active` transition to avoid foreground/background PowerSync connection conflicts.
- Check `BackgroundTask.getStatusAsync()` and `TaskManager.isTaskRegisteredAsync()` before registering.

Registration helper target:

```ts
await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
  minimumInterval: 15
});
```

The existing plan's `minimumInterval: 15` is acceptable: Expo SDK 54 documents `minimumInterval` as an inexact interval in minutes, with a 15-minute minimum. Treat it as a lower bound, not a schedule guarantee.

### Phase 8 - Photo Queue Behavior

Current `PhotoAttachmentQueue.processQueue()` already has an `isProcessing` guard and a batch size of 10.

Change it to support background use:

- Inject `fetchImpl` and `tokenProvider`.
- Avoid `watchUploads()` in background mode.
- Add optional time/deadline control so it can stop cleanly if the background window is nearly over.
- Keep uploads idempotent:
  - If local photo row is gone, remove attachment.
  - If `cloudinaryUrl` already exists, mark attachment synced.
  - If file is missing, throw so the task fails/retries rather than falsely marking synced.

### Phase 9 - Testing Plan

Local checks after code changes:

```bash
pnpm run lint:types
pnpm run lint:eslint
```

Development task trigger:

```ts
await BackgroundTask.triggerTaskWorkerForTestingAsync();
```

Android device test:

```bash
pnpm run android
adb shell dumpsys jobscheduler | grep -A 40 -m 1 -E "JOB #.* com.braille71.VHDApp"
adb shell cmd jobscheduler run -f com.braille71.VHDApp [JOB_ID]
adb logcat | grep "Background Sync"
```

Note: The Android application id in `app.config.js` is `com.braille71.VHDApp`, while the iOS bundle id is `com.braille71.vhdapp`. Use the Android id for `adb jobscheduler` commands.

iOS device test:

```bash
pnpm run ios -- --device
```

Then:

- Queue one invoice/status edit and one photo upload.
- Background the app on a physical iPhone.
- Wait for the OS to run the task.
- Verify Cloudinary has the uploaded image.
- Verify the backend has the updated `photos.cloudinaryUrl` and any pending invoice/schedule changes.
- Confirm the app does not open two competing PowerSync connections when foregrounded again.

## Acceptance Criteria

- Background task is defined at module scope and imported during app startup.
- Task registers only for signed-in users and unregisters when the app returns foreground.
- Background PowerSync instance is isolated from the foreground singleton and always disconnects.
- Background API and Cloudinary requests use injected `expo/fetch`.
- Background auth path works without relying solely on mounted React/Clerk provider state.
- Pending PowerSync CRUD transactions are drained without double-calling `getNextCrudTransaction()`.
- Queued photos upload to Cloudinary in background and resulting local photo updates sync to backend.
- Offline, expired-token, missing-file, and Cloudinary failure cases retry later without corrupting local state.
- `pnpm run lint:types` and `pnpm run lint:eslint` pass.
- Android physical-device/manual jobscheduler test passes.
- iOS physical-device background test passes or documents OS scheduling constraints if it does not trigger immediately.

## Non-Goals

- Guaranteed immediate background upload after every photo capture.
- Long-running continuous foreground service for iOS.
- Separate background workers for each sync domain.
- Expo SDK 55 upgrade in the same change unless explicitly scoped and tested.

## Open Questions

- Does the current Clerk Expo instance reliably expose a valid session in a background-launched JS task, or must secure-store token fallback be the primary path?
- Does `@powersync/react-native` `1.24.2` have any known background/threading issue fixed in later `1.33.x` releases that justifies a pre-implementation upgrade?
- What practical time budget do real devices provide for the photo batch size of 10? If the OS kills long batches, reduce concurrency or batch size for background mode.
- Should background sync be disabled for low battery/data saver states if those signals are available and reliable?
