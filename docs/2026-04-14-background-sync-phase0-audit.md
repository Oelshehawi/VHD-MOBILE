# Phase 0 Baseline Audit - Background Sync

**Date:** 2026-04-14  
**Plan source:** `docs/2026-04-14-background-sync-phased-implementation-plan.md`  
**Scope:** Phase 0 only

## 1) Pending work tables and states

Confirmed current pending-work model:

- `photos.cloudinaryUrl` is the upload completion signal; `NULL` indicates not uploaded yet.
- `attachments` queue processing reads `state IN (QUEUED_UPLOAD, QUEUED_SYNC)`.
- PowerSync CRUD queue consumption exists via `database.getNextCrudTransaction()`.

Evidence:

- `services/database/schema.ts` defines `photos.cloudinaryUrl` with `NULL = loading` comment.
- `services/database/PhotoAttachmentQueue.ts` selects queued rows by `AttachmentState.QUEUED_UPLOAD` and `AttachmentState.QUEUED_SYNC`.
- `services/database/BackendConnector.ts` uses `database.getNextCrudTransaction()` in `uploadData()`.

## 2) Package versions (current)

From `package.json`:

- `expo-background-task`: `~1.0.10`
- `expo-task-manager`: `~14.0.8`
- `@powersync/react-native`: `^1.24.2`
- `@powersync/attachments`: `^2.4.1`
- `@powersync/op-sqlite`: `^0.7.11`

## 3) `app.config.js` requirements

Confirmed present:

- `expo-background-task` plugin is configured.
- iOS `BGTaskSchedulerPermittedIdentifiers` includes `com.braille71.vhdapp.background-sync`.
- Android data-sync foreground service permissions are already present:
  - `android.permission.FOREGROUND_SERVICE`
  - `android.permission.FOREGROUND_SERVICE_DATA_SYNC`

## 4) Dependency upgrade decision for Phase 0

No dependency upgrade was performed in Phase 0.

Reason:

- Current versions and config satisfy the explicit Phase 0 checklist.
- No Phase 0 TypeScript/runtime blocker was identified that requires version changes.

## Phase 0 deliverable status

- Baseline audit completed and recorded.
- No app/runtime code change required in this phase.
