# Tracking Evidence 2.1.0

Last updated: 2026-09-16

This release requires a new native binary for `modules/vhd-tracking-status`.
Do not ship only an OTA update to a 2.0 binary. Install this binary on all phones
and verify PowerSync definition fields before deploying the default-V2 backend.
There is no technician enrollment environment variable.

V2 retains callbacks before attempting a GPS fix or network upload. One GPS
stream serves overlapping jobs. Job exit ends a segment, not return monitoring.
Local evidence survives upload acknowledgment and supports offline replay.
Monitoring falls back to regions after continuous capture grace and retires
incomplete after 48 hours. Missing evidence never becomes a fabricated return.

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
