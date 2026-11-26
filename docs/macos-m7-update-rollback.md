# macOS M7 Update and Rollback Contract

M7 requires a controlled release channel even before NaviMuse enables automatic
native updates. The first release channel is manual private preview distribution:
one signed and notarized Apple Silicon `.app` bundle per release candidate, tied
to one Git commit, one package version, one BFF origin, and one rollback record.

## Channel Policy

- Publish only bundles built from a clean release candidate commit.
- Keep the PWA deployment operational during the native release so it remains the
  emergency fallback.
- Do not enable Tauri automatic updates until the app has a signed update feed,
  update signature management, rollback behavior, and failed-update recovery
  evidence.
- Treat ad-hoc signed development bundles as test artifacts only; they are not
  release-channel artifacts.
- Record the exact package version, commit SHA, generated bundle path, signing
  identity, notarization submission, and staple result for every release
  candidate.

## Rollback Procedure

1. Stop distributing the failing `.app` bundle.
2. Restore distribution of the previous accepted signed/notarized bundle.
3. Keep or restore the matching PWA deployment if native playback is affected.
4. Record whether user data is backward compatible, including session cookies,
   saved settings, queue persistence, track feedback cache, and Atlas Journey
   persistence.
5. Run the M7 evidence command against the restored version and attach the output
   to the rollback record.
6. Record the reason for rollback, user-visible symptoms, affected versions,
   mitigations, and follow-up PR or milestone.

## Required Release Record

Each release candidate must record:

- release channel name and distribution location;
- commit SHA, package version, and build timestamp;
- app bundle path, archive path if any, and checksum;
- signing identity, notarization ID, staple result, and Gatekeeper result;
- update or install instructions;
- rollback target version and rollback steps;
- compatibility notes for PWA settings and local persisted state;
- diagnostic bundle path for the release candidate, reviewed before sharing.

## Current Status

Status: manual private-preview channel recorded for the accepted release
candidate; automatic updates remain disabled.

The active M7 release channel is manual private preview distribution. Do not
enable Tauri automatic updates for this release candidate; the rollback path is
to stop distributing the current signed `.app` archive and direct users back to
the deployed PWA at `https://navimuse.example.com` or to the previous accepted
signed/notarized bundle if one has already been distributed.

## 2026-08-31 M8 Release Record

- Channel: manual private preview; automatic Tauri updates remain disabled.
- Release candidate commit:
  `69e749bdf1a81e1d7b851b5254a0eb2bb2b2c73e`.
- Package version: `0.2.0-preview.1`.
- BFF origin: `https://navimuse.example.com`.
- Build timestamp: `2026-08-31T18:30:28.233Z`.
- Distribution archive:
  `.scratch/release/69e749bdf1a81e1d7b851b5254a0eb2bb2b2c73e/NaviMuse-0.2.0-preview.1-arm64-stapled.zip`.
- Archive SHA-256:
  `82691b9b92e7641801556d2e4700035a32c71a65b5a3fe522484eafe3775e935`.
- Pre-staple app-bundle tree SHA-256:
  `1bf6d2a71ed43dbebcfd2b25e82ac067784603441b5429eebc7c87e53cc49e76`.
- Signing identity:
  `Developer ID Application: Example Developer (ABCDE12345)`.
- Notarization submission: `f5a48e9c-9736-4b11-8f65-2a8060e60f0a`,
  `Accepted`.
- Staple and staple validation: passed against an app extracted from the
  immutable submitted archive.
- Post-staple verification: strict `codesign` passed and Gatekeeper returned
  `accepted`, `source=Notarized Developer ID`.
- Packaged Atlas proof:
  `.scratch/qa/m8-packaged-2026-08-31/screenshots/52-final-notarized-atlas-start-route.png`.
- Diagnostic artifact reviewed for the release candidate:
  `.scratch/diagnostics/navimuse-macos-diagnostics-2026-08-31T18-38-48-331Z.json`.

### M8 Rollback Rehearsal

Result: passed for the manual private-preview distribution boundary.

The rehearsal verified that the M8 archive is immutable and checksum-addressed,
the production PWA/BFF is healthy at the matching commit, and the previous
accepted Developer ID/notarized archive remains available as a native rollback
target:

- previous native commit:
  `46f7252fd3d9f89b91ee83bd6b0cff0188e2722e`;
- previous stapled archive:
  `.scratch/release/46f7252fd3d9f89b91ee83bd6b0cff0188e2722e/NaviMuse-0.2.0-preview.1-arm64-stapled.zip`;
- previous archive SHA-256:
  `de28ea07bf60581e23db59d544516a2e881bcb7a684b8a457c5750df5bada61a`.

Rollback is distribution-level: stop sharing the M8 archive, keep the PWA/BFF
online, and either return preview users to the PWA or restore the previous
notarized archive. The M8 change does not rename persisted settings, queue,
feedback, or Atlas Journey storage keys, so the prior app can fail closed on any
newer state without a destructive migration. The completed-position repair
normalizes stale end-of-track positions at read time and does not rewrite the
queue schema.

## 2026-08-30 Release Record

- Channel: manual private preview.
- Release candidate commit: `7f506911295a87229bdffe1292598d330e3ed0b2`.
- Package version: `0.2.0-preview.1`.
- BFF origin: `https://navimuse.example.com`.
- Build timestamp: `2026-08-30T16:01:46.000Z`.
- App bundle path:
  `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app`.
- Distribution archive:
  `.scratch/m7-notarization/NaviMuse-7f50691-20260830T160313Z-signed.zip`.
- Archive SHA-256:
  `d236df0661e36f9ed9f9fdec27d3664adc0ce34676ac0211ce39eb129db30a98`.
- App bundle tree SHA-256:
  `529e5762e21a2a61e505b1cad8513acece3410e53b2e664b61f8358b621fe0c0`.
- Signing identity:
  `Developer ID Application: Example Developer (ABCDE12345)`.
- Notarization submission: `88a039ae-0d46-4b4d-bf19-cfec8969d50b`,
  `Accepted`.
- Staple result: `xcrun stapler staple` passed.
- Staple validation: `xcrun stapler validate` passed.
- Post-staple verification: `codesign --verify --deep --strict --verbose=2`
  passed.
- Post-staple Gatekeeper: `spctl -a -vv` returned `accepted`,
  `source=Notarized Developer ID`.
- Diagnostic artifact for review:
  `.scratch/diagnostics/navimuse-macos-diagnostics-2026-08-30T16-04-48-942Z.json`.

## Rollback Rehearsal

Result: passed for the manual private-preview channel.

Because no automatic updater or signed update feed is enabled in M7, rollback is
distribution-level rather than in-app update reversal. The rehearsal confirmed
that the accepted release candidate is tied to a clean commit, package version,
BFF origin, notarized archive checksum, and post-staple Gatekeeper result, and
that the PWA remains the documented fallback route if native distribution is
stopped.

Rollback steps for this release candidate:

1. Stop sharing
   `.scratch/m7-notarization/NaviMuse-7f50691-20260830T160313Z-signed.zip`.
2. Keep `https://navimuse.example.com` serving the PWA and BFF.
3. Tell preview users to use the PWA while the native artifact is replaced.
4. If a prior signed/notarized NaviMuse `.app` archive has already been accepted
   for the same BFF origin, distribute that prior archive instead.
5. Record the affected native commit, the visible symptom, and the replacement
   commit or PWA-only mitigation in the release issue before resuming native
   distribution.

Compatibility notes: M7 does not enable an updater, does not rename persisted
client storage keys, and does not remove the PWA. Native WebView storage remains
isolated from ordinary browser PWA storage unless a future migration explicitly
records a supported transfer path.
