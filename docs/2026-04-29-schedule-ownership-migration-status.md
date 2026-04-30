# Schedule Ownership Migration Status

Date: 2026-04-29

## Goal

Align the mobile app with the current ProjectVHD backend contracts for schedule ownership, invoice linkage, reports, equipment profiles, Cloudinary upload metadata, and sync handling.

Work should be implemented one item at a time, with an individual commit after each completed item.

## Decisions

- Do not sync the full `servicejobs` table yet.
- Use synced `schedules.serviceJobId` as the mobile ownership link to backend ServiceJobs.
- Add backend schedule fields already present in ProjectVHD to the mobile PowerSync schema.
- Stop using `schedule.invoiceRef` for mobile invoice lookup and send-invoice behavior.
- Use `Invoice.visitIds` as the mobile invoice-to-visit link.
- Mobile can only send invoices that already exist.
- Reports stay schedule-based: mobile creates reports for `scheduleId`.
- Hide report creation when `requiresReport === false`.
- Add read-only equipment profile sync for technicians.
- Equipment profiles are matched by `schedule.serviceJobId === equipmentProfile.serviceJobId`.
- Always allow the equipment profile UI to be visible; do not hide it solely because `requiresEquipmentProfile === false`.
- Cloudinary upload flow is mostly compatible; update only the schedule date/time metadata source.
- Existing sync failure classification is acceptable for now.

## Implementation Items

### 1. Mobile Schedule Schema

Status: Not started

Add these fields to the mobile `schedules` table and TypeScript schedule types:

- `serviceJobId`
- `scheduledStartAtUtc`
- `timeZone`
- `serviceTypes`
- `requiresReport`
- `requiresEquipmentProfile`
- `affectsRecurrence`
- `isBackfilledHistorical`

Notes:

- Keep `invoiceRef` only as legacy/compatibility data if it continues syncing.
- Do not use `invoiceRef` as the primary invoice link.

### 2. Schedule Time Migration

Status: Not started

Move mobile schedule reads, sorting, filtering, and display away from `startDateTime` and onto:

- `scheduledStartAtUtc`
- `timeZone`

Affected areas include:

- dashboard schedule lists
- schedule calendar/day/week/month views
- report duration calculation
- photo/signature upload metadata
- any route params or helper types still named around `startDateTime`

### 3. Invoice Linkage

Status: Not started

Add invoice linkage fields to the mobile invoice schema/types:

- `visitIds`
- optionally `serviceJobIds`

Lookup rule:

- invoice belongs to a schedule when `invoice.visitIds` contains `schedule.id`

UI rule:

- show “send invoice” only when exactly one linked invoice exists
- hide when none exists
- disable with a simple message if multiple linked invoices exist

### 4. Send Invoice API Call

Status: Not started

Update mobile `ApiClient.sendInvoice()` to send only:

```ts
{
  scheduleId,
  technicianId
}
```

Remove mobile dependency on:

- `invoiceRef`
- `invoiceData`
- `isComplete`

Backend already finds the invoice through `Invoice.visitIds`.

### 5. Report Visibility

Status: Not started

Reports remain linked to schedules on mobile.

UI rule:

- hide report creation when `schedule.requiresReport === false`
- otherwise keep the existing schedule-based report flow

### 6. Equipment Profiles

Status: Not started

Add a read-only synced `equipmentprofiles` table for technician visibility.

Minimum fields:

- `id`
- `serviceJobId`
- `profileKey`
- `location`
- `jobTitle`
- `scopeLabel`
- `hoods`
- `airMovers`
- `needsReview`
- `updatedAt`

Matching rule:

```ts
schedule.serviceJobId === equipmentProfile.serviceJobId
```

UI rule:

- technicians can view profile data
- technicians cannot edit profile data in this migration
- always allow the equipment profile UI to be visible
- if no profile exists, show an empty/alert state instead of hiding the whole area

### 7. Cloudinary Upload Metadata

Status: Not started

Keep the current Cloudinary upload route and signed-upload flow.

Update mobile upload metadata so date/time comes from canonical schedule fields instead of legacy `startDateTime`.

### 8. Sync Failure Handling

Status: Not started

Keep current sync outcome handling.

Only adjust if a migration item exposes a specific user-facing failure that needs clearer handling.

## Deferred

- Full `servicejobs` table sync.
- Technician editing of equipment profiles.
- Mobile invoice creation.
- Visit-specific equipment instructions such as “do not clean this hood today.”
- Admin-side equipment profile editing in mobile.

## Commit Plan

Commit each item separately:

1. Schedule schema fields.
2. Schedule time migration.
3. Invoice `visitIds` lookup.
4. Send invoice API simplification.
5. Report visibility gating.
6. Read-only equipment profile sync and UI.
7. Cloudinary metadata cleanup.
8. Any sync handling polish needed after testing.

## Open Questions

- Should `serviceJobIds` be synced on invoices now, or leave it out until a specific mobile use case needs it?
- For multiple linked invoices, what exact message should the disabled send-invoice state show?
- What should the empty equipment profile state say when no profile exists?
