# Location Tracking OTA For 2.0.0

Last updated: 2026-09-10

## Compatibility Boundary

- `location-tracking-2.0.0-ota` carries the reviewed JavaScript reliability fixes
  without changing the 2.0.0 app configuration, dependencies, lockfile, native
  plugins, or native modules relative to the existing mobile `main` baseline.
- Both app and package versions remain 2.0.0. The `appVersion` runtime policy
  therefore targets installed runtime 2.0.0 binaries, not runtime 2.1.0.
- The deferred `VHDTrackingStatus` native module only reads OS diagnostics. It
  does not implement the location stream or wake the app. The existing Expo
  location module still owns capture, geofences, and permission requests.
- The optional-module fallback permits tracking with granted foreground and
  background permissions. iPhone precision, Background App Refresh, and Low
  Power Mode remain unknown. Android precision remains available through Expo;
  native battery restrictions remain unknown. Do not describe these as verified.
- `location-tracking-2.1.0` retains the native diagnostic module for a later store
  release. The OTA changes are squashed, not merged from that branch, so its
  version bump and native additions remain available for a later merge.

## Release Order

1. Prepare production MongoDB indexes in `test` on the confirmed Atlas cluster:
   events expire 14 days after `receivedAt`; windows expire 16 days after
   `endsAtUtc`; health expires 16 days after `receivedAt`. Ensure the event
   receipt unique partial index, window replay index, and health installation
   unique index exist. Do not drop conflicting indexes to bypass errors.
2. Deploy the web reliability branch and confirm normal 2.0.0 job loading and
   sync. Keep `MOBILE_MIN_APP_VERSION` unset throughout this rollout.
3. Verify EAS production environment values and the production channel mapping.
   The API must be the production HTTPS endpoint, never a local IP. Record the
   previous successful runtime 2.0.0 update IDs and the installed build IDs.
4. Publish this branch with the production environment explicitly selected:

   ```sh
   eas update --channel production --environment production --message "Location reliability for 2.0.0"
   ```

5. Have a pilot iPhone and Android apply the OTA while online. Verify version
   2.0.0, production channel, and the new platform-specific Update ID in Profile.
   Production OTA availability applies to all matching devices, so coordinate
   the pilot before publishing; this command is not a per-device rollout.
6. Complete the device acceptance checks below before asking the remaining
   technicians to restart into the update. No new redemption code or store
   approval is required for this compatible JavaScript OTA.

## Acceptance Checks

- Verify existing jobs, report/photo uploads, and PowerSync recovery after
  connectivity loss. Finish pending uploads before the pilot; do not uninstall
  the app or clear storage to apply an OTA.
- Test at least an hour with the screen locked, including a scheduled window
  beginning without opening the app, travel, arrival, and departure. Verify
  buffered evidence uploads after reconnection and Vercel has no new ingest 500s.
- Test two assigned technicians: the first confirmed departure closes every
  tracking window for that visit, independent of report completion. Continuous
  tracking remains limited to scheduled work windows.
- Identify each of the four current installations in tracking health. Require
  appVersion 2.0.0, the new OTA Update ID, granted background location, fresh
  captures during work, and a drained queue after reconnection. Missing reports
  mean unknown, not an old version or denied permissions.
- On iPhones manually verify Always access, Precise Location, and Background
  App Refresh. Unknown native diagnostic fields are expected on runtime 2.0.0;
  they must not be interpreted as permission denial or as verified settings.

## Pre-Publish Verification

- The full mobile suite passes: 27 suites and 163 tests, including eight tests
  exercising permissions without the optional native diagnostic module.
- Mobile TypeScript and ESLint checks pass. Backend location regression checks
  pass: 124 tests including five isolated MongoDB integration tests. Production
  data is not used by those integration tests.
- iOS and Android Hermes bundles export successfully using EAS production
  values. Both contain the production API origin and neither contains the
  local development API URL.
- EAS confirms the production iPhone and Android store builds use app/runtime
  version 2.0.0 and channel `production`. These checks do not replace the physical-device
  acceptance checks above or confirm that an OTA is installed on any phone.

## Rollback And Limits

- Leave the minimum version unset. If a minimum was accidentally enabled, unset
  it and redeploy the web app; phones must reconnect and foreground the app to
  clear a cached requirement.
- Prefer a corrected runtime 2.0.0 OTA. Republishing a pre-SQLite-outbox update
  does not upload events already migrated to the new outbox. Preserve device
  storage; that queued evidence requires the compatible code to resume delivery.
- Retain additive database indexes when reverting a web deployment. Increasing
  retention cannot recover records already expired under the old TTL indexes.
- No OTA or store build can guarantee tracking after force-quit/force-stop,
  revoked permissions, OS restrictions, or powering off the phone.
