# Equipment Profile Mobile Implementation Plan

Date: 2026-04-17

## Goal

Move report equipment entry from flat one-time fields into reusable location equipment profiles.

The mobile app should let technicians define a location's hood, filter, fan, and ecology-unit setup once, then reuse that equipment on future reports. Reports should keep a snapshot of the equipment used at submission time so historical reports do not change when the reusable profile changes later.

Photos remain unchanged: before photos, after photos, and job history are still the primary technician workflow.

## Product Decisions

- Equipment should be remembered per client/location and reused on future jobs.
- Reports should store an equipment snapshot, not only a pointer to current equipment.
- Do not model "split hood" as a special hood type for v1.
- Treat each meaningful canopy/section as a hood row when it has separate filters or a useful label.
- Keep `filtersCleaned` as a report-level/location-level field for now.
- Keep filter replacement as notes/recommendations, not invoice automation.
- Save ecology unit manufacturer and model number when known.
- Backend stores reports in Mongo and can accept nested objects/arrays.

## Current Problem

The current report model is too flat:

```ts
equipmentDetails: {
  numberOfHoods?: number;
  numberOfFilters?: number;
  numberOfFans?: number;
  filterTypes?: string;
}
```

This cannot represent:

- Multiple hoods with different filter types.
- A site with one hood containing baffles and another hood containing drawer filters.
- Ecology units with manufacturer/model details.
- Multiple exhaust units.
- Filter replacement notes tied to a specific equipment unit.
- Reusing equipment details across future jobs.

## Target Data Shape

### Reusable Equipment Profile

This is the remembered equipment for a location.

```ts
type LocationEquipmentProfile = {
  id: string;
  clientId?: string;
  locationId?: string;
  jobTitle?: string;
  location?: string;
  hoods: HoodEquipment[];
  airMovers: AirMoverEquipment[];
  updatedAt: string;
  updatedBy: string;
};
```

### Report Equipment Snapshot

Reports should store the equipment state used for that visit.

```ts
type ReportEquipmentSnapshot = {
  profileId?: string;
  hoods: HoodEquipment[];
  airMovers: AirMoverEquipment[];
};
```

### Hood Equipment

Do not add a split hood flag in v1. If a split hood has two useful sections, enter them as separate hood records with clear labels.

```ts
type HoodEquipment = {
  id: string;
  label: string;
  filterGroups: FilterGroup[];
  notes?: string;
};
```

Example:

```json
{
  "id": "hood_1",
  "label": "Hood 1",
  "filterGroups": [
    { "type": "baffle", "quantity": 7 }
  ]
}
```

### Air Mover Equipment

Use `airMovers` instead of only `fans` because ecology units need their own equipment details.

```ts
type AirMoverEquipment = {
  id: string;
  label: string;
  type: 'exhaustFan' | 'ecologyUnit' | 'muaUnit' | 'other';
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  filterGroups?: FilterGroup[];
  filterReplacementNeeded?: boolean;
  notes?: string;
};
```

Example:

```json
{
  "id": "unit_1",
  "label": "Ecology Unit 1",
  "type": "ecologyUnit",
  "manufacturer": "CaptiveAIRE",
  "modelNumber": "ABC-123",
  "filterGroups": [
    { "type": "mesh", "quantity": 4 }
  ],
  "filterReplacementNeeded": true,
  "notes": "Replace filters next service."
}
```

### Filter Groups

Use structured filter groups instead of `filterTypes` as a flat string.

```ts
type FilterGroup = {
  type: string;
  quantity: number;
  notes?: string;
};
```

Known mobile options:

```ts
type KnownFilterType =
  | 'baffle'
  | 'mesh'
  | 'singleDrawer'
  | 'doubleDrawer'
  | 'longDrawer';
```

If the technician selects "Other", store the typed text directly in `type`. Do not send `"other"` as the persisted filter type unless the user literally typed that.

## Report Shape

The report should keep existing cleaning and inspection fields, plus an equipment snapshot.

```ts
type ReportSavePayload = {
  scheduleId: string;
  invoiceId: string;
  technicianId: string;
  dateCompleted: string;
  reportStatus: 'draft' | 'in_progress' | 'completed';
  jobTitle?: string;
  location?: string;
  cookingVolume: 'High' | 'Medium' | 'Low';
  recommendedCleaningFrequency?: number;
  comments?: string;
  cleaningDetails?: {
    hoodCleaned?: boolean | null;
    filtersCleaned?: boolean | null;
    ductworkCleaned?: boolean | null;
    fanCleaned?: boolean | null;
  };
  inspectionItems?: {
    adequateAccessPanels?: TriState;
    safeAccessToFan?: TriState;
    fanAccessReason?: string;
  };
  equipmentSnapshot?: ReportEquipmentSnapshot;
};
```

## Mobile UX Plan

### First Visit With No Saved Equipment

1. Report screen loads with no profile.
2. Show an "Equipment Setup" section before the cleaning questions.
3. Technician adds hoods.
4. Technician adds filter groups per hood.
5. Technician adds exhaust fans/ecology units.
6. Technician submits report.
7. App sends report snapshot and asks backend to save/update the reusable equipment profile.

### Future Visits

1. Report screen loads saved equipment profile for the client/location.
2. Equipment section is prefilled.
3. Technician confirms or edits only if equipment changed.
4. Report stores a snapshot.
5. If edited, backend updates the reusable profile.

### Keep The Technician Flow Light

The report screen should not become a full inspection app. For v1:

- Hoods: label, filter groups, notes.
- Air movers: label, type, manufacturer/model for ecology units, filter groups if applicable, notes.
- Photos remain before/after only.
- Cleaning flags remain report-level.
- No per-hood cleaning completion.
- No per-photo equipment tagging.
- No invoice automation from filter replacement notes.

## Mobile Implementation Phases

### Phase 1: Types And Local Schema

Add mobile types:

- `FilterGroup`
- `HoodEquipment`
- `AirMoverEquipment`
- `ReportEquipmentSnapshot`
- `LocationEquipmentProfile`

Update report payload typing to use `equipmentSnapshot`.

PowerSync options:

- Keep `reports.equipmentDetails` temporarily for legacy fields.
- Add `reports.equipmentSnapshot` as JSON text when backend contract is ready.
- Add a local `equipmentProfiles` table only if backend will sync profiles through PowerSync.

Recommended local table if profiles sync to mobile:

```ts
const equipmentprofiles = new Table(
  {
    clientId: column.text,
    locationId: column.text,
    jobTitle: column.text,
    location: column.text,
    hoods: column.text,
    airMovers: column.text,
    updatedAt: column.text,
    updatedBy: column.text
  },
  { indexes: { locations: ['locationId'], clients: ['clientId'] } }
);
```

### Phase 2: Read Existing Equipment Profile

On `app/report.tsx`:

- Query equipment profile by stable backend key.
- Preferred key: `locationId`.
- Fallback key if backend does not have location IDs yet: backend-managed profile lookup using schedule/invoice/client/location.

Open question: the backend must define the stable location identity. Avoid using raw address strings as the only long-term key if possible.

### Phase 3: Equipment Editor UI

Create focused components:

- `components/report/EquipmentProfileEditor.tsx`
- `components/report/HoodEquipmentCard.tsx`
- `components/report/AirMoverEquipmentCard.tsx`
- `components/report/FilterGroupEditor.tsx`

Keep UI behavior simple:

- Add hood.
- Remove hood.
- Edit hood label.
- Add/edit/remove filter group.
- Add air mover.
- Choose air mover type.
- If `ecologyUnit`, show manufacturer/model fields.
- Add replacement note or toggle.

### Phase 4: Submit Payload

On draft/save/submit:

- Build `equipmentSnapshot` from the editor state.
- Include `profileId` if known.
- Keep existing `cleaningDetails` and `inspectionItems`.
- Send `equipmentSnapshot` with the report.
- If backend wants profile updates separately, call/save a profile mutation in the same transaction pattern.

Important: report submission should not depend on photos being tagged to equipment.

### Phase 5: Legacy Compatibility

During transition:

- Read existing flat `equipmentDetails`.
- If no profile exists, optionally convert flat fields into a rough starter editor state.
- Mark inferred data as editable and expect tech confirmation.
- Keep old reports readable.
- Do not rewrite legacy reports unless backend/admin reporting requires it.

Example rough conversion:

```json
{
  "hoods": [
    {
      "id": "legacy_hood_1",
      "label": "Hood 1",
      "filterGroups": [
        {
          "type": "legacy filterTypes value",
          "quantity": "legacy numberOfFilters"
        }
      ]
    }
  ],
  "airMovers": [
    {
      "id": "legacy_fan_1",
      "label": "Fan 1",
      "type": "exhaustFan"
    }
  ]
}
```

## Validation Rules

Mobile should validate before submit:

- At least one hood or one air mover exists once equipment setup is required.
- Hood labels are non-empty.
- Filter group quantities are positive integers.
- Filter group types are non-empty strings.
- Air mover labels are non-empty.
- Air mover type is selected.
- Ecology unit manufacturer/model are optional, but visible and encouraged.
- If fan access is `No`, air mover details should still be allowed to be incomplete.

Backend should repeat validation. Mobile validation is for user experience, not trust.

## Current Interim Code Note

The current mobile diff recently changed flat report `equipmentDetails.filterTypes` to a single string and added `mesh`.

When implementing this plan, do not extend that flat field further. Replace the flat equipment section with structured `filterGroups`, `hoods`, and `airMovers` once backend confirms the contract.

## Open Questions For Backend/Product

1. What is the stable location key: `locationId`, `clientId + locationId`, invoice location, schedule location, or something else?
2. Should equipment profiles sync through PowerSync as a table, or should the report screen fetch/update them through API calls?
3. Should backend update equipment profile automatically whenever a submitted report snapshot differs from the profile?
4. Should backend keep profile version history?
5. How should legacy flat report `equipmentDetails` be exposed to the mobile app after the new schema ships?
6. Should ecology unit filter replacements be first-class structured fields or notes only for v1?
7. Should admins be able to edit equipment profiles outside the mobile app?

## Copyable Backend Assessment Prompt

```text
We need your feasibility review for a product/schema change in our Expo/React Native field app and Mongo-backed sync backend.

Business context:
We are an exhaust hood cleaning business. A client location can have multiple hoods with different filter setups. Example: one site may have Hood 1 with 7 baffle filters, plus another hood/section with 2 double drawer filters, plus another with 5 single drawer filters. Some locations also have exhaust fans or ecology units such as SpringAir or CaptiveAIRE units. Ecology units may have manufacturer/model numbers and filters that may need replacement. Equipment rarely changes, so we want to remember it and reuse it on future jobs.

Product decision:
Photos stay as they are today: before photos, after photos, and job history. We are not tagging photos to individual equipment in v1.

Proposed model:
Create a persistent equipment profile for a client/location, and have each report store an equipment snapshot copied from that profile at submit time.

Reusable equipment profile:

type LocationEquipmentProfile = {
  id: string;
  clientId?: string;
  locationId?: string;
  jobTitle?: string;
  location?: string;
  hoods: HoodEquipment[];
  airMovers: AirMoverEquipment[];
  updatedAt: string;
  updatedBy: string;
};

Report snapshot:

type ReportEquipmentSnapshot = {
  profileId?: string;
  hoods: HoodEquipment[];
  airMovers: AirMoverEquipment[];
};

Hood:

type HoodEquipment = {
  id: string;
  label: string;
  filterGroups: FilterGroup[];
  notes?: string;
};

Air mover:

type AirMoverEquipment = {
  id: string;
  label: string;
  type: 'exhaustFan' | 'ecologyUnit' | 'muaUnit' | 'other';
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  filterGroups?: FilterGroup[];
  filterReplacementNeeded?: boolean;
  notes?: string;
};

Filter group:

type FilterGroup = {
  type: string;
  quantity: number;
  notes?: string;
};

Known filter options on mobile:
baffle, mesh, singleDrawer, doubleDrawer, longDrawer.

If mobile user selects Other, mobile will send the typed text directly as FilterGroup.type. It will not send "other" as the stored filter type.

Report behavior:
- Mobile loads the saved equipment profile for the job location.
- First visit may have no profile, so tech enters equipment.
- Future visits auto-fill the equipment profile.
- Submitted report stores equipmentSnapshot.
- If tech edits equipment during report, backend should update the reusable equipment profile as appropriate.
- Existing report cleaningDetails and inspectionItems stay report-level.
- filtersCleaned remains one global report-level flag for the location in v1.
- Filter replacements are notes/recommendations only in v1, not invoice automation.

Please assess:
1. What should be the stable key for equipment profiles? Do we have a real locationId, or should we create one?
2. Should equipmentProfiles be synced through PowerSync as a table, or handled through API calls from the report screen?
3. Can reports accept a nested equipmentSnapshot object in Mongo?
4. Should profile updates happen automatically when a submitted report snapshot differs, or through a separate explicit mutation?
5. What validation should backend enforce for hoods, airMovers, and filterGroups?
6. How should we handle legacy flat report equipmentDetails fields: numberOfHoods, numberOfFilters, numberOfFans, filterTypes?
7. Can we keep old reports unchanged and only use the new schema going forward?
8. Do we need equipment profile version history, or is report-level equipmentSnapshot enough?
9. What migration steps are safest?
10. What exact request/response contract should mobile implement?

Please propose the backend schema, sync/API contract, validation rules, legacy compatibility approach, and migration plan.
```

