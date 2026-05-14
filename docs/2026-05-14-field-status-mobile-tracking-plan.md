# Field Status Mobile Tracking Plan

Date: 2026-05-14
Repo: `VHD-App`

## Intent

Mobile should execute the backend Field Status business rules without turning the app into a general live tracker.

The phone should collect depot/job geofence events and sparse travel pings only during relevant current-day tracking windows. It should handle overlapping same-day jobs, direct-to-next-job travel, and late completion sync.

## Shared Contract

For each technician:

1. There is only one selected active travel window at a time.
2. Depot geofences belong only to that selected active travel window.
3. Job geofences may be registered for multiple current-day eligible windows.
4. Entering a later current-day job geofence can advance the local operational context even if an earlier job has not synced completion.
5. iOS requires Always location, Precise location, and Background App Refresh for reliable tracking.

## Mobile Window Model

Split tracking into two layers:

### Selected Travel Window

The selected travel window owns:

- depot enter
- depot exit
- location pings
- tracking started/stopped events

Only one selected travel window should be active per technician.

### Eligible Job Geofence Windows

Eligible job windows own:

- job geofence enter
- job geofence exit
- arrival heartbeat while at that job

Multiple current-day job geofences may be registered so a technician can go directly from one job to the next without backend completion arriving first.

## Selection Rule

Replace earliest-active selection with backend-equivalent selection:

1. Parse relevant synced windows.
2. Ignore cancelled/expired windows.
3. Prefer current-day windows whose travel interval includes now.
4. Among active windows whose scheduled start has started, choose latest `scheduledStartAtUtc`.
5. If no scheduled start has started, choose the nearest upcoming travel window.
6. Do not choose completed windows for live tracking once completion state is synced as expired/cancelled.

This replaces current earliest-window behavior in:

- `LocationTrackingCoordinator.selectActiveTravelWindows`
- `locationTaskShared.getActivePersistedTravelWindows`

## Direct-To-Next-Job Behavior

Example:

- Job A starts 7:00 AM and has a long tracking window ending 2:00 PM.
- Job B starts 11:30 AM.
- Tech finishes Job A but completion has not synced.
- Tech drives directly to Job B and enters Job B geofence.

Expected mobile behavior:

1. Job B job geofence is registered because it is a current-day eligible job window.
2. Job B geofence enter posts `geofence_enter` with Job B schedule/window ids.
3. Mobile marks Job B as arrived locally.
4. Job B becomes the dominant local status context.
5. Travel pings for old Job A no longer suppress Job B.
6. Depot geofence for Job B becomes relevant only if Job B is the selected active travel window and the tech later returns/leaves depot during that window.

## Geofence Registration

Build geofences from two sets:

1. Selected active travel window:
   - depot geofence
   - job geofence
2. Other eligible current-day job windows:
   - job geofence only

Do not register depot geofences for all windows. If all windows had depot geofences, leaving depot could emit exits for several jobs at once.

Keep platform geofence limits in mind. If there are many jobs, sort/cap eligible job geofences by:

1. selected active travel window first
2. active/current-day windows by scheduled start proximity
3. soon upcoming current-day windows

## Local State Changes

Add local persisted state:

- `initialDepotCheckedWindowIds` or `initialDepotCheckedAtByWindowId`
- optional `lastSelectedTravelWindowId`
- optional `dominantJobWindowId` for a job geofence that has claimed current context

Use these to:

- avoid repeating `getCurrentPositionAsync` every coordinator tick
- know when selected window changes
- let job geofence enter advance context

## Initial Depot State

Run initial depot check only for the selected active travel window.

Emit depot `geofence_enter` when:

- selected travel window is active
- initial depot check has not already run for that window
- current location is inside depot radius, using accuracy buffer
- window has not already arrived at job or exited job

Do not run initial depot checks for every eligible job window.

## iOS Permission UX

On iOS, required settings are:

- Location: Always
- Precise Location: On
- Background App Refresh: On

Use `Linking.openSettings()` for the button that opens this app's settings page.

Permission state should detect:

- services disabled
- foreground denied
- background denied
- precise disabled / reduced accuracy

Expo Location exposes iOS accuracy authorization on permission responses. Treat reduced accuracy as not sufficient for geofence tracking.

Platform behavior:

- iOS: show red banner for missing Always, Precise, or location services.
- Android: do not show iPhone-specific copy. Keep Android-specific background permission copy if needed.
- Web/unsupported: no banner.

## PowerSync Edge Cases

The phone may temporarily have:

- future windows synced locally
- expired windows that have not drained yet
- no completion state for a job that is already done
- current-day windows missing until sync catches up

Rules:

- Coordinator should filter to relevant current-day/current-window candidates before selecting live travel.
- Expired/cancelled windows should stop travel tasks.
- Job geofence enter for a current-day window should still be accepted even if an older window is still active on paper.
- Completion sync expiring a window should clean up tasks but should not be required for moving to the next job.

## Tests

Add tests for:

1. selected travel window prefers latest started scheduled window over older overlapping window.
2. persisted active travel selection uses same rule as coordinator.
3. depot geofence is only registered for selected travel window.
4. job geofences are registered for eligible current-day windows.
5. direct-to-next-job geofence enter marks later job arrived.
6. initial depot check runs once per selected window.
7. precise-disabled iOS permission state shows banner.
8. Android does not show iPhone-specific permission copy.

## Implementation Order

1. Add shared mobile selection helper that mirrors backend logic.
2. Replace earliest-active selection in coordinator and persisted task helper.
3. Update geofence building to accept selected travel window plus eligible job windows.
4. Add local state for initial depot check dedupe.
5. Update initial depot check to run only once per selected travel window.
6. Add iOS precise-location permission state.
7. Platform-gate permission banner/modal copy.
8. Add tests.
9. Run `pnpm lint:types` and targeted Jest tests.

## Open Decisions

- Exact cap for eligible job geofences when a technician has many same-day jobs.
- Whether to store `dominantJobWindowId` or derive dominance entirely from arrived/exited window ids.
- Whether selected travel should switch as soon as a later job's travel window opens, or only when its scheduled start has passed. The current recommendation is latest scheduled start that has started, with eligible job geofences handling early arrival.
