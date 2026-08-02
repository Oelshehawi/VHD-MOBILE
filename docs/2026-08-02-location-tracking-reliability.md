# Location Tracking Reliability

## Current Contract

- A completed report or saved service duration does not prove that the technician left the job.
- Mobile keeps a completed tracking window active until it observes that window's job-geofence exit or the window expires.
- One native location stream still owns the battery cadence, but each fix is posted for every overlapping live window. The selected window is posted last so it remains the technician's current Field Status context.
- Each phone reports its own authenticated field-staff identity. Technicians sharing a truck remain separate location streams and separate per-job presence records.

## Delivery Guarantees

- Location queue and tracking-state read/modify/write operations are serialized so simultaneous geofence and background-location callbacks cannot overwrite each other.
- HTTP 401 is retryable for location events. A headless task with an expired cached Clerk token queues the event until foreground authentication is available again.
- Routine telemetry is retained for 24 hours and up to 10 failed retries.
- Job/depot geofence enter and exit events are prioritized in the bounded queue, retained for up to 13 days, and are not discarded only because they reached the routine retry limit.
- The backend accepts events up to 14 days old, so the critical-event retention remains inside the server timestamp boundary.

## Capture Guarantees

The delivery guarantees above only matter for samples the app keeps. Measured against the
live database, 7 of 8 tracking windows had unusable ping coverage and only 31% of schedules
with a recorded arrival ever recorded a departure. Upload latency was never above 8 seconds —
the samples were being discarded on the device, not lost in transit.

- The background updates task consumes the **whole** delivered batch, ascending by fix
  timestamp. iOS hands back everything it buffered while the app was suspended; taking only
  the newest fix threw away the samples that prove when the technician arrived (one measured
  case: a 99.5-minute gap, arrival recorded 98 minutes late, as the technician drove away).
- Each buffered fix runs the normal per-window throttle against its **own** timestamp, so a
  dense trail is downsampled back to the configured cadence rather than dropped. At most 60
  reconstructed pings are posted per invocation, newest kept.
- Buffered trail fixes are retained on-device for up to 13 days (inside the backend's 14-day
  bound). The 1-hour staleness bound still applies to any path that cannot vouch for a fix's
  provenance, such as a cached last-known position.
- A whole batch is posted in one request. The backend accepts `{ events: [...] }` (up to 100)
  alongside the single-event body, sorts ascending by `recordedAt`, and ingests sequentially
  so the presence engine's ordering and concurrency guards still hold.
- Deferred updates are requested only in on-site mode. During travel, fixes are delivered as
  they arrive so the live map is not artificially delayed.
- A `geofence_enter` that fires within 90 seconds of regions being registered is marked
  `initialState`. iOS reports the device's current state for a freshly registered region as an
  enter, so relaunching the app while parked on site produces an "arrival" stamped at
  departure time. Those hints are stored as presence evidence but can never confirm a
  transition on their own; two consecutive inside samples still confirm normally.

## Duration Fusion

- Per-technician streams stay separate — correct for the live map and for a split crew.
- The schedule-level rollup is recomputed from every window on the visit: earliest arrival,
  latest departure, fused span. A second phone can only widen the span, never truncate it.
- `geofenceDurationSource` (`single` / `fused`) plus the contributing technician count
  distinguish a duration backed by one reporting phone from one corroborated by the crew.

## Observability

- Every live window reports received-vs-expected ping coverage. Below 50% the window is
  flagged on the Field Status card and list — "tracking is broken" is now distinguishable
  from "the technician is parked and fine".
- `scripts/report-location-ping-coverage.ts` (projectvhd) prints per-window coverage plus
  median and worst ping gaps for the last N days.
- The tracking-window generation cron runs hourly, matching what the code already assumed.

## Accuracy Limits

- The backend presence engine remains authoritative for arrival/departure. It uses GPS accuracy filtering, hysteresis, consecutive samples, and OS geofence hints rather than trusting one noisy fix.
- Operating systems do not guarantee background execution after a force-quit, revoked background/precise location permission, disabled location services, or aggressive battery restrictions.
- An expired headless credential cannot be refreshed without a live Clerk session. Queueing prevents evidence loss, but Field Status can remain delayed until the app next resumes and refreshes authentication.
