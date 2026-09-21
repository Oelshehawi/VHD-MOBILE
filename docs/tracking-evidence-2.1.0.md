# Tracking Evidence 2.1.0

Last updated: 2026-09-21

This release requires a new native binary for `modules/vhd-tracking-status`.
Do not ship only an OTA update to a 2.0 binary. Install this binary on all phones
and verify PowerSync definition fields before deploying the default-V2 backend.
There is no technician enrollment environment variable.

V2 retains callbacks before attempting a GPS fix or network upload. One GPS
stream serves overlapping jobs. A confirmed job exit ends that definition's
capture without requiring a depot return. A visit shorter than two minutes is
a brief stop and leaves the job eligible for a later visit.
Local evidence survives upload acknowledgment and supports offline replay.
Monitoring falls back to regions after continuous capture grace and retires
incomplete after 48 hours. Missing evidence never becomes a fabricated return.

The September 21 update fixes per-second uploads with overlapping definitions:
one shared cadence reads the last retained physical fixes from SQLite, regardless
of which window owns the event. Closed definitions are excluded before sampling.
The first two decisive boundary fixes bypass normal cadence so arrival and exit
corroboration is preserved. Geofence callbacks and optional GPS remain immediate.
Tasks without retained fixes do not run upload/reconciliation again.

Report submission no longer writes scheduled-start-to-submission elapsed time
as actual service duration. A next-day report must not become an overnight work
duration. Previously saved values require separate review; they are not guessed
or overwritten by this update.

Deploy the matching backend before publishing the 2.1.0 OTA. These changes need
no new native build or PowerSync schema. Existing durable closures are retained;
the fix cannot recreate previously unrecorded visits.

New report/photo/note/payment/invoice work requires verified tracking settings.
Previously queued work and read-only access are not blocked. iPhone settings:
Settings > Privacy & Security > Location Services > VHD > Always, with Precise
Location enabled; Settings > General > Background App Refresh must be enabled.
Android requires full location access and unrestricted battery usage.

Run `pnpm run lint:types`, `pnpm run lint:eslint`, and the Jest suite before
building. Verify native autolinking/builds separately. Replay engines under
`services/location/evidence/` mirror the backend and must remain in parity.

Acceptance matrix: foreground/background/locked screen, offline then upload,
long jobs, job re-entry, overlapping visits, depot return, overnight phone-off
then another job, permission changes, reboot, force-quit, and account switching.
No relaunch or precise crossing-time guarantee is possible after user force-quit
or while the phone is powered off. Compare raw events and accuracy diagnostics,
not just the live map marker.

See backend `docs/current-state/mobile/2026-09-16-tracking-evidence.md` for
retention migration, coordinated cutover, recovery semantics, and rollback.
