# Location Tracking Backend Plan

Date: 2026-04-30

## Goal

Add backend-owned technician location planning for the VHD mobile app and admin web app. The backend decides when a technician should be trackable for a job, while the mobile app executes geofencing and short scheduled location update windows locally.

This backend is the Vercel-hosted ProjectVHD app using MongoDB and React.

## Decisions From Planning

- Do not use Expo push tokens as part of the MVP location tracking implementation.
- Backend owns the tracking plan; mobile owns actual OS location execution.
- Use geofencing for depot/job arrival and departure events.
- Use short scheduled windows of periodic location updates while the technician is likely traveling.
- Do not run location tracking all day when there are no jobs.
- Do not sync the raw travel time cache to mobile.
- Backend can use the existing travel time cache JSON privately to derive tracking windows.
- Use REST for mobile location pings and geofence events instead of PowerSync CRUD uploads.
- Multiple technicians assigned to the same schedule each get their own tracking window and event stream.
- Add tracking events now, even for MVP, because they are needed for arrival/departure history and future admin notifications.
- Admin push notifications for arrival/late/stale states are future work, not required for the first implementation.
- Add backend PowerSync bucket sync for `equipmentprofiles`; mobile already has the table and read-only UI.

## Naming

Preferred collection/model names:

- `technicianTrackingWindows`: backend-generated, read-only planning data synced to mobile.
- `technicianLocationEvents`: append-only mobile event log.
- `latestTechnicianLocations`: current map state for admin UI.

Avoid `trackingPlan` as the primary name because it is vague. A "tracking window" better describes the bounded time period in which mobile should track.

## Depot

Default depot:

```text
7151 Lindsey Road, Richmond
```

The backend should geocode and cache depot coordinates. The depot should be included in tracking windows as a geofence target.

## Tracking Window Rules

Use travel time to decide pre-job tracking start. Do not use job duration for the pre-job window.

```ts
startsAtUtc = scheduledStartAtUtc - max(60min, travelTimeMinutes + 20min)
```

Use expected job duration for post-job tracking end:

```ts
endsAtUtc = scheduledStartAtUtc + expectedDurationMinutes + 90min
```

Apply a hard cap for unusual long jobs:

```ts
hardCap = scheduledStartAtUtc + 14h
endsAtUtc = min(calculatedEnd, hardCap)
```

Expected duration source priority:

1. Backend average actual service duration if available.
2. Schedule/service job expected duration.
3. Existing `schedule.hours`.
4. Conservative fallback.

Travel time source:

1. Existing travel time cache JSON, matched by origin depot and destination job site.
2. Fresh route/travel-time lookup if cache is stale or missing.
3. Conservative fallback by distance/address class if lookup fails.

## Example Behavior

For a 7 a.m. nearby job:

- Travel time: 25 minutes.
- Tracking starts: 6 a.m. because the 60-minute minimum wins.
- Frequent updates stop/reduce after job geofence arrival.

For a 10 a.m. Whistler job:

- Travel time: 120 minutes.
- Tracking starts around 7:40 a.m. with a 20-minute buffer.
- Admin can see whether the technician is still near Richmond/depot or moving toward Whistler.

For a 10-hour job:

- Pre-job tracking still starts based on travel time.
- During the job, rely mostly on geofence state and sparse heartbeat.
- Do not track for 10 hours before and 10 hours after.

## Geofence Radius Policy

Use different radii by place type:

- Depot: 100-200m.
- Dense Vancouver job site: 100-200m.
- Industrial/commercial site: 150-300m.
- Whistler/rural/GPS-poor site: 300-500m.

Geofence events should be treated as operational signals, not payroll-grade proof.

## Data Model Sketch

### `technicianTrackingWindows`

One row per technician per schedule.

```ts
{
  technicianId: string;
  scheduleId: ObjectId;
  serviceJobId: ObjectId;
  status: "planned" | "active" | "expired" | "cancelled";
  scheduledStartAtUtc: Date;
  timeZone: string;
  startsAtUtc: Date;
  endsAtUtc: Date;
  expectedDurationMinutes: number;
  travelTimeMinutes: number | null;
  depot: {
    address: string;
    lat: number;
    lng: number;
    radiusMeters: number;
  };
  jobSite: {
    address: string;
    lat: number;
    lng: number;
    radiusMeters: number;
  };
  locationUpdateMode: "travel_only";
  pingIntervalSeconds: number;
  distanceIntervalMeters: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

- `{ technicianId: 1, startsAtUtc: 1 }`
- `{ scheduleId: 1, technicianId: 1 }`, unique
- `{ status: 1, startsAtUtc: 1, endsAtUtc: 1 }`

### `technicianLocationEvents`

Append-only events from mobile.

```ts
{
  technicianId: string;
  scheduleId?: ObjectId;
  trackingWindowId?: ObjectId;
  eventType:
    | "location_ping"
    | "geofence_enter"
    | "geofence_exit"
    | "tracking_started"
    | "tracking_stopped"
    | "permission_denied"
    | "location_stale";
  regionType?: "depot" | "job";
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  speedMetersPerSecond?: number;
  headingDegrees?: number;
  recordedAt: Date;
  receivedAt: Date;
  source: "geofence" | "background_location" | "manual" | "system";
  platform?: "ios" | "android";
}
```

Indexes:

- `{ technicianId: 1, recordedAt: -1 }`
- `{ scheduleId: 1, recordedAt: -1 }`
- `{ eventType: 1, recordedAt: -1 }`

Dedupe rule:

- Same `technicianId`, `scheduleId`, `eventType`, and `regionType` within 2-5 minutes can be treated as duplicate/noisy.

### `latestTechnicianLocations`

Current admin map state. This can be a separate collection updated on each event, or a computed API result backed by recent events. A collection is better for fast map rendering.

```ts
{
  technicianId: string;
  scheduleId?: ObjectId;
  trackingWindowId?: ObjectId;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  lastEventType: string;
  lastRecordedAt: Date;
  currentRegion?: "depot" | "job" | "unknown";
  currentStatus:
    | "no_recent_location"
    | "at_depot"
    | "traveling"
    | "at_job"
    | "left_job"
    | "stale"
    | "permission_denied";
}
```

## APIs

### Mobile Tracking Window Sync

PowerSync should publish read-only tracking windows for the signed-in technician only.

Suggested mobile table name:

```text
techniciantrackingwindows
```

Only include active/upcoming windows, for example yesterday through next two days, or any window not yet expired.

### REST Event Ingest

```http
POST /api/mobile/location-events
```

Body:

```ts
{
  trackingWindowId?: string;
  scheduleId?: string;
  eventType: "location_ping" | "geofence_enter" | "geofence_exit" | "tracking_started" | "tracking_stopped" | "permission_denied" | "location_stale";
  regionType?: "depot" | "job";
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  speedMetersPerSecond?: number;
  headingDegrees?: number;
  recordedAt: string;
  source: "geofence" | "background_location" | "manual" | "system";
  platform?: "ios" | "android";
}
```

Server behavior:

- Authenticate with Clerk.
- Resolve `technicianId` from Clerk user id.
- Validate that the technician is assigned to the linked schedule/window.
- Store the event.
- Update `latestTechnicianLocations`.
- Dedupe noisy geofence repeats.
- Return success quickly.

## Cron And Regeneration Strategy

Do not rely on frequent cron as the primary mechanism.

Recommended:

- Daily Vercel cron generates/upserts windows for the next two days.
- Event-driven regeneration runs whenever schedules change.
- Optional self-healing cron can run every 15-60 minutes only if deployment tier and usage make sense.

Regenerate windows when:

- Schedule is created.
- Schedule start time changes.
- Assigned technicians change.
- Job location changes.
- Depot address changes.
- Travel time cache changes or is refreshed.
- Schedule is cancelled/deleted/dead-run status changes in a way that affects tracking.

Vercel notes:

- Hobby/free cron is limited compared with Pro. Daily cron plus event-driven regeneration fits better.
- Cron invocations are function invocations; no-op runs still count as requests/execution.

## Admin Map Behavior

The backend web app should show:

- Depot marker.
- Job site markers.
- Geofence circles.
- Technician markers.
- Marker state:
  - gray: no recent location
  - blue: traveling
  - green: inside job geofence
  - amber: possibly late/stale
  - red: late or no location during active window
- Blinking indicator for fresh events, for example events recorded within the last 5 minutes.
- Tooltip fields:
  - technician name
  - schedule/job title
  - last seen
  - distance from depot
  - distance to job
  - ETA estimate if available
  - current status

## MVP Scope

Backend MVP:

1. Add `technicianTrackingWindows`.
2. Add `technicianLocationEvents`.
3. Add `latestTechnicianLocations`.
4. Add daily two-day tracking window generation.
5. Add event-driven regeneration from schedule changes.
6. Add REST event ingest.
7. Add admin map endpoint or data loader.
8. Add PowerSync bucket sync for `techniciantrackingwindows`.
9. Add PowerSync bucket sync for `equipmentprofiles`.

Deferred:

- Expo push notifications to admins.
- Fine-grained trails and route replay.
- Payroll-grade arrival/departure verification.
- Full-time fleet tracking.
- Syncing raw travel time cache to mobile.
