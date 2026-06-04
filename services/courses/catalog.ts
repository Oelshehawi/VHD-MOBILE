// Content shape mirrors projectvhd/app/lib/typeDefinitions.ts. Defined inline
// here so the mobile catalog stays a self-contained duplicate (a shared
// web/mobile package is a later optimization, called out but not built).
export type LessonBlock =
  | { type: "markdown"; body: string }
  | {
      type: "video";
      url: string;
      provider: "youtube" | "vimeo" | "cloudinary";
      title?: string;
    };

export interface CourseSectionDefinition {
  sectionId: string;
  moduleNumber: number;
  order: number;
  title: string;
  summary: string;
  estimatedMinutes: number;
  prerequisiteSectionId?: string;
  blocks: LessonBlock[];
}

export interface CourseDefinition {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  category: string;
  estimatedMinutes: number;
  sections: CourseSectionDefinition[];
}

// ---------------------------------------------------------------------------
// Shared course catalog (content-as-code).
//
// Course structure + lesson body live here, NOT in a database. This module is
// framework-agnostic (plain TS, no React) so BOTH projectvhd (web) and VHD-App
// (mobile) can import the same content shape. The mobile app currently keeps a
// duplicate copy at VHD-App/services/courses/catalog.ts — extracting a shared
// package is a later optimization, not built here.
//
// Edit content here and ship via deploy (web) / Expo EAS Update OTA (mobile):
// content edits do NOT require an App Store submission.
//
// The interactive simulators/quizzes from the original `vhd-course` prototype
// were intentionally simplified down to markdown + remote video blocks. A
// multiple-choice quiz block can be added later if wanted.
// ---------------------------------------------------------------------------

const md = (body: string): LessonBlock => ({
  type: "markdown",
  body: body.trim(),
});

const COMMERCIAL_KITCHEN_EXHAUST_CLEANING_SECTIONS: CourseSectionDefinition[] = [
  {
    sectionId: "1.1",
    moduleNumber: 1,
    order: 1,
    title: "Who Governs Us?",
    summary: "Regulatory context and industry oversight.",
    estimatedMinutes: 8,
    blocks: [
      {
        type: "video",
        provider: "youtube",
        url: "https://www.youtube.com/embed/0",
        title: "Module 1 intro — Who governs kitchen exhaust cleaning?",
      },
      md(`
# Who Governs Us?

Kitchen exhaust cleaning (KEC) in British Columbia sits at the intersection of
several authorities. Knowing who they are tells you *why* the rules exist and
*who* you answer to in the field.

## The layers of oversight

- **Provincial legislation** gives professional bodies the authority to regulate
  technicians in order to protect the public interest.
- **ASTTBC** (Applied Science Technologists & Technicians of BC) administers the
  certification that lets you perform and sign off KEC work.
- **Local Authority Having Jurisdiction (AHJ)** — typically the fire department —
  enforces the fire code on the ground and can red-tag a non-compliant system.
- **Insurers** rely on your documentation; a missing or inaccurate report can void
  a restaurant's coverage after a fire.

## Why it matters to you

Every cleaning you perform is a public-safety act. Grease build-up in a hood,
duct, or fan is the leading cause of commercial kitchen fires. The regulatory
stack exists so that the person signing the work is accountable, trained, and
traceable.
`),
    ],
  },
  {
    sectionId: "1.2",
    moduleNumber: 1,
    order: 2,
    title: "Path to CO",
    summary: "Certification path and prerequisites.",
    estimatedMinutes: 8,
    blocks: [
      md(`
# Path to Certified Operator (CO)

Becoming a certified KEC technician is a staged path. You build hours under
supervision, document them, and progress through ASTTBC recognition.

## The endorsement roadmap

1. **Trainee** — work only under the direct supervision of a certified
   technician. Every job you touch is logged.
2. **Logbook hours** — your supervised hours are recorded in a logbook that must
   be accurate and verifiable. Auditors can and do check it.
3. **Certified Operator (CO)** — once your hours and knowledge checks are
   complete, you carry the authority to perform and sign KEC work.

## Logbook discipline

- Record the date, site, scope, and supervisor for every job.
- Never back-fill or estimate hours — a falsified logbook ends a career.
- Keep before/after evidence; it backs up what the logbook claims.
`),
    ],
  },
  {
    sectionId: "1.3",
    moduleNumber: 1,
    order: 3,
    title: "Understanding ASTTBC",
    summary: "ASTTBC framework, scope, and accountability.",
    estimatedMinutes: 8,
    blocks: [
      md(`
# Understanding ASTTBC

ASTTBC registers the technologists and technicians who perform regulated work.
For KEC, it defines what your stamp means and what you are accountable for.

## What your registration carries

- **A defined scope of practice** — you may only sign work you are certified and
  competent to perform.
- **A code of ethics** — honesty in reporting, no signing off work you did not
  inspect, no conflicts of interest.
- **Accountability** — your registration number ties a report back to you.
  Misrepresentation can mean suspension or loss of certification.

## The stamp is a promise

When you tag or report a system as compliant, you are making a professional
declaration that a fire inspector, building owner, and insurer all rely on. Treat
it that way.
`),
    ],
  },
  {
    sectionId: "1.4",
    moduleNumber: 1,
    order: 4,
    title: "BC Fire Code",
    summary: "Core code obligations for KEC technicians.",
    estimatedMinutes: 10,
    blocks: [
      md(`
# BC Fire Code

The BC Fire Code sets the legal floor for commercial kitchen exhaust maintenance.
It tells building owners *that* systems must be kept clean and inspected, and it
points to the standard (NFPA 96) for *how*.

## Core obligations

- **Systems must be inspected and cleaned at an interval matched to cooking
  volume.** High-volume / solid-fuel operations need cleaning far more often than
  a low-use kitchen.
- **Records must be kept** — date of service, the name of who did it, and the
  condition found.
- **Access must be adequate** — the code expects access panels so the entire duct
  run can actually be cleaned.

## Cleaning frequency guidance

| Cooking volume | Typical interval |
| --- | --- |
| Solid fuel (wood/charcoal) | Monthly |
| High volume / 24-hour | Quarterly |
| Moderate volume | Semi-annually |
| Low volume / seasonal | Annually |

These are guidelines — the actual condition of the system always wins. If it's
loaded with grease early, it needs cleaning early.
`),
    ],
  },
  {
    sectionId: "1.5",
    moduleNumber: 1,
    order: 5,
    title: "NFPA 96 Standard",
    summary: "Interpreting and applying NFPA 96 correctly.",
    estimatedMinutes: 10,
    blocks: [
      md(`
# NFPA 96 Standard

NFPA 96 is the *Standard for Ventilation Control and Fire Protection of
Commercial Cooking Operations*. The BC Fire Code points to it; it is the
technician's working rulebook.

## What NFPA 96 requires of a cleaning

- **Clean to bare metal** where build-up exists — surface wiping is not cleaning.
- **The entire system** — hood, filters, plenum, the full duct run, and the fan.
  "Hood-only" cleaning leaves the most dangerous grease in the duct.
- **Inaccessible areas must be noted**, not ignored. If a section can't be reached,
  it is documented as a deficiency and access is recommended.

## Lock-out / tag-out and access

- De-energize and lock out the fan before working on or near it.
- Plan your access points before you start so you don't discover a sealed duct
  halfway through.
- Measure and note grease depth where relevant — it justifies your frequency
  recommendation.
`),
    ],
  },
  {
    sectionId: "1.6",
    moduleNumber: 1,
    order: 6,
    title: "The KEC Report",
    summary: "Deficiency reporting and documentation quality.",
    estimatedMinutes: 10,
    blocks: [
      md(`
# The KEC Report

The report is the deliverable. A perfect cleaning with a poor report is a job
half done — the report is what the owner, AHJ, and insurer actually keep.

## A complete report includes

- **Site, date, and technician identity** (your registration).
- **Scope cleaned** — which hoods, ducts, and fans, and to what standard.
- **Deficiencies found** — missing access panels, inaccessible runs, damaged
  components, excessive build-up between cleanings.
- **Recommendations** — corrective work and a cleaning frequency justified by what
  you observed.
- **Before/after evidence** — photos that match the written findings.

## Writing good deficiencies

- Be specific and factual: *"No access panel on horizontal duct run above
  dishpit; ~3 m of duct inaccessible for cleaning."*
- Tie each deficiency to a recommendation.
- Never describe work you did not perform or inspect.
`),
    ],
  },
  {
    sectionId: "1.7",
    moduleNumber: 1,
    order: 7,
    title: "Tagging Protocol",
    summary: "Field tagging rules, traces, and handoff safety.",
    estimatedMinutes: 9,
    blocks: [
      md(`
# Tagging Protocol

The service tag is the physical record left on the system. An inspector should be
able to read the tag and know who cleaned it, when, and what was found.

## What goes on the tag

- Date of service and next-due date.
- Company and the technician's name / registration.
- Scope of cleaning and any areas left inaccessible.

## Placement and handoff rules

- Place the tag where it is **visible to an inspector** — typically near the hood
  or at the access point, not hidden behind equipment.
- Do not remove or alter a prior tag's history; tags build a trail over time.
- Never tag a system you did not fully service. The tag must match the report.
`),
    ],
  },
  {
    sectionId: "1.8",
    moduleNumber: 1,
    order: 8,
    title: "Final Knowledge Check",
    summary: "Module review and knowledge validation.",
    estimatedMinutes: 12,
    blocks: [
      md(`
# Module 1 — Knowledge Check

Review the key takeaways from Module 1 before moving on to systems.

## You should now be able to explain

- **Who governs KEC** — provincial law, ASTTBC, the local AHJ, and the insurer's
  reliance on your records.
- **The path to Certified Operator** — supervised trainee hours, an honest
  logbook, and knowledge checks.
- **What your ASTTBC registration means** — defined scope, ethics, and personal
  accountability.
- **BC Fire Code obligations** — clean and inspect on a volume-matched interval and
  keep records.
- **NFPA 96** — clean the whole system to bare metal, lock out the fan, and document
  inaccessible areas.
- **The report and the tag** — specific deficiencies tied to recommendations, with
  matching evidence and a visible, truthful service tag.

If any of these are fuzzy, revisit the section before continuing to Module 2.
`),
    ],
  },
  {
    sectionId: "2.1",
    moduleNumber: 2,
    order: 9,
    title: "Types of Hood Systems",
    summary: "System categories and operating constraints.",
    estimatedMinutes: 8,
    blocks: [
      md(`
# Types of Hood Systems

The hood is the capture point. Knowing the type tells you how it behaves and what
to watch for when cleaning.

## Common hood types

- **Type I (grease) hoods** — over cooking that produces grease and smoke
  (fryers, griddles, char-broilers). These are the KEC focus: they connect to
  grease ducts and must meet NFPA 96.
- **Type II (condensate/heat) hoods** — over dishwashers, ovens, and steam.
  No grease duct, but still need cleaning for condensate and lint.

## Filters

- **Baffle filters** are the standard for grease hoods — they force air to change
  direction so grease drops out and drains. They must be UL-listed, intact, and
  reinstalled correctly.
- Replace mesh/aluminum-mesh filters where you find them on grease applications —
  they're a fire risk.
`),
    ],
  },
  {
    sectionId: "2.2",
    moduleNumber: 2,
    order: 10,
    title: "Duct Systems",
    summary: "Layout, inspection points, and risk zones.",
    estimatedMinutes: 8,
    blocks: [
      md(`
# Duct Systems

The duct carries grease-laden vapour from the hood to the fan. It is the highest
fire-risk part of the system because grease collects along its full length —
often where no one can see it.

## What to map before cleaning

- **Horizontal vs vertical runs** — horizontal runs collect grease and need the
  most access points.
- **Direction changes and transitions** — elbows and joints are grease traps.
- **Access panels** — NFPA 96 expects them at intervals along the run and at every
  change of direction. Missing panels are the most common deficiency.

## Risk zones

- Long horizontal runs above ceilings.
- Sealed or drywalled-over duct with no access.
- Joints near combustible building materials.
`),
    ],
  },
  {
    sectionId: "2.3",
    moduleNumber: 2,
    order: 11,
    title: "Exhaust Fans",
    summary: "Fan types, performance checks, and service windows.",
    estimatedMinutes: 8,
    blocks: [
      md(`
# Exhaust Fans

The fan pulls the system. A greased-up or failing fan kills the whole system's
performance and is a fire and roof-hazard point.

## Fan types

- **Upblast roof fans** — the most common rooftop grease fan. The hinged base lets
  you tilt it up to clean the housing and blade.
- **Utility / inline fans** — mounted in the duct run.

## Service checks

- Lock out power before touching the fan.
- Clean the blade, housing, and the area below the fan where grease drips.
- Check the **hinge kit and grease containment** — many roof fires start at a fan
  with no grease cup, dripping onto the roof membrane.
- Note belt condition, bearing noise, and rotation. Report what you can't fix.
`),
    ],
  },
  {
    sectionId: "2.4",
    moduleNumber: 2,
    order: 12,
    title: "Ecology Units",
    summary: "Filtration units, maintenance, and compliance.",
    estimatedMinutes: 9,
    blocks: [
      md(`
# Ecology Units

An ecology (pollution-control) unit is a multi-stage filtration box in the exhaust
path — common where exhaust can't simply vent to atmosphere (mixed-use buildings,
odour/smoke control).

## Stages you'll encounter

- **Baffle / mesh pre-filters** — first-stage grease capture.
- **Bag or panel filters** — finer particulate.
- **HEPA and carbon stages** — fine particulate and odour.
- Some units add **electrostatic precipitator (ESP)** cells.

## Maintenance and compliance

- Each stage has its own service interval; a clogged ecology unit chokes the whole
  system and can shut the kitchen down.
- Record which stages you serviced or replaced.
- A neglected ecology unit is both a performance failure and a fire-load — report
  filter condition honestly.
`),
    ],
  },
  {
    sectionId: "2.5",
    moduleNumber: 2,
    order: 13,
    title: "Knowledge Check",
    summary: "Systems comprehension checkpoint.",
    estimatedMinutes: 12,
    blocks: [
      md(`
# Module 2 — Knowledge Check

Confirm you understand the system end-to-end before moving to procedure.

## You should now be able to identify

- **Hood types** — Type I (grease) vs Type II (condensate/heat) and why baffle
  filters belong on grease hoods.
- **Duct layout** — where grease collects, why access panels matter, and the
  highest-risk runs.
- **Exhaust fans** — upblast vs inline, lock-out before service, and grease
  containment at the fan.
- **Ecology units** — the filtration stages and why a clogged unit is both a
  performance and a fire problem.

The system is only as clean as its dirtiest reachable point. Continue to Module 3
for the cleaning procedure itself.
`),
    ],
  },
  {
    sectionId: "3.1",
    moduleNumber: 3,
    order: 14,
    title: "Pre-Cleaning Setup",
    summary: "Preparation, hazards, and site control.",
    estimatedMinutes: 8,
    blocks: [
      {
        type: "video",
        provider: "youtube",
        url: "https://www.youtube.com/embed/0",
        title: "Module 3 intro — Safe job setup",
      },
      md(`
# Pre-Cleaning Setup

The job is won or lost in setup. Most incidents — slips, burns, electrical, and
property damage — trace back to skipped preparation.

## Site control

- **Coordinate with the kitchen** — equipment must be off and cool. Never clean a
  hot system.
- **Lock out / tag out** the exhaust fan and any powered equipment you'll work
  near.
- **Protect the space** — cover cooking surfaces, floors, and equipment with
  plastic; contain run-off and chemicals.

## Hazards to control

- Hot surfaces and pilot lights.
- Caustic degreasers — wear the right PPE (gloves, eye protection, respiratory as
  needed).
- Working at height for roof fans — fall protection.
- Wet floors and electrical near water.

Walk the system first, plan access, and stage your equipment before any chemical
comes out.
`),
    ],
  },
  {
    sectionId: "3.2",
    moduleNumber: 3,
    order: 15,
    title: "Hood Cleaning",
    summary: "Procedure, tool flow, and quality checks.",
    estimatedMinutes: 9,
    blocks: [
      md(`
# Hood Cleaning

Start at the capture point and work the hood to bare metal.

## Procedure

1. **Remove the filters** and set them to soak/degrease (or hot-tank).
2. **Apply degreaser** to the hood interior and plenum; give it dwell time.
3. **Agitate and scrape** heavy build-up, then pressure-rinse, controlling
   run-off into your containment.
4. **Clean the plenum behind the filters** — a commonly missed grease trap.
5. **Reinstall filters** correctly (baffles oriented to drain).

## Quality checks

- Wipe-test the interior — your cloth should come back clean.
- Light reflects off bare stainless when it's truly clean.
- Confirm the grease trough/cup is clean and draining.
`),
    ],
  },
  {
    sectionId: "3.3",
    moduleNumber: 3,
    order: 16,
    title: "Duct Cleaning",
    summary: "Access planning and contamination removal.",
    estimatedMinutes: 9,
    blocks: [
      md(`
# Duct Cleaning

The duct is the most important and most demanding part of the job. This is where
fires spread and where shortcuts hide.

## Access planning

- Open every access panel along the run; plan additional access where panels are
  missing (and recommend permanent panels in the report).
- Identify horizontal runs and direction changes — they hold the most grease.

## Removal

- Scrape and degrease the full reachable run to bare metal.
- Work top-down where possible so debris and run-off move toward your collection
  point.
- **Document anything you cannot reach.** Inaccessible duct is a reported
  deficiency with a recommendation for access — never paint over it as "cleaned."

## Verify

- Visual + wipe check at each access point.
- Photograph before/after at representative points to back the report.
`),
    ],
  },
  {
    sectionId: "3.4",
    moduleNumber: 3,
    order: 17,
    title: "Fan Cleaning",
    summary: "Final stage cleaning and system restoration.",
    estimatedMinutes: 9,
    blocks: [
      md(`
# Fan Cleaning

The fan is the last stage. Clean it, restore it, and verify the whole system runs.

## Procedure

1. Confirm the fan is still **locked out**.
2. For an upblast roof fan, tilt it up on its hinge to expose the housing and
   blade.
3. Degrease and clean the **blade, housing, and the surface below** where grease
   drips.
4. Confirm or install **grease containment** (cup/absorbent) — protect the roof
   membrane.
5. Lower the fan, reconnect, **remove lock-out**, and confirm correct rotation and
   airflow.

## System restoration

- Reinstall all panels and filters.
- Remove containment plastic and clean the work area.
- Run the system and confirm capture at the hood.
`),
    ],
  },
  {
    sectionId: "3.5",
    moduleNumber: 3,
    order: 18,
    title: "Knowledge Check",
    summary: "Final course checkpoint and readiness review.",
    estimatedMinutes: 12,
    blocks: [
      md(`
# Final Knowledge Check

You've covered regulations, systems, and the full cleaning procedure. Confirm
you're field-ready.

## You should now be able to

- **Set up safely** — coordinate with the kitchen, lock out power, protect the
  space, and control chemical and height hazards.
- **Clean the hood** to bare metal, including the plenum, and reinstall filters
  correctly.
- **Clean the duct** with proper access planning and honestly document anything
  inaccessible.
- **Service the fan** and restore the system, confirming grease containment and
  airflow.
- **Report and tag** truthfully — specific deficiencies, justified recommendations,
  matching evidence, and a visible service tag.

The standard is simple to state and demanding to meet: **clean the whole system to
bare metal, document the truth, and leave it safe.**
`),
    ],
  },
];

// Wire prerequisites sequentially (each section requires the previous one).
for (
  let index = 1;
  index < COMMERCIAL_KITCHEN_EXHAUST_CLEANING_SECTIONS.length;
  index += 1
) {
  const current = COMMERCIAL_KITCHEN_EXHAUST_CLEANING_SECTIONS[index];
  const previous = COMMERCIAL_KITCHEN_EXHAUST_CLEANING_SECTIONS[index - 1];
  if (current && previous) {
    current.prerequisiteSectionId = previous.sectionId;
  }
}

export const COURSE_CATALOG: CourseDefinition[] = [
  {
    slug: "commercial-kitchen-exhaust-cleaning",
    title: "Commercial Kitchen Exhaust Cleaning",
    shortTitle: "KEC Foundations",
    description:
      "Complete regulatory foundations, system knowledge, and field procedures for commercial kitchen exhaust cleaning.",
    category: "VHD Curriculum",
    estimatedMinutes: COMMERCIAL_KITCHEN_EXHAUST_CLEANING_SECTIONS.reduce(
      (total, section) => total + section.estimatedMinutes,
      0,
    ),
    sections: COMMERCIAL_KITCHEN_EXHAUST_CLEANING_SECTIONS,
  },
];

export const PRIMARY_COURSE_SLUG = COURSE_CATALOG[0]?.slug ?? "";

export function getCourse(slug: string): CourseDefinition | undefined {
  return COURSE_CATALOG.find((course) => course.slug === slug);
}

export function getSection(
  slug: string,
  sectionId: string,
): CourseSectionDefinition | undefined {
  return getCourse(slug)?.sections.find(
    (section) => section.sectionId === sectionId,
  );
}

export const SECTION_IDS_BY_COURSE: Record<string, string[]> =
  Object.fromEntries(
    COURSE_CATALOG.map((course) => [
      course.slug,
      course.sections.map((section) => section.sectionId),
    ]),
  );

export function isKnownSectionId(slug: string, sectionId: string): boolean {
  return SECTION_IDS_BY_COURSE[slug]?.includes(sectionId) ?? false;
}
