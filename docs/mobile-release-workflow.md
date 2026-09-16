# Mobile Release Workflow

Last updated: 2026-09-16

## Choose The Release Type

- Backend-only change: deploy projectvhd. No mobile build unless the contract
  needs new client behavior.
- Compatible JavaScript/UI fix: test, then use
  `eas update --channel production --environment production --message "Description"`.
  Keep the installed runtime/app version when publishing a compatible patch.
  The app checks on launch/resume, downloads, and offers a reload. This is the
  fastest path, subject to store policies, but cannot add native capabilities.
- Native module, permissions/configuration, Expo SDK, or native dependency
  change: increment app version and use
  `eas build --platform all --profile production --auto-submit`.
  Production automatically increments native build numbers. Submission uploads
  artifacts; it does not bypass review or publish every store release.

Runtime version uses `appVersion`. A 2.1.0 OTA does not reach installed 2.0.0
binaries. The tracking-status native module requires a 2.1.0 store build.
Never publish JavaScript that requires it to a binary lacking that module.

## Required Updates

`components/app/ForceUpdateGate.tsx` already provides a non-dismissible update
screen for signed-in users, opening App Store or Google Play. It checks the
authenticated backend `/api/mobile/app-config` on launch/resume. The backend
reads `MOBILE_MIN_APP_VERSION`; set it to `2.1.0` only after both platforms can
actually obtain that version. A single current minimum applies to both platforms.

The gate caches the minimum for offline use. A device that has never received
the minimum remains usable offline. This is a client UI gate, not a server API
version firewall; background queued uploads remain independent. The old build
must already contain the gate or receive a compatible OTA adding it. Repository
code alone does not prove every installed build contains that code.

To withdraw the requirement, unset the backend minimum and allow devices to
reconnect. Cached offline requirements cannot be revoked until the next check.

## Store Distribution

Apple Business Manager distributes the custom app; device management (MDM) is
what can command managed-app updates. Supervision, enrollment and installation
method determine whether installation is silent or needs user interaction.
Redemption-code installs are different: verify the App Store link works for an
assigned technician account. ABM does not bypass Apple's app review.

Android production submission currently targets the **internal** Play track
with `releaseStatus: draft` in `eas.json`. Finish the release in Play Console and
verify testers are enrolled, signed into the eligible Google account, and using
the Play-installed app. A Play Store link can then offer the eligible update.
An APK installed through EAS internal distribution is not the same as a Play
internal-test installation. Do not require an update while its release is draft
or unavailable to some technicians.

## All-Technician Tracking Cutover

1. Stage the backend and verify PowerSync fields/retention. Keep the current
   production tracking backend until the phone upgrade is complete.
2. Build 2.1.0, submit, complete store review/release, and verify installation on
   one iPhone and one Android device using the actual distribution method.
3. Require 2.1.0 only when both platforms can update; confirm all team devices
   have installed it and passed tracking settings checks.
4. Deploy the default-V2 backend for everyone. There is no enrollment variable.
   Keep legacy upload compatibility for queued data and preserve historical
   definition versions.

These are operator commands and configuration steps, not actions performed by
this documentation. No store release, OTA publication, or minimum-version change
has been executed.

References: [EAS Update](https://docs.expo.dev/eas-update/introduction/),
[EAS Submit](https://docs.expo.dev/submit/introduction/),
[Apple managed apps](https://support.apple.com/guide/deployment/distribute-managed-apps-dep575bfed86/web),
[Google Play testing](https://support.google.com/googleplay/android-developer/answer/9845334).
