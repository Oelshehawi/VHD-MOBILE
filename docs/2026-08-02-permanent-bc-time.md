# Permanent B.C. Time On Mobile

Last updated: 2026-08-02

## Contract

- Persist the service-site timezone as `America/Vancouver`.
- Before `2026-03-08T10:00:00.000Z`, interpret Vancouver instants with the
  runtime's historical Vancouver rules.
- At and after that instant, interpret Vancouver instants with `Etc/GMT+7`
  (permanent UTC-7), independent of the device timezone-data version.
- Preserve every other valid IANA timezone unchanged.
- Never rewrite or shift `scheduledStartAtUtc`.
- Group `00:00-02:59` under the prior service day and keep `03:00+` on the
  current service day.
- Treat arrival-window offsets as display-only and resolve the effective zone
  separately for the start and end instants.

`utils/bcTime.ts` owns effective-timezone selection. Schedule display,
grouping, sorting, photo-history labels, report completion dates, payment dates,
payroll business-date queries, and mobile field-status membership route through
that contract. Location window `startsAtUtc`, `endsAtUtc`, and
`scheduledStartAtUtc` comparisons remain exact-instant arithmetic.

Field Status business-day membership follows the backend's literal B.C.
midnight-to-midnight range. Tracking generation alone extends through the next
day at 2:59 AM so those overnight jobs can register before midnight.

## PowerSync Upgrade

The backend no longer publishes `schedules.startDateTime`, and current schedule
rows contain canonical `scheduledStartAtUtc` plus `timeZone`. The mobile schema
therefore removes `startDateTime` from its declared `schedules` projection and
the runtime no longer falls back to it.

PowerSync applies client schema changes when the database opens. Removing the
declared column makes legacy local data inaccessible to current code; it does
not require an application-authored SQLite migration, does not rename the
canonical column, and does not alter stored UTC values. Depending on the SDK's
internal reconciliation, obsolete physical data may remain until its managed
storage is rebuilt, but no compatibility column needs to remain active.

## Mobile Schedule Ownership

There is no schedule creation or rescheduling UI in the mobile app. The only
local `schedules` updates are:

- `technicianNotes` from the technician-notes control;
- `actualServiceDurationMinutes` from report closeout.

The PowerSync upload connector enforces that ownership with an allowlist. It
accepts schedule patches only, drops inserts/deletes, and strips all other
schedule fields, including
`scheduledStartAtUtc`, `timeZone`, and `arrivalWindowEndOffsetMinutes`, before
an upload can reach `/api/sync`.

## Deployment

This change is TypeScript, JavaScript, tests, documentation, and a PowerSync
client schema projection only. It adds no native dependency or native config,
so an Expo OTA update is sufficient for installed builds on the same runtime
version; a native rebuild is not required.

Deploy backend permanent-time behavior and the PowerSync publication that omits
`startDateTime` first, then publish the mobile OTA immediately. This ensures the
canonical sync contract is authoritative before clients reconcile their local
schema.

Do not bulk-correct existing future visits. Manually review Vancouver schedules
on or after November 1, 2026 against booking correspondence or other independent
evidence. A stored `17:00Z` may be a stale-tzdata 9:00 AM conversion, but it may
also be an intentional 10:00 AM visit under permanent UTC-7.
