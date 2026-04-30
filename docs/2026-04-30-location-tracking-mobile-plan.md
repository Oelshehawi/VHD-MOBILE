# Location Tracking Mobile Plan

Date: 2026-04-30

## Goal

Add battery-conscious location tracking to the Expo mobile app for iOS and Android. The backend decides the tracking windows; the mobile app executes geofencing and short background location updates locally, then sends events to the backend over REST.

## Decisions From Planning

- Do not use Expo push tokens for MVP location tracking startup.
- Backend owns the technician tracking windows.
- Mobile executes tracking locally because only the phone OS can reliably run location services.
- Use geofencing for depot/job arrival and departure.
- Use periodic background location updates only during short travel windows.
- Do not track all day when there are no jobs.
- Do not sync raw travel time cache to mobile.
- Mobile syncs derived `techniciantrackingwindows`.
- Mobile sends location pings and geofence events through REST.
- Multiple technicians on one schedule each run their own tracking window and send their own events.
- Add geofence events in MVP because they unlock arrival/departure status and future admin notifications.
- Keep location tracking separate from the existing Expo push token implementation.

## Mobile Data

Add a read-only PowerSync table:

```text
techniciantrackingwindows
```

Expected fields:

```ts
{
  id: string;
  technicianId: string;
  scheduleId: string;
  serviceJobId: string;
  status: "planned" | "active" | "expired" | "cancelled";
  scheduledStartAtUtc: string;
  timeZone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  expectedDurationMinutes: number;
  travelTimeMinutes?: number | null;
  depot: string;   // JSON: { address, lat, lng, radiusMeters }
  jobSite: string; // JSON: { address, lat, lng, radiusMeters }
  locationUpdateMode: "travel_only";
  pingIntervalSeconds: number;
  distanceIntervalMeters: number;
  updatedAt: string;
}
```

Mobile should sync only windows for the current Clerk user.

## Location Modes

### No Jobs / No Active Windows

- Do not run background location updates.
- Remove expired job geofences.
- Keep no more than the relevant depot/today job geofences.

### Before Travel Window

- Register geofences for depot and upcoming job sites.
- Do not run periodic location updates yet.

### Active Travel Window

Start background location updates when local time is inside:

```ts
startsAtUtc <= now <= scheduledStartAtUtc
```

Default update behavior:

- Balanced/low power accuracy.
- Time interval: 5-10 minutes.
- Distance interval: 500-1000m.
- Send `location_ping` events to backend.

### Inside Job Geofence

On job geofence enter:

- Send `geofence_enter`.
- Stop or reduce frequent periodic pings.
- Keep job geofence active for exit.
- Optional sparse heartbeat every 30-60 minutes for very long jobs.

On job geofence exit:

- Send `geofence_exit`.
- Stop tracking if the job is complete or the window has ended.

### After Window End

Stop background location updates when:

- `now > endsAtUtc`, or
- job has completion/signature/report signal and job geofence exit occurred, or
- window status becomes `cancelled` or `expired`.

## Geofence Policy

Register:

- Depot geofence.
- Current and upcoming job site geofences.

Do not register every future job. iOS has a low region monitoring limit, so mobile should keep the registered set small.

Suggested radii:

- Depot: 100-200m.
- Dense Vancouver job site: 100-200m.
- Industrial/commercial site: 150-300m.
- Whistler/rural/GPS-poor site: 300-500m.

Backend should provide the chosen radius in each tracking window.

## Events Sent To Backend

Use REST instead of PowerSync CRUD for location event uploads.

Endpoint:

```http
POST /api/mobile/location-events
```

Event body:

```ts
{
  trackingWindowId?: string;
  scheduleId?: string;
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
  recordedAt: string;
  source: "geofence" | "background_location" | "manual" | "system";
  platform: "ios" | "android";
}
```

Queue failed event POSTs locally and retry. Do not block normal app usage on a failed event upload.

## Permissions

The app must request location permissions clearly.

Needed permissions:

- Foreground location.
- Background location / Always location for geofencing and background updates.

User-facing explanation should be specific:

- Tracking only runs around scheduled jobs.
- It helps dispatch see whether technicians are near depot/job sites and likely to arrive on time.
- It is not intended as full-time tracking.

Handle denial:

- Send `permission_denied` event if possible.
- Show an in-app state explaining that location is disabled.
- Do not crash or block schedules/photos/invoices.

## Expo Implementation Notes

Use:

- `expo-location`
- `expo-task-manager`

Mobile tasks:

- Background location update task.
- Geofence enter/exit task.
- Tracking window coordinator that starts/stops tasks based on synced windows and local time.

Testing:

- Real background behavior needs a development or production build.
- Expo Go is not sufficient for full background location validation.
- Test iOS and Android separately because permission flows and background behavior differ.

## Local Coordinator

Add a location tracking service responsible for:

1. Reading active/upcoming `techniciantrackingwindows`.
2. Registering the smallest useful set of geofences.
3. Starting background location updates inside active travel windows.
4. Stopping updates when windows end.
5. Posting events to backend.
6. Retrying failed event uploads.
7. Avoiding duplicate task registration.

Pseudo-state machine:

```ts
if (!hasLocationPermission) {
  postPermissionDenied();
  stopLocationUpdates();
  return;
}

syncRelevantGeofences(windows);

const activeTravelWindow = findWindowWhere(
  window.startsAtUtc <= now &&
  now <= window.scheduledStartAtUtc
);

if (activeTravelWindow) {
  startBackgroundLocationUpdates(activeTravelWindow);
} else {
  stopBackgroundLocationUpdatesIfNoOtherActiveNeed();
}
```

## Map Behavior Enabled By Mobile Events

Mobile sends enough data for the backend web app to display:

- Depot marker.
- Job marker and geofence circle.
- Technician marker.
- Fresh/stale state.
- Blinking marker for recent events.
- Arrival/departure state.
- Distance to depot and job.
- ETA calculation on backend if desired.

## Multiple Technicians

If two technicians are assigned to one schedule:

- Each technician receives their own tracking window.
- Each phone registers the same job geofence.
- Each phone sends separate events with its own Clerk user id.
- Backend dedupes noisy repeats per technician, not across technicians.

## Battery Strategy

Battery protection rules:

- No periodic location outside active windows.
- Use geofences before/after travel instead of continuous GPS.
- Use balanced/low-power accuracy for travel pings.
- Stop frequent pings after job geofence enter.
- Use sparse heartbeat only for long jobs.
- Stop all tracking when no relevant windows remain.

## MVP Scope

Mobile MVP:

1. Add `techniciantrackingwindows` PowerSync table/type.
2. Add location permissions flow.
3. Add geofence registration for depot and active/upcoming job sites.
4. Send `geofence_enter` and `geofence_exit` events to backend.
5. Add background location updates during travel windows.
6. Send sparse `location_ping` events.
7. Queue/retry failed REST event posts.
8. Add basic diagnostics/debug logging for location tracking state.

Deferred:

- Admin push notifications.
- Full route trails.
- User-facing live map in the mobile app.
- Raw travel time cache sync.
- Full-time persistent fleet tracking.
