# macOS M7 Release Hardening Evidence

M7 turns the authenticated, functional NaviMuse macOS app into a release candidate.
This gate is stricter than M2 lifecycle proof and M6 Sonic Atlas proof: every item
below must be recorded against the same release candidate commit and pinned target
device before M7 exit can be claimed.

## Release Candidate

Create one evidence record for each release candidate:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence
```

Use `--build` only when the local machine has the required Rust target, signing
identity, and notarization credentials available:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --build
```

Add `--release` to the build evidence command when producing the actual release
candidate. This requires `NAVIMUSE_MACOS_CODESIGN_IDENTITY` or `--identity` for
the selected Developer ID Application certificate through the sealing helper:

```sh
NAVIMUSE_MACOS_CODESIGN_IDENTITY="Developer ID Application: Example Team (TEAMID)" VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --build --release
```

The evidence record is not sufficient by itself for public distribution. Manual
observations must be filled in with timestamps, commands, screenshots, system
reports, notarization identifiers, or explicit skipped reasons on the eventual
release candidate. For this PR, manual distribution rows are marked
`moved-to-m8-release-readiness`, and `incompleteEvidence` reports only automated
checks that did not pass in the current M7 planning-gate run.

The evidence record also reports local signing prerequisites. M7 cannot produce
the final release candidate on a machine that lacks a valid Developer ID
Application signing identity and notarization credentials, even if local ad-hoc
bundle sealing succeeds.

If a local Tauri build produces an unsealed ad-hoc `.app`, run
`npm run native:macos:seal-app` to re-seal the generated bundle for local
diagnosis. This can turn local `codesign --verify` into a useful preflight, but
it does not satisfy the signed-artifact, notarization, or Gatekeeper exit gates.
The M7 `--build` evidence path runs the same sealing preflight after a successful
Tauri build so its automated codesign result reflects the sealed bundle, not the
raw generated artifact. Without `--release`, this remains an ad-hoc local
preflight. With `--release`, the evidence run requires the selected Developer ID
identity, rejects identity values that begin with `-`, omits ad-hoc recursive
signing, and records `releaseSealAttempted`.

After sealing passes, the evidence record also captures
`automatedChecks.appBundleChecksum`: a SHA-256 directory-tree digest over the
sealed `.app` bundle file paths, sizes, and contents. This fingerprints the
checked bundle for release review; any distribution archive or notarization
container must still have its own separately recorded checksum.

First-time Rust/Tauri release builds can exceed the default evidence timeout on
some machines. Set `NAVIMUSE_M7_COMMAND_TIMEOUT_MS` to a larger value when a
timeout, rather than a code or signing failure, is the limiting factor.

Add `--verify` when you want the evidence script to run the production build and
full test suite as part of the automated evidence capture:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --verify
```

Use `npm --silent run` for release evidence commands that are redirected to a
file. It suppresses npm's script banner so stdout remains one parseable JSON
evidence object.

## Local Evidence Attempts

- 2026-08-29 local build evidence: [`macos-m7-build-attempt-2026-08-29.md`](macos-m7-build-attempt-2026-08-29.md). Follow-up verify evidence passed the production build, full test suite, and client credential scan. Local ad-hoc sealing can now prove bundle resources are sealed, but Gatekeeper still rejects the artifact until NaviMuse has a real Developer ID signature and accepted notarization, so this attempt is not a signed/notarized release candidate.
- 2026-08-30 signed/notarized release evidence: [`macos-m7-signing-notarization.md`](macos-m7-signing-notarization.md), [`macos-m7-launch-smoke-2026-08-30.md`](macos-m7-launch-smoke-2026-08-30.md), and PR comment `#3904`. The current PR head `7f506911295a87229bdffe1292598d330e3ed0b2` passed Developer ID signing, Apple notarization, stapling, local post-staple Gatekeeper assessment, and a pinned MacBook Air launch smoke check. The product owner accepted prior two-hour listening evidence instead of requiring a fresh full-window rerun.
- 2026-08-30 gate decision: product owner accepted M7 as a hardening/planning gate rather than a distribution-release gate because larger product release gaps remain. Current head `1f89785b91f4ae490c842a2b99ebd90263c32447` passed focused Atlas/Tauri M7 tests and diagnostics redaction review, and it built with Developer ID signing prerequisites available. Apple notarization and final distribution proof for this head moved to M8 release-readiness scope because the local `notarytool` keychain profile is not currently present and the product is not ready for public macOS distribution.

## Checklist

| Area | Required evidence | Status |
| --- | --- | --- |
| Signed artifact | Developer ID Application identity, hardened runtime settings, entitlements, bundle checksum, `codesign --verify --deep --strict --verbose=2`, and `spctl -a -vv`. See [`macos-m7-signing-notarization.md`](macos-m7-signing-notarization.md). | Passed for earlier signed/notarized `7f50691`; current `1f89785` signed-build evidence captured and accepted for M7 planning gate |
| Notarization | `notarytool submit` identifier, accepted result, staple result, and post-staple Gatekeeper verification. See [`macos-m7-signing-notarization.md`](macos-m7-signing-notarization.md). | Moved to M8 release-readiness for current head; previous `7f50691` proof passed |
| Update channel | Release feed or distribution channel, rollback instructions, failed-update recovery notes, and version/channel compatibility. See [`macos-m7-update-rollback.md`](macos-m7-update-rollback.md). | Manual private-preview channel and rollback rehearsal recorded for `7f50691` |
| Long session | At least one long real listening session on the pinned MacBook Air with memory, battery, thermal, network, sleep/wake, and output-device observations. See [`macos-m7-long-session.md`](macos-m7-long-session.md). | Prior endurance accepted by product owner; current RC launch/stability spot-check recorded |
| WebGL recovery | Pinned macOS WebView evidence for Atlas renderer context-loss recovery without stopping ordinary playback. See [`macos-m7-webgl-recovery.md`](macos-m7-webgl-recovery.md). | Deterministic context-loss trigger and sticky evidence result added; accepted for M7 planning gate with final packaged proof deferred |
| Accessibility | VoiceOver, keyboard, focus order, contrast, and reduced-motion audit across Home, Library, Search, Sonic Atlas, queue, player, and Settings. See [`macos-m7-accessibility.md`](macos-m7-accessibility.md). | Automated accessibility coverage passed; live VoiceOver/contrast audit pending |
| Privacy/security | Review of BFF auth, cookies, keychain/local data, logs, deep links, cache contents, and client bundle credential exposure. See [`macos-m7-privacy-security-review.md`](macos-m7-privacy-security-review.md). | Current `1f89785` diagnostics redaction and focused privacy spot evidence passed; broader release review remains for distribution |
| Migration | Existing PWA settings, queue persistence, session recovery, and Atlas Journey persistence migration plan with rollback behavior. See [`macos-m7-migration.md`](macos-m7-migration.md). | Storage compatibility/fail-closed behavior passed; live observation optional |
| Diagnostics | Support and diagnostic bundle contract covering what is collected, what is redacted, where it is stored, and how users can share it. See [`support-diagnostics.md`](support-diagnostics.md). | Passed for `7f50691` support diagnostic review |

## Exit Rule

M7 may pass as a hardening/planning gate when the product owner explicitly
accepts moving distribution evidence into M8 and every moved item is recorded in
[`plans/NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md`](plans/NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md).
For this PR, "passed" means the M7 hardening contracts, scripts, tests, and
known evidence records are ready to carry forward; it does not mean the current
head is the public distribution candidate.
A distribution release still requires one candidate commit with complete
evidence for every checklist area, a signed and notarized Apple Silicon app
bundle, and a pinned target device release checklist without unexplained dirty
source state.

The current manual-review rows resolve as follows for the M7 planning gate:
signed/notarized proof exists for earlier candidate `7f50691`; final current-head
notarization, stapling, Gatekeeper, packaged WebGL proof, release-channel record,
rollback rehearsal, diagnostics review, and live accessibility/long-session
audits are tracked as M8 release-readiness work before public distribution.
