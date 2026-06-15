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
    }
  | {
      type: "quiz";
      question: string;
      options: {
        id: string;
        label: string;
      }[];
      correctOptionId: string;
      explanation: string;
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

const quiz = (
  question: string,
  options: { id: string; label: string }[],
  correctOptionId: string,
  explanation: string,
): LessonBlock => ({
  type: "quiz",
  question,
  options,
  correctOptionId,
  explanation,
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

const HELPER_PRACTICAL_BASICS_SECTIONS: CourseSectionDefinition[] = [
  {
    sectionId: "1.1",
    moduleNumber: 1,
    order: 1,
    title: "What We Clean and Why It Matters",
    summary: "The system, the grease, and the fire risk in plain terms.",
    estimatedMinutes: 3,
    blocks: [
      md(`
# What We Clean and Why It Matters

We clean the full commercial kitchen exhaust system:

- **Hood** — the canopy over the cooking line.
- **Baffle filters** — the removable metal filters inside the hood.
- **Plenum** — the chamber behind the filters where grease collects.
- **Duct** — the path that carries greasy air up and out of the building.
- **Fan** — the rooftop or wall unit that pulls air through the system.

Every hour a kitchen cooks, grease vapour rides the airflow and sticks to those
surfaces. Grease is fire fuel. Our job is to remove that fuel from the whole
system, not just make the hood look clean from the floor.

(The codes, certifications, and reporting rules behind this live in the KEC
Foundations course, which you'll take later. For now: grease = fire fuel, we
remove it.)

## Commercial only

We work in restaurant and commercial kitchens — no residential jobs. Many jobs
happen **before opening** or **after closing**, when the kitchen is shut down and
cool enough to work safely.
`),
      quiz(
        'A cook asks why you are scraping inside the duct when "the hood already looks clean." What is the best answer?',
        [
          {
            id: "a",
            label:
              "The duct is part of the exhaust system, and grease inside it is fire fuel."
          },
          {
            id: "b",
            label: "The duct only matters when an inspector is coming."
          },
          {
            id: "c",
            label: "We scrape it because it makes the outside of the hood shinier."
          }
        ],
        "a",
        "Correct. Helpers need to understand that the whole exhaust path matters because grease anywhere in the system can feed a fire."
      ),
    ],
  },
  {
    sectionId: "1.2",
    moduleNumber: 1,
    order: 2,
    title: "What a Shift Looks Like",
    summary: "Dispatch, meet-up, and the truck-to-truck rhythm.",
    estimatedMinutes: 3,
    blocks: [
      md(`
# What a Shift Looks Like

## Where you start

It varies by job. Sometimes the crew meets at the shop, sometimes directly at the
site. **Check the app for dispatch notes, access instructions, and the meet-up
time before you leave.** Paid time starts at that meet-up point, so be there
ready to work: boots on, phone away.

## The shape of a job

A typical job is a single restaurant, before open or after close, about **2–3
hours**. The rhythm is usually:

1. **Arrive and get access** — follow the app notes for keys, lockboxes, alarms,
   or who is letting the crew in.
2. **Protect** — poly tent up before any chemical or water moves.
3. **Clean** — filters, hood, plenum, duct, fan.
4. **Restore** — tear down, dry floors, everything back where it was.
5. **Pack** — truck loaded clean and organized for the next job.

## What you bring

Your own boots and dark work clothes that can get greasy. The company provides
your PPE — gloves, safety glasses, and the rest. A change of clothes in the truck
is never a bad idea.
`),
      quiz(
        'Dispatch says "meet at the site, 9 PM." What should you do?',
        [
          {
            id: "a",
            label:
              "Check the app for access instructions, arrive ready to work at 9 PM, and start paid time at the meet-up point."
          },
          {
            id: "b",
            label:
              "Arrive sometime after 9 PM because the kitchen is closed anyway."
          },
          {
            id: "c",
            label:
              "Wait until you get there to ask how to access the site."
          }
        ],
        "a",
        "Correct. Helpers should check the app before leaving and arrive at the meet-up point ready to work."
      ),
    ],
  },
  {
    sectionId: "1.3",
    moduleNumber: 1,
    order: 3,
    title: "What Makes a Good Helper",
    summary: "Learn the whole job; see mess before it spreads.",
    estimatedMinutes: 2,
    blocks: [
      md(`
# What Makes a Good Helper

## You're learning the whole job

There is no permanent "helper lane" here. You're expected to learn everything the
lead does — spraying, filters, ducts, fans, photos, client courtesy. Early on the
lead makes the calls and you follow; the goal is that less and less needs to be
explained to you each shift.

## The four marks of a good helper

- **Fast** — moving with purpose, never standing watching.
- **Careful** — protecting the client's kitchen like it's your own.
- **Listens** — does it the lead's way first, asks questions after.
- **Sees mess before it spreads** — spots the drip, the loose poly corner, the
  slippery patch, and fixes it before it becomes a problem.

## The one rule that never changes

When you're not sure — about a chemical, a ladder, a hot surface, anything —
**stop and ask**. Asking costs ten seconds. Guessing wrong can cost the whole
night or worse.
`),
      quiz(
        "You finish your task and the lead is mid-spray. What is the best next move?",
        [
          {
            id: "a",
            label:
              "Look for useful support work: filters, poly, hoses, wiping, staging, or cleanup."
          },
          {
            id: "b",
            label: "Stand nearby until the lead gives your next instruction."
          },
          {
            id: "c",
            label: "Start changing the plan without telling the lead."
          }
        ],
        "a",
        "Correct. A good helper keeps the job moving, but still follows the lead's direction."
      ),
    ],
  },
  {
    sectionId: "2.1",
    moduleNumber: 2,
    order: 4,
    title: "PPE: What You Wear, What We Provide",
    summary: "The non-negotiable kit and when it goes on.",
    estimatedMinutes: 3,
    blocks: [
      md(`
# PPE: What You Wear, What We Provide

## Who provides what

- **You bring:** sturdy boots and dark work clothes that can get destroyed by
  grease.
- **We provide:** chemical-resistant gloves, safety glasses, and any other PPE
  the job needs.

## The rule that has no exceptions

**Gloves and safety glasses go on any time chemical is out** — yours or anyone
else's. Not "when spraying," not "when it seems strong" — any time degreaser is
out of the jug. Overhead work drips back down at your face; that's exactly when
people skip glasses and exactly when it matters most.

## Condition counts

A torn glove is not a glove. Fogged or scratched glasses you can't see through
get swapped, not pushed up on your head. Tell the lead when your PPE is done —
replacing it is normal, working without it is not.
`),
      quiz(
        "The lead is spraying degreaser and you are only moving filters. What PPE do you need?",
        [
          {
            id: "a",
            label:
              "Chemical-resistant gloves and safety glasses because chemical is out."
          },
          {
            id: "b",
            label: "Only gloves because you are not the person spraying."
          },
          {
            id: "c",
            label: "No PPE until you personally handle the sprayer."
          }
        ],
        "a",
        "Correct. Gloves and safety glasses are required any time chemical is out, even if someone else is spraying."
      ),
    ],
  },
  {
    sectionId: "2.2",
    moduleNumber: 2,
    order: 5,
    title: "Degreaser: Handle It Like It Bites",
    summary: "Who mixes, how you spray, and splash first aid.",
    estimatedMinutes: 4,
    blocks: [
      md(`
# Degreaser: Handle It Like It Bites

The degreaser that strips baked-on grease off steel will do the same to skin,
eyes, and the wrong surfaces. Respect it.

## Who does what

- **The lead mixes and dilutes.** You don't mix chemical — you apply pre-mixed
  degreaser with the pump sprayer where the lead directs.
- Keep the sprayer pointed at the work. Control your overspray — chemical only
  goes where grease is.

## Where it must never go

Off the protected work area: not on unprotected equipment, painted walls,
flooring, or anything outside the poly. If you see chemical land where it
shouldn't, say so immediately and wipe it — a quiet drip becomes a permanent
stain.

## If it splashes skin or eyes

1. **Flush with water for 15 minutes.** Eyes: hold them open under gentle running
   water. Skin: remove the soaked clothing and flush.
2. **Tell the lead immediately** — not after you finish the task, not at the end
   of the night. Immediately.
`),
      quiz(
        "Degreaser mist catches the corner of your eye. What do you do first?",
        [
          {
            id: "a",
            label:
              "Flush the eye with water for 15 minutes and tell the lead immediately."
          },
          {
            id: "b",
            label:
              "Finish the filter you are holding, then mention it at the end of the job."
          },
          {
            id: "c",
            label:
              "Wipe it with your glove and keep working if it stops stinging."
          }
        ],
        "a",
        "Correct. Eye exposure is immediate-water-and-lead-now territory, even if it feels minor at first."
      ),
    ],
  },
  {
    sectionId: "2.3",
    moduleNumber: 2,
    order: 6,
    title: "Hot, High, and Slippery: Stop-and-Ask Rules",
    summary: "Physical hazards and the moments you pause the job.",
    estimatedMinutes: 3,
    blocks: [
      md(`
# Hot, High, and Slippery: Stop-and-Ask Rules

Chemicals aren't the only hazard. The three that catch new helpers: heat,
height, and wet floors.

## Hot

Kitchens hold heat long after close. Treat every cooking surface as hot until
proven cool, and watch for **pilot lights** — open flame near our spray and poly.
If equipment is still hot or a pilot is burning where you'll be working, that's
the lead's call, not yours: stop and ask.

## High

Ladders get set on their feet, on dry floor, fully opened — never leaned, never
on poly. Three points of contact going up and down. If the reach feels wrong,
it is wrong: come down and reposition instead of stretching.

## Slippery

Degreaser plus water makes kitchen tile into ice. Squeegee as you go, keep your
walking paths dry, and warn the crew the moment a floor turns slick — don't wait
for someone to find it the hard way.

## Stop-and-ask moments

Hot equipment or live pilot light. A ladder that won't sit right. Anything
electrical near water. A smell, sound, or situation you don't recognize. The
sentence "hey, before I touch this —" has never made a job worse.
`),
      quiz(
        "You are about to climb a ladder and the floor underneath has a film of rinse water. What do you do?",
        [
          {
            id: "a",
            label:
              "Stop, dry or squeegee the area, tell the crew if it is slick, then set the ladder on dry floor."
          },
          {
            id: "b",
            label:
              "Climb carefully because the ladder feet will hold it in place."
          },
          {
            id: "c",
            label:
              "Put the ladder on top of poly so it does not touch the wet tile."
          }
        ],
        "a",
        "Correct. Wet floors and ladders do not mix. Stop, make the floor safe, then climb."
      ),
    ],
  },
  {
    sectionId: "3.1",
    moduleNumber: 3,
    order: 7,
    title: "Walking In: Stage Like a Pro",
    summary: "Access, arrival conduct, and tool staging.",
    estimatedMinutes: 2,
    blocks: [
      md(`
# Walking In: Stage Like a Pro

## Getting in

Access varies by client — sometimes keys, a lockbox, and alarm codes with an
empty kitchen; sometimes a manager or staff member lets us in and sticks around.
**Dispatch notes say how each job works.** Either way, we are guests in someone's
business at night. Act like it.

## Arrival conduct

Walk in calm and professional. If staff are present: polite, brief, and refer
any real questions to the lead. No wandering into office areas, no touching
anything that isn't ours to touch, nothing off shelves.

## Staging

Bring gear in along one clean path and stage it tight — one home base, not a
trail of equipment through the kitchen. Nothing blocking exits or walk paths,
nothing leaned against painted walls or glass, hoses run flat where feet won't
find them.
`),
      quiz(
        "A closing manager asks you how much a fan repair would cost. What should you say?",
        [
          {
            id: "a",
            label:
              '"The office handles pricing. I will let the lead know so they can follow up."'
          },
          {
            id: "b",
            label:
              '"It should be cheap. We can probably do it while we are here."'
          },
          {
            id: "c",
            label:
              '"I am not sure, but I think repairs usually cost a few hundred dollars."'
          }
        ],
        "a",
        "Correct. Helpers should stay polite and brief, avoid prices or promises, and route questions through the lead or office."
      ),
    ],
  },
  {
    sectionId: "3.2",
    moduleNumber: 3,
    order: 8,
    title: "The Poly Tent",
    summary: "The flagship skill: funnel every drop to the catch point.",
    estimatedMinutes: 5,
    blocks: [
      md(`
# The Poly Tent

This is the single most important skill in this course. Sloppy protection is the
number-one way helpers cost the company money and trust.

## The idea

Before any chemical or water flies, we build a **poly tent** — a funnel of
plastic sheeting that runs from the hood edges down and inward, so every drop of
greasy wash water is steered into a **catch container or drain**. The kitchen
under and around the hood should be able to stay bone dry through the whole
clean.

## Building it

1. **Tape poly to the hood edges** all the way around — full seals, not spot
   tacks. Gaps at the seams are where water escapes.
2. **Slope everything inward and down** toward one low point. Water follows
   gravity; give it exactly one place to go.
3. **Set the catch point** — container or floor drain — at that low point, and
   confirm the path to it before the first spray.
4. **Cover what the tent doesn't** — the cooking line under the hood, nearby prep
   surfaces, anything overspray could reach.
5. **Test it dry:** look up and walk the seams. If you can see a gap, water will
   find it.

## Protect the protection

Don't drag hoses or ladder feet across laid poly, and don't puncture the funnel
with a scraper handle. A tent with one hole in the wrong place is a failed tent.
`),
      quiz(
        "The tent is up, but you can see daylight through a seam above the fryer. The lead is ready to spray. What do you do?",
        [
          {
            id: "a",
            label:
              "Stop the spray, point out the gap, and seal it before chemical or water moves."
          },
          {
            id: "b",
            label:
              "Let the lead spray lightly and watch whether water actually leaks."
          },
          {
            id: "c",
            label:
              "Put a towel on the fryer and fix the seam during teardown."
          }
        ],
        "a",
        "Correct. Any visible gap is a leak waiting to happen. Fix the protection before the first spray."
      ),
    ],
  },
  {
    sectionId: "3.3",
    moduleNumber: 3,
    order: 9,
    title: "Good Tent, Failed Tent",
    summary: "Real failure cases and the pre-spray inspection.",
    estimatedMinutes: 3,
    blocks: [
      md(`
# Good Tent, Failed Tent

Both of these failures have actually happened on our jobs. The course exists
partly so they never happen again.

## Failure one: the water got out

A gap in a seam, an unsealed corner, a sag that pooled and overflowed — and
grease-laden wash water ran onto equipment, across the floor, toward prep areas.
The cleaning took an hour; the cleanup of the escape took longer, and the client
saw it.

## Failure two: the chemical landed wrong

Degreaser overspray and drips reached a surface it should never touch and
damaged the finish. Wash water rinses away; etched and stained surfaces don't.
That's a permanent mark on someone else's kitchen with our name on it.

## What "passed" looks like before the first drop

- Every seam sealed, every corner taped, slope runs to one catch point.
- Everything chemical could reach is covered.
- Catch container or drain confirmed and in place.
- Floors on the walking paths still dry and staying that way.

If you wouldn't bet your own kitchen on the tent, it's not done.
`),
      quiz(
        "Which answer names the two protection failures this section warns about?",
        [
          {
            id: "a",
            label:
              "Wash water escaping the tent, and chemical landing on an unprotected surface."
          },
          {
            id: "b",
            label:
              "Filters taking too long to dry, and the truck being packed loosely."
          },
          {
            id: "c",
            label:
              "A fan belt squealing, and a missing invoice signature."
          }
        ],
        "a",
        "Correct. The pre-spray inspection is meant to catch escaping wash water and chemical damage risks before they become client problems."
      ),
    ],
  },
  {
    sectionId: "4.1",
    moduleNumber: 4,
    order: 10,
    title: "Filters and the Dish Pit",
    summary: "Scrape, wash, rinse, dry, reinstall — sink left spotless.",
    estimatedMinutes: 4,
    blocks: [
      md(`
# Filters and the Dish Pit

Filters are usually the helper's first solo-owned task. We wash them onsite in
the client's **dish pit** — there's no soak tank. That means we're borrowing the
most-used sink in their kitchen, and how we leave it is part of the job.

## The routine

1. **Pull the filters** from the hood — gloves on, they're greasy and the edges
   are sharp.
2. **Scrape first.** Heavy grease gets scraped into the garbage *before* the
   sink. Grease chunks down a client's drain is how we lose a client.
3. **Wash** with degreaser in the dish pit, working the baffles.
4. **Rinse** thoroughly — no chemical residue on something that hangs over food
   equipment.
5. **Dry and reinstall** — baffles oriented so grease drains correctly, every
   filter seated snug. A loose filter over a cooking line is a falling hazard.

## Sink etiquette

When you're done, the dish pit is **spotless** — no grease ring, no scraps in
the strainer, no degreaser smell, fixtures wiped. The morning dish crew should
never know we were in their sink.
`),
      quiz(
        "You are three filters in and the dish pit is developing a thick grease ring. What should you do?",
        [
          {
            id: "a",
            label:
              "Pause to clean the ring as you go, keep grease chunks out of the drain, and leave the sink spotless."
          },
          {
            id: "b",
            label:
              "Leave the grease ring until morning because the dish crew has stronger soap."
          },
          {
            id: "c",
            label:
              "Rinse the chunks down the drain so the sink looks cleaner faster."
          }
        ],
        "a",
        "Correct. Helpers own the dish pit while using it. Clean as you go and leave no grease, scraps, or chemical residue behind."
      ),
    ],
  },
  {
    sectionId: "4.2",
    moduleNumber: 4,
    order: 11,
    title: "Hood and Plenum: To Bare Metal",
    summary: "Spray, dwell, scrape, rinse — and what finished really means.",
    estimatedMinutes: 4,
    blocks: [
      md(`
# Hood and Plenum: To Bare Metal

With filters out, the hood interior and the plenum (the chamber behind where the
filters sit) are open. This is core cleaning work you'll do more of every shift.

## The cycle

1. **Spray** degreaser onto the greasy surface.
2. **Dwell** — give the chemical time to work. Spraying and instantly scraping
   wastes chemical and your arms.
3. **Scrape and agitate** the softened build-up.
4. **Rinse** down into the tent's funnel.

Repeat where it needs it. Heavy build-up takes rounds, not force.

## Bare metal vs. "still greasy"

Clean stainless reflects light evenly and a wipe with a clean cloth comes back
clean. A surface that looks okay from the floor but feels tacky or wipes brown
is **still greasy**. The standard is bare metal, not "better than it was."

## The classic missed spots

- The **plenum**, especially its top and corners — out of sightline, first place
  an inspector looks.
- The **grease trough and cup** at the filter rail.
- Hood **corners and seams** where the scraper doesn't naturally travel.

"Shiny from the floor" is not finished. Climb, look, wipe-test.
`),
      quiz(
        "The hood gleams from below. Before calling it done, what should you do?",
        [
          {
            id: "a",
            label:
              "Climb, inspect the plenum/corners/grease trough, and wipe-test for bare metal."
          },
          {
            id: "b",
            label:
              "Call it done because shiny from the floor means the inspector will be satisfied."
          },
          {
            id: "c",
            label:
              "Only reinstall the filters; the plenum is hidden so it does not matter."
          }
        ],
        "a",
        "Correct. The standard is bare metal, including the missed spots that are hard to see from the floor."
      ),
    ],
  },
  {
    sectionId: "4.3",
    moduleNumber: 4,
    order: 12,
    title: "Pressure Washer and Wastewater",
    summary: "Running the wand, hose discipline, and controlling greasy water.",
    estimatedMinutes: 4,
    blocks: [
      md(`
# Pressure Washer and Wastewater

The pressure washer does the heavy rinsing. **You'll be trained on it and run
the wand yourself** — this isn't a lead-only tool. Until you're signed off,
you're on hoses and support; watch how the lead works the spray.

## Wand basics

- Steady, overlapping passes — chase the grease toward the tent's funnel, don't
  blast it sideways past the poly.
- Mind your backsplash: high pressure into a corner comes straight back at you.
- Never point it at a person, and keep both hands on it.

## Hose discipline

Hoses are the helper's responsibility. Run them flat along walls, out of walk
paths, never through a doorway where a door can pinch them, and keep slack
managed so nobody — including you on a ladder — finds one with their feet.

## Where the water goes

All that greasy wash water must stay controlled and move only where the lead has
planned it to go. Keep heavy grease and scrapings out of the water path before
rinsing. If water starts pooling, backing up, escaping the poly, or carrying
chunks toward a drain, stop and tell the lead right away. A clean job can turn
into a plumbing bill or client complaint if wastewater is ignored.
`),
      quiz(
        "During rinsing, you see greasy water pooling and carrying chunks toward the drain. What do you do?",
        [
          {
            id: "a",
            label:
              "Stop and tell the lead right away so the water path and solids can be controlled."
          },
          {
            id: "b",
            label:
              "Keep spraying because the drain will probably take it."
          },
          {
            id: "c",
            label:
              "Push the chunks down with the wand so they disappear faster."
          }
        ],
        "a",
        "Correct. Helpers should not let grease chunks, pooling water, or escaping wastewater continue unnoticed."
      ),
    ],
  },
  {
    sectionId: "4.4",
    moduleNumber: 4,
    order: 13,
    title: "Staying Ahead of the Lead",
    summary: "Next task prepped before you're asked; the three time-wasters.",
    estimatedMinutes: 3,
    blocks: [
      md(`
# Staying Ahead of the Lead

Speed on this crew isn't rushing — it's **never being the reason the job waits**.
The whole skill: have the next task prepped before you're asked.

## What it looks like

While the lead sprays the hood, you're not watching — you're pulling and washing
filters, staging poly for the next section, or cleaning up behind the work that's
done. When the lead turns around to say "next we need—", the answer is already
in your hands. Two work streams running at once is how a 5-hour job becomes a
3.5-hour job.

## The three time-wasters

These are the named ones — the things that actually slow our crews down:

1. **Phone out.** It stays in your pocket on the clock. Every glance is a stall
   the lead can see.
2. **Waiting to be told.** Finished a task? There is always a next one: filters,
   poly, hoses, wipe-down, staging. Pick one up.
3. **Walking empty-handed.** Going to the truck? Carry something out. Coming
   back? Bring what's needed next. Every trip carries.

## Hustle without cutting corners

Staying ahead never means skipping dwell time, half-taping a seam, or calling a
tacky surface clean. The order is fixed: safe, then right, then fast.
`),
      quiz(
        "The lead is mid-spray, filters are washed, and your hands are empty. What should you do?",
        [
          {
            id: "a",
            label:
              "Find the next useful task: stage gear, manage hoses, wipe finished areas, or prep teardown."
          },
          {
            id: "b",
            label:
              "Check your phone until the lead notices you are free."
          },
          {
            id: "c",
            label:
              "Start spraying a new area without confirming the lead's plan."
          }
        ],
        "a",
        "Correct. Staying ahead means removing friction from the job while still working inside the lead's plan."
      ),
    ],
  },
  {
    sectionId: "5.1",
    moduleNumber: 5,
    order: 14,
    title: "Cleanup and Restore",
    summary: "The teardown checklist and the two classic failures.",
    estimatedMinutes: 3,
    blocks: [
      md(`
# Cleanup and Restore

The client never sees the cleaning — they see the kitchen we left behind. Weak
cleanup is one of the four problems this course exists to fix, and it's the
last impression every job makes.

## The teardown checklist

1. **Tear down the poly** carefully — fold the mess inward — straight into
   garbage bags. Greasy poly dragged across a clean floor undoes the night.
2. **Wipe everything the water touched** — equipment, walls, stainless,
   anything inside the splash zone.
3. **Squeegee and dry the floors.** Completely.
4. **Reinstall filters** — seated, oriented to drain.
5. **Equipment back exactly where it was** — the line cook's setup is muscle
   memory; put their kitchen back the way they left it.
6. **The lead does a final lap.** Walk it with them and learn what their eyes
   catch that yours don't yet.

## The two classic failures

Both have happened; both are yours to prevent:

- **Wet, slippery floors** — the opening staff's first step at 6 AM. This is a
  safety failure, not a cosmetic one.
- **Grease left on equipment** — handprints and drips on the line that tell the
  client we were careless.
`),
      quiz(
        'It is 2 AM and the floor "looks mostly dry." What is the right standard?',
        [
          {
            id: "a",
            label:
              "Dry it completely because opening staff are the ones who find slippery floors."
          },
          {
            id: "b",
            label:
              "Leave it if it looks acceptable from the doorway."
          },
          {
            id: "c",
            label:
              "Only dry the area directly under the hood."
          }
        ],
        "a",
        "Correct. Cleanup is a safety issue and the client's first impression in the morning."
      ),
    ],
  },
  {
    sectionId: "5.2",
    moduleNumber: 5,
    order: 15,
    title: "Conduct, Photos, and What Not to Promise",
    summary: "Client boundaries and learning the shot list early.",
    estimatedMinutes: 2,
    blocks: [
      md(`
# Conduct, Photos, and What Not to Promise

## The three nevers with clients and staff

Whether it's the owner, a manager, or a line cook:

1. **Never quote prices.** "The office handles pricing — I'll have them follow
   up."
2. **Never promise extra work.** Even "sure, we can probably hit that vent too"
   is a commitment someone else has to keep.
3. **Never discuss findings or problems.** What we found in the duct goes in the
   lead's report, not into a 1 AM chat that becomes a rumor about their kitchen.

Friendly, brief, and "the lead can answer that" covers every situation.

## Photos: learn the shot list early

Before/after photos are part of every job — they prove the work and back the
report. The lead owns them at first, but **you're expected to learn the shot
list early**: what gets photographed, from where, before the poly goes up and
after the restore. Watch what the lead shoots and ask why. Soon enough you'll
be taking them yourself in the app.

## What goes up the chain immediately

Anything broken (by us or found broken), anything we couldn't access or finish,
any spill or damage, anything unsafe. Bad news ages terribly — the lead hears
it from you first, on the spot.
`),
      quiz(
        "You notice a filter baffle was already cracked when you pulled it. What do you do?",
        [
          {
            id: "a",
            label:
              "Tell the lead immediately, document it if directed, and avoid debating it with the manager."
          },
          {
            id: "b",
            label:
              "Say nothing unless the manager asks, because it was already cracked."
          },
          {
            id: "c",
            label:
              "Promise the manager the company will replace it."
          }
        ],
        "a",
        "Correct. Existing damage still goes up the chain immediately, and client conversations stay with the lead or office."
      ),
    ],
  },
  {
    sectionId: "5.3",
    moduleNumber: 5,
    order: 16,
    title: "First-Shift Readiness Check",
    summary: "Scenario-based final check before your first job.",
    estimatedMinutes: 3,
    blocks: [
      md(`
# First-Shift Readiness Check

Run yourself through these scenarios. If any answer is fuzzy, revisit that
section — your first shift is the wrong place to find the gap.

## Safety and chemicals

- Degreaser is coming out and you're "only moving filters." What's on your hands
  and face? *(Gloves and glasses — any time chemical is out, no exceptions.)*
- Chemical splashes your eye. First two moves? *(Flush with water 15 minutes,
  tell the lead immediately.)*
- Pilot light burning where you're about to work? *(Stop and ask the lead.)*

## Protection

- What must be true about the poly tent before the first spray? *(Sealed seams,
  slope to one catch point, catch container or drain set, everything reachable
  by chemical covered, tested dry.)*
- The two real failures to never repeat? *(Wash water escaping the tent;
  chemical damaging an unprotected surface.)*

## The work

- Filters: what happens before the sink, and how does the sink get left?
  *(Scrape grease into garbage first; dish pit spotless.)*
- Hood looks shiny from the floor. Done? *(No — climb, check plenum and corners,
  wipe-test to bare metal.)*
- During pressure washing, what wastewater problems do you call out? *(Pooling,
  backing up, escaping the poly, or carrying grease chunks toward a drain.)*

## Pace and finish

- The three time-wasters? *(Phone out, waiting to be told, walking
  empty-handed.)*
- The two classic cleanup failures? *(Wet floors, grease left on equipment.)*
- A manager asks what a duct repair would cost? *(Office handles pricing — never
  quote, never promise, never discuss findings.)*

If you can answer all of these without looking, you're ready to be useful on
night one. See you on the truck.
`),
      quiz(
        "What is the best first-shift mindset for a new helper?",
        [
          {
            id: "a",
            label:
              "Work safely, protect the client's kitchen, keep moving, and stop to ask when unsure."
          },
          {
            id: "b",
            label:
              "Move as fast as possible, even if the lead has not checked the setup yet."
          },
          {
            id: "c",
            label:
              "Stay quiet about small problems so the lead can focus."
          }
        ],
        "a",
        "Correct. The course is preparing helpers to be safe, useful, observant, and easy to train on the truck."
      ),
    ],
  },
];

// Wire prerequisites sequentially (each section requires the previous one).
for (let index = 1; index < HELPER_PRACTICAL_BASICS_SECTIONS.length; index += 1) {
  const current = HELPER_PRACTICAL_BASICS_SECTIONS[index];
  const previous = HELPER_PRACTICAL_BASICS_SECTIONS[index - 1];
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
  {
    slug: "helper-practical-basics",
    title: "Helper Practical Basics",
    shortTitle: "Helper Basics",
    description:
      "First-week field training for vent and hood cleaning helpers: safety, chemicals, site protection, the cleaning work, pace, and cleanup.",
    category: "VHD Curriculum",
    estimatedMinutes: HELPER_PRACTICAL_BASICS_SECTIONS.reduce(
      (total, section) => total + section.estimatedMinutes,
      0,
    ),
    sections: HELPER_PRACTICAL_BASICS_SECTIONS,
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
