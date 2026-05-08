# Mobile Sync Contract: Photo Categories and Equipment Profiles

This document describes the backend shape the mobile app expects for category-based photo documentation.

Mobile uploads mutations through `POST /api/sync`, `PUT /api/sync`, `PATCH /api/sync`, and `DELETE /api/sync` from `services/ApiClient.ts`. Photo inserts and patches are batched by `services/database/BackendConnector.ts`.

## Photos

The existing `photos` table remains schedule-owned. Each recurring visit has its own photos. Previous visit photos are reference material only and must not count toward the current visit.

### Required Existing Fields

```ts
{
  id: string;
  scheduleId: string;
  cloudinaryUrl: string | null;
  type: "before" | "after" | "estimate" | "signature";
  technicianId: string;
  timestamp: string;
  signerName?: string | null;
}
```

### New Optional Fields

```ts
{
  photoCategoryKey?: string | null;
  photoCategoryLabel?: string | null;
  photoCategoryKind?: "hood" | "hoodGroup" | "exhaustFan" | "ecologyUnit" | "other" | null;
}
```

These fields are optional so legacy photos continue to sync. New before/after photos should include them. Signatures and estimate photos may leave them null.

### Photo Category Semantics

`photoCategoryKey` is the stable key used for filtering photos inside a schedule. Suggested keys:

```txt
hoodGroup:<hoodGroup.id>
hood:<hood.id>
exhaustFan:<airMover.id>
ecologyUnit:<airMover.id>
other:<airMover.id>
other:other
fallback:hoods
fallback:exhaust-fans
fallback:other
```

`photoCategoryLabel` snapshots the label shown to the technician at capture time, so old photo galleries remain readable if equipment labels change later.

`photoCategoryKind` controls iconography/grouping. Use `hoodGroup` when a hood group exists. Hoods covered by a hood group should not also be shown as separate category targets.

### Batch Insert Payload

`BackendConnector` batches new photo records:

```http
POST /api/sync
Content-Type: application/json

{
  "table": "photos",
  "operation": "batchPut",
  "data": [
    {
      "id": "665f...",
      "scheduleId": "665a...",
      "cloudinaryUrl": null,
      "type": "before",
      "technicianId": "user_...",
      "timestamp": "2026-05-07T18:21:00.000Z",
      "signerName": null,
      "photoCategoryKey": "hoodGroup:main-line",
      "photoCategoryLabel": "Main hood line",
      "photoCategoryKind": "hoodGroup"
    }
  ]
}
```

### Batch Patch Payload

After Cloudinary upload completes, mobile patches the same row with `cloudinaryUrl`:

```http
PATCH /api/sync
Content-Type: application/json

{
  "table": "photos",
  "operation": "batchPatch",
  "data": [
    {
      "id": "665f...",
      "cloudinaryUrl": "https://res.cloudinary.com/..."
    }
  ]
}
```

The backend should preserve existing `photoCategory*` fields on partial patches.

### Suggested Mongo Schema Addition

```ts
photoCategoryKey: { type: String, trim: true, maxlength: 220, default: null },
photoCategoryLabel: { type: String, trim: true, maxlength: 180, default: null },
photoCategoryKind: {
  type: String,
  enum: ["hood", "hoodGroup", "exhaustFan", "ecologyUnit", "other", null],
  default: null,
},
```

Suggested index:

```ts
PhotoSchema.index({ scheduleId: 1, type: 1, photoCategoryKey: 1 });
```

## Equipment Profiles

Mobile expects `equipmentprofiles` to sync read-only from PowerSync. Arrays should be serialized into SQLite as JSON text.

### Mobile Columns

```ts
{
  id: string;
  profileKey: string;
  serviceJobId: string;
  clientId: string;
  normalizedLocation: string;
  location: string;
  jobTitle?: string | null;
  scopeLabel?: string | null;
  hoods: string;       // JSON HoodEquipment[]
  hoodGroups: string;  // JSON HoodGroup[]
  airMovers: string;   // JSON AirMoverEquipment[]
  lastSourceReportId?: string | null;
  lastSourceScheduleId?: string | null;
  lastObservedAt?: string | null;
  updatedBy?: string | null;
  source?: "report" | "legacyReport" | "admin";
  needsReview?: boolean | number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}
```

### History Matching

For previous visit reference photos, mobile matches by `schedules.serviceJobId`. Backend should keep recurring visits on the same `serviceJobId` and ensure those schedules/photos are included in the user's PowerSync buckets.

