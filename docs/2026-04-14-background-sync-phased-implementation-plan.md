# Background Sync Phased Implementation Plan

**Date:** 2026-04-14
**Status:** Implementation plan
**Related research:** `docs/2026-04-13-background-sync-research-plan.md`
**Decision:** Ship Expo BackgroundTask first. Defer `react-native-background-actions` until field testing proves scheduled/background execution is too delayed.

## Core Decision

Implement one reusable sync worker first, then wire it to Expo BackgroundTask.

Do not install or integrate `react-native-background-actions` in V1. Keep it as a Phase 2 trigger that can call the same worker if Expo BackgroundTask does not meet field expectations.

Future geofencing/location should also call the same worker directly. Do not depend on a geofence event causing Expo BackgroundTask to run.

## Target Architecture

```text
Shared bounded worker
  runBoundedBackgroundSync({ reason, maxMs })
        |
        |-- drains pending PowerSync CRUD uploads
        |-- processes queued photo uploads
        |-- drains resulting photo CRUD updates
        |-- exits when complete or time budget is reached

Triggers
  V1:
    - app startup recovery
    - app foreground/background transition registration
    - Expo BackgroundTask scheduled maintenance

  Deferred:
    - react-native-background-actions immediate finite completion
    - expo-location background/geofence opportunistic sync
```

The sync worker must be:

- Idempotent: safe to call repeatedly.
- Bounded: stops before the background window is likely exhausted.
- Single-flight: only one background sync run at a time per JS runtime.
- Local-first: local DB state remains the source of truth.
- Retry-safe: failures leave records queued for the next trigger.

## Explicit V1 Scope

In scope:

- Expo BackgroundTask scheduling.
- Reusable bounded sync worker.
- Background-safe network abstraction using injectable `fetch`.
- Background auth fallback using cached Clerk/PowerSync token metadata.
- PowerSync CRUD upload drain refactor.
- PhotoAttachmentQueue background compatibility.
- App startup recovery for leftover pending work.
- Instrumentation logs and basic counters.
- Physical-device Android and iOS test plan.

Out of scope for V1:

- Installing `react-native-background-actions`.
- Android foreground-service notification UX.
- Geofencing/location implementation.
- Guaranteed sync after iOS swipe-kill.
- Expo SDK 55 upgrade.
- Major PowerSync package upgrade unless a blocker is found.

## Success Criteria

V1 is successful if:

- Photos queued while online upload in foreground as they do today.
- Photos left queued after backgrounding are retried by startup recovery and Expo BackgroundTask.
- PowerSync local CRUD operations are drained by the reusable worker.
- A photo upload writes `photos.cloudinaryUrl` locally and that update is uploaded to the backend.
- Background failures do not corrupt local state or mark incomplete uploads as synced.
- No duplicate PowerSync foreground/background connections run at the same time intentionally.
- `pnpm run lint:types` passes.
- Android manual background-task trigger works on a physical/emulator device.
- iOS physical-device test confirms task registration and best-effort execution behavior.

## Phase 0 - Baseline Audit

Goal: record current behavior and avoid changing native dependencies before the worker is safe.

Tasks:

1. Confirm current pending work tables and states:
   - `photos.cloudinaryUrl IS NULL`
   - attachment table rows in `QUEUED_UPLOAD` or `QUEUED_SYNC`
   - PowerSync CRUD queue availability via `getNextCrudTransaction()`
2. Confirm current package versions in `package.json`:
   - `expo-background-task`
   - `expo-task-manager`
   - `@powersync/react-native`
   - `@powersync/attachments`
   - `@powersync/op-sqlite`
3. Confirm `app.config.js` has:
   - `expo-background-task` plugin
   - iOS `BGTaskSchedulerPermittedIdentifiers` including `com.braille71.vhdapp.background-sync`
   - Android data-sync foreground service permissions already present
4. Leave dependency upgrades out of this phase unless TypeScript or runtime behavior proves current versions cannot support the design.

Deliverable:

- No code change required unless the audit reveals a missing config value.

Validation:

```bash
pnpm run lint:types
```

## Phase 1 - Shared Sync Contract

Goal: define one worker API that every trigger can use.

Create:

- `services/background/BackgroundSyncRunner.ts`

Target API:

```ts
export type BackgroundSyncReason =
  | 'app-startup'
  | 'expo-background-task'
  | 'manual-test'
  | 'future-background-actions'
  | 'future-location';

export interface BackgroundSyncOptions {
  reason: BackgroundSyncReason;
  maxMs: number;
}

export interface BackgroundSyncResult {
  reason: BackgroundSyncReason;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  success: boolean;
  powerSyncOpsUploaded: number;
  photoUploadsAttempted: number;
  photoUploadsSucceeded: number;
  stoppedBecause: 'complete' | 'deadline' | 'error' | 'auth-unavailable';
  error?: string;
}

export async function runBoundedBackgroundSync(
  options: BackgroundSyncOptions
): Promise<BackgroundSyncResult>;
```

Implementation rules:

- Apply a module-level single-flight guard.
- Compute `deadlineMs = Date.now() + options.maxMs`.
- Create and own a background system instance inside the runner.
- Always disconnect in `finally`.
- Return structured results and log them with `debugLogger`.

Deliverable:

- Worker contract and stubbed structure, even if later phases fill in the actual sync calls.

Validation:

```bash
pnpm run lint:types
```

## Phase 2 - Injectable Network Layer

Goal: allow background code to use `expo/fetch` without changing foreground behavior.

Modify:

- `services/ApiClient.ts`
- `services/database/PhotoAttachmentQueue.ts`
- `services/storage/CloudinaryStorageAdapter.ts` if background download/read paths use network fetch

Add shared type if useful:

```ts
export type FetchLike = typeof fetch;
export type TokenProvider = () => Promise<string | null>;
```

`ApiClient` target:

```ts
constructor(
  token = '',
  options?: {
    fetchImpl?: FetchLike;
    tokenProvider?: TokenProvider;
  }
)
```

Rules:

- Foreground default remains global `fetch` and Clerk `getClerkInstance()`.
- Background passes `fetch` from `expo/fetch`.
- All current API methods use `this.fetchImpl`:
  - `/api/sync`
  - `/api/cloudinaryUpload`
  - `/api/send-invoice`
- Token provider is preferred when supplied.
- Existing public method behavior remains unchanged.

`PhotoAttachmentQueue` target:

- Accept optional `fetchImpl`.
- Accept optional `tokenProvider`.
- Use injected fetch for signed URL requests and Cloudinary upload requests.
- Preserve current foreground constructor behavior.

Deliverable:

- No background task yet; foreground app should continue behaving the same.

Validation:

```bash
pnpm run lint:types
pnpm run lint:eslint
```

Known repo issue:

- `pnpm run lint:eslint` currently fails because the script invokes `npx eslint` and the repo has no ESLint dependency/config. Fix that separately or record as an existing tooling blocker.

## Phase 3 - Background Auth Cache

Goal: make background auth explicit instead of assuming mounted Clerk context exists.

Create:

- `services/background/BackgroundAuth.ts`

Target API:

```ts
export async function getForegroundPowerSyncToken(): Promise<string | null>;
export async function cacheBackgroundToken(token: string): Promise<void>;
export async function getBackgroundToken(): Promise<string | null>;
export async function clearBackgroundToken(): Promise<void>;
```

Implementation rules:

- Use Clerk first when available.
- Store cached token metadata in `expo-secure-store`.
- Store at minimum:
  - token
  - cachedAt timestamp
- Apply a conservative TTL. Start with 10-15 minutes unless the Clerk JWT template is intentionally extended.
- If no valid token is available, return `null`; do not attempt unauthenticated sync.
- On sign-out, clear cached token.

Modify:

- `services/database/BackendConnector.ts`
- `providers/PowerSyncProvider.tsx` if needed for sign-out cleanup

Integration:

- When `BackendConnector.fetchCredentials()` successfully gets a token, call `cacheBackgroundToken(token)`.
- The background worker uses `getBackgroundToken()` as its token provider.

Deliverable:

- Foreground token cache is populated during normal sync.
- Background code has a deterministic token lookup path.

Validation:

```bash
pnpm run lint:types
```

Manual checks:

- Sign in.
- Let foreground PowerSync initialize.
- Confirm token cache write does not throw.
- Sign out.
- Confirm cache clears.

## Phase 4 - PowerSync Upload Drain Refactor

Goal: let background code drain pending CRUD without double-consuming `getNextCrudTransaction()`.

Modify:

- `services/database/BackendConnector.ts`

Refactor target:

```ts
async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;
  await this.processCrudTransaction(transaction);
}

async uploadPendingTransactions(
  database: AbstractPowerSyncDatabase,
  deadlineMs: number
): Promise<number> {
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

Rules:

- Keep existing business-reject/auth-pause/retryable handling semantics.
- Preserve batching for `photos` PUT/PATCH operations.
- Ensure `transaction.complete()` is called only after all operations in that transaction are accepted or intentionally dropped as business rejects.
- Retryable/auth errors must throw so PowerSync can retry later.

Deliverable:

- Existing foreground `PowerSyncDatabase.connect()` path still uses `uploadData()`.
- Background runner can call `uploadPendingTransactions()`.

Validation:

```bash
pnpm run lint:types
```

Manual checks:

- Create or update a local record while online.
- Confirm foreground sync still uploads.
- Temporarily simulate backend failure and confirm operation is not marked complete.

## Phase 5 - Photo Queue Background Mode

Goal: make photo upload processing deadline-aware and result-aware.

Modify:

- `services/database/PhotoAttachmentQueue.ts`

Add target method or extend existing method:

```ts
async processQueue(options?: {
  deadlineMs?: number;
  maxBatches?: number;
}): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  stoppedBecause: 'empty' | 'deadline' | 'max-batches';
}>;
```

Rules:

- Preserve existing foreground call sites: `processQueue()` with no args still works.
- Before each batch, check deadline.
- Keep batch size at 10 for foreground initially.
- Consider smaller background batch size later only if device testing shows timeouts.
- If `cloudinaryUrl` already exists, mark attachment synced.
- If the local photo row is missing, remove the attachment.
- If local file is missing, throw or count as failure without falsely marking synced.
- After successful Cloudinary upload, update local `photos.cloudinaryUrl` and attachment state in one transaction.

Deliverable:

- Photo queue can run from background worker with a time budget.

Validation:

```bash
pnpm run lint:types
```

Manual checks:

- Queue one photo.
- Run `processQueue()` foreground.
- Confirm Cloudinary upload succeeds.
- Confirm `photos.cloudinaryUrl` is populated.
- Confirm attachment state becomes synced.

## Phase 6 - Background System Instance

Goal: create isolated background PowerSync/queue objects without using the foreground singleton.

Create:

- `services/background/BackgroundSystem.ts`

Target shape:

```ts
export class BackgroundSystem {
  async init(): Promise<void>;
  async uploadPowerSync(deadlineMs: number): Promise<number>;
  async processPhotos(deadlineMs: number): Promise<PhotoQueueResult>;
  async disconnect(): Promise<void>;
}
```

Rules:

- Use the same PowerSync schema.
- Use the same SQLite filename: `powersync.db`.
- Create an `ApiClient` with:
  - `fetchImpl: expoFetch`
  - `tokenProvider: getBackgroundToken`
- Create a `BackendConnector` that uses that background `ApiClient`.
- Create a `PhotoAttachmentQueue` that uses background fetch and token provider.
- Do not call `watchUploads()` in background mode.
- Do not use React context.

Important concurrency rule:

- Register background task when the app goes background.
- Unregister or avoid running it while active.
- Still keep the runner single-flight because app state transitions can race.

Deliverable:

- Background system can initialize and disconnect without rendering React.

Validation:

```bash
pnpm run lint:types
```

Manual check:

- Add a development-only button/log path or temporary debug invocation to initialize and disconnect the background system while the app is active.
- Remove temporary debug UI before shipping unless it belongs in an existing debug screen.

## Phase 7 - Complete Shared Worker

Goal: fill `runBoundedBackgroundSync()` with the real sequence.

Target sequence:

```text
runBoundedBackgroundSync
  -> acquire single-flight lock
  -> init BackgroundSystem
  -> upload PowerSync pending transactions
  -> process queued photo uploads
  -> upload PowerSync pending transactions again
  -> disconnect BackgroundSystem
  -> return result
```

Why the second PowerSync pass exists:

- Photo upload writes `photos.cloudinaryUrl` locally.
- That local update must be uploaded to the backend through PowerSync CRUD.

Rules:

- If no auth token is available, return `auth-unavailable` without clearing local queue.
- If deadline is reached, stop cleanly and leave remaining work queued.
- If Cloudinary upload fails, leave attachment queued for retry.
- If PowerSync upload fails transiently, leave CRUD transaction pending.

Recommended V1 time budgets:

- App startup recovery: `8000ms`
- Expo BackgroundTask: `25000ms`
- Manual test trigger: `25000ms`
- Future background actions: `10000ms` to `25000ms`
- Future location/geofence: `5000ms` to `10000ms`

Deliverable:

- One reusable worker that can be called by all current and future triggers.

Validation:

```bash
pnpm run lint:types
```

Manual checks:

- Call worker with `reason: 'manual-test'`.
- Verify no pending work returns success quickly.
- Queue a photo and call worker.
- Verify Cloudinary and backend state.

## Phase 8 - Expo BackgroundTask Trigger

Goal: wire scheduled background maintenance to the shared worker.

Create:

- `services/background/BackgroundSyncTask.ts`
- `services/background/index.ts`

Task definition rules:

- `TaskManager.defineTask()` must be at module top level.
- The module must be imported during app startup.
- The task body must call `runBoundedBackgroundSync({ reason: 'expo-background-task', maxMs: 25000 })`.
- Return `BackgroundTask.BackgroundTaskResult.Success` only when the worker completes without fatal error.
- Return `Failed` for retryable/fatal errors.

Registration helpers:

```ts
export async function registerBackgroundSyncTask(): Promise<void>;
export async function unregisterBackgroundSyncTask(): Promise<void>;
export async function triggerBackgroundSyncForTesting(): Promise<void>;
```

Registration rules:

- Check `BackgroundTask.getStatusAsync()`.
- Check `TaskManager.isTaskRegisteredAsync()`.
- Register with `minimumInterval: 15`.
- Treat `minimumInterval` as a lower bound, not a guarantee.

Deliverable:

- Background task is defined and registerable.

Validation:

```bash
pnpm run lint:types
```

Manual Android test:

```bash
adb shell dumpsys jobscheduler | grep -A 40 -m 1 -E "JOB #.* com.braille71.VHDApp"
adb shell cmd jobscheduler run -f com.braille71.VHDApp [JOB_ID]
adb logcat | grep "Background Sync"
```

Manual development trigger:

```ts
await BackgroundTask.triggerTaskWorkerForTestingAsync();
```

## Phase 9 - App Lifecycle Integration

Goal: register background maintenance at the right time and run startup recovery.

Modify:

- `app/_layout.tsx`

Add:

- Top-level import of `services/background` so task definition runs.
- Auth-aware lifecycle component inside Clerk provider.
- Startup recovery after signed-in PowerSync initialization is stable.
- AppState listener:
  - on `background` or `inactive`: register background task
  - on `active`: unregister background task or avoid background worker conflict

Suggested component:

```tsx
function BackgroundSyncLifecycle() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    void runBoundedBackgroundSync({ reason: 'app-startup', maxMs: 8000 });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        void registerBackgroundSyncTask();
      }
      if (nextState === 'active') {
        void unregisterBackgroundSyncTask();
      }
    });

    return () => subscription.remove();
  }, [isLoaded, isSignedIn]);

  return null;
}
```

Implementation caution:

- Avoid initializing a background PowerSync instance while foreground PowerSync is actively connecting unless testing proves safe.
- If startup recovery conflicts with foreground PowerSync, defer startup recovery until foreground initialization completes or skip startup recovery while active and rely on foreground queue watchers.

Deliverable:

- Background sync lifecycle is wired into app startup.

Validation:

```bash
pnpm run lint:types
```

Manual checks:

- Launch signed in.
- Confirm no duplicate/looping sync logs.
- Background app.
- Confirm task registration log.
- Foreground app.
- Confirm unregister log.

## Phase 10 - Instrumentation and Debugging

Goal: make field results measurable before deciding whether to add `react-native-background-actions`.

Add logs/counters through `debugLogger`:

- worker reason
- elapsed time
- stopped reason
- pending photo count before/after
- PowerSync ops uploaded
- photo uploads attempted/succeeded/failed
- auth unavailable count
- deadline stop count
- task registration success/failure

Optional debug screen additions:

- Trigger background sync manually.
- Show queued photo count.
- Show last background sync result.
- Show last auth-unavailable reason.

Deliverable:

- Enough data to decide whether V2 is needed.

Validation:

```bash
pnpm run lint:types
```

## Phase 11 - Device Testing

Goal: prove V1 behavior on real platform constraints.

Android:

1. Install development build.
2. Sign in.
3. Queue 1 photo, then 5 photos.
4. Background the app.
5. Force jobscheduler run.
6. Confirm uploads and backend sync.
7. Swipe app from recents and observe vendor behavior.
8. Reopen app and confirm startup recovery drains leftovers.

Commands:

```bash
pnpm run android
adb shell dumpsys jobscheduler | grep -A 40 -m 1 -E "JOB #.* com.braille71.VHDApp"
adb shell cmd jobscheduler run -f com.braille71.VHDApp [JOB_ID]
adb logcat | grep "Background Sync"
```

iOS:

1. Install on physical iPhone.
2. Sign in.
3. Queue 1 photo, then 5 photos.
4. Background the app normally.
5. Wait for OS scheduling; do not expect immediate execution.
6. Use development testing trigger if needed.
7. Swipe-kill app and confirm the plan does not claim this works.
8. Reopen app and confirm startup recovery drains leftovers.

Command:

```bash
pnpm run ios -- --device
```

Acceptance:

- Android manual trigger works.
- iOS task registration works.
- iOS best-effort execution is documented honestly.
- Startup recovery works on both platforms.

## Phase 12 - Decision Gate For React Native Background Actions

Goal: add `react-native-background-actions` only if V1 data proves it is needed.

Add it only if one or more are true:

- More than 10 percent of photo batches remain queued after users background the app for normal field workflows.
- Expo BackgroundTask is too delayed for operational needs.
- Technicians regularly lock/background the app immediately after photo capture and uploads do not finish soon enough.
- Product requirement changes from best-effort recovery to immediate finite background completion.

If approved, V2 scope:

1. Install `react-native-background-actions`.
2. Replace or validate the existing Android service config plugin.
3. Add visible Android notification copy and icon.
4. Add trigger on AppState background only when pending work exists.
5. Call the same `runBoundedBackgroundSync({ reason: 'future-background-actions', maxMs })` worker.
6. Stop the background action immediately when the worker finishes.
7. Keep Expo BackgroundTask as scheduled fallback.

V2 non-goal:

- Do not claim iOS swipe-kill upload completion. This remains unsupported/unreliable.

## Phase 13 - Future Geofencing Integration

Goal: use legitimate location/geofence events as another sync trigger later.

When geofencing is implemented:

- Define location/geofence tasks at module top level.
- Use background permissions only for real technician/job/depot location features.
- On geofence event, record the location/geofence event first.
- Then call:

```ts
await runBoundedBackgroundSync({
  reason: 'future-location',
  maxMs: 5000
});
```

Rules:

- Keep geofence sync budget small.
- Do not upload large photo batches from frequent location updates.
- Prefer syncing small CRUD/location records.
- Let Expo BackgroundTask or app startup handle large photo backlogs.

## Rollback Plan

If background sync causes crashes, duplicate connections, or battery/network issues:

1. Disable task registration in `app/_layout.tsx`.
2. Leave the shared worker code in place but only call it from manual debug or app startup.
3. Keep foreground photo upload behavior untouched.
4. Release a small patch disabling scheduled background execution.

## Implementation Order Summary

1. Baseline audit.
2. Shared worker contract.
3. Injectable fetch/token provider support.
4. Background auth cache.
5. BackendConnector upload drain refactor.
6. PhotoAttachmentQueue deadline/result support.
7. BackgroundSystem isolated instance.
8. Complete shared worker sequence.
9. Expo BackgroundTask definition and helpers.
10. App lifecycle integration.
11. Instrumentation/debug visibility.
12. Android/iOS physical-device testing.
13. Decide whether to add `react-native-background-actions`.
14. Add geofence-triggered opportunistic sync later.

## Final Notes

The important architectural decision is not which trigger runs first. It is that all triggers call the same bounded, idempotent worker. That keeps V1 simple and makes V2 additions low-risk if field testing shows they are needed.
