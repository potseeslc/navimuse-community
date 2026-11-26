# macOS M7 Build Evidence Attempt - 2026-08-29

This record captures a local M7 evidence attempt. It is not a signed or notarized
release candidate, and it does not satisfy M7 exit.

## Command

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --build
```

## Captured Environment

- Commit: `4daca8a4ea7fea26d8671fab1fe095debbbb80df`
- Dirty state: clean
- Package version: `0.2.0-preview.1`
- macOS: `26.6.2` build `25G83`
- Architecture: `arm64`
- Rust: `rustc 1.88.0`, `cargo 1.88.0`
- Rust target: `aarch64-apple-darwin`
- Node: `v26.7.0`
- npm: `11.19.0`
- Tauri CLI: `2.11.4`
- Local code-signing identities: `0 valid identities found`
- Apple notarytool: available
- BFF origin: `https://navimuse.example.com`
- App bundle path:
  `/Users/developer/.buzz/REPOS/navimuse-m6-lifecycle/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app`

## Result

- `buildAttempted`: `true`
- `verificationAttempted`: `false`
- `buildStatus`: `"passed"`
- `appBundleExists`: `true`

Current-head `--build` result on committed head
`6b39fad60561c0295c8eef42e9bb81dc7c158a45`:

- Dirty state: clean
- `buildStatus`: `"passed"`
- `appBundleSignatureDetails.status`: `passed`
- `Signature`: `adhoc`
- `TeamIdentifier`: `not set`
- `clientServiceCredentials.status`: `passed`
- `signingPrerequisites.status`: `needs-review`
- `validIdentityCount`: `0`
- `notarytool.status`: `passed`
- `appBundleCodesign.status`: `unavailable`
- `appBundleGatekeeper.status`: `unavailable`
- Codesign and Gatekeeper both reported:
  `NaviMuse.app: code has no resources but signature indicates they must be present`

## Follow-Up Verify Attempt

Command:

```sh
NAVIMUSE_M7_COMMAND_TIMEOUT_MS=120000 VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --verify
```

Result on clean head `c4145a6691dcc94b906cdbf5430e609d65536d58`:

- `productionBuild.status`: `passed`
- `clientServiceCredentials.status`: `passed`
- `signingPrerequisites.status`: `needs-review`
- `validIdentityCount`: `0`
- `notarytool.status`: `passed`
- `testSuite.status`: `timed-out` under the bounded 120 second evidence cap

Clean follow-up `--verify` result on committed head
`d1ca38837fa8ced291f2065788b6be07d499b838`:

- Dirty state: clean
- `productionBuild.status`: `passed`
- `testSuite.status`: `passed`
- `clientServiceCredentials.status`: `passed`
- `signingPrerequisites.status`: `needs-review`
- `validIdentityCount`: `0`
- `notarytool.status`: `passed`
- Remaining automated incomplete evidence:
  `buildStatus`, `automatedChecks.appBundleCodesign`,
  `automatedChecks.appBundleGatekeeper`, and
  `automatedChecks.signingPrerequisites`

Security-review note: the earlier `NAVIMUSE_SETUP_TOKEN` dist finding was a
marker-name match, not a captured credential value. The evidence script reports
only known marker labels and relative asset paths so reviewers can inspect the
bundle without publishing secrets. The follow-up committed verify run above
returned `clientServiceCredentials.status`: `passed`, with no service credential
environment variables and no dist-asset marker matches.

Follow-up isolated test investigation:

- Command: `NODE_ENV=test node --test test/layoutBrowser.test.mjs`
- The first three layout-browser cases passed before the process stalled in a
  headless Chrome `--dump-dom` run for the mini-player layout fixture.
- A temporary isolated-profile experiment converted the stall into bounded
  `ETIMEDOUT` failures, but made the `--dump-dom` cases too slow to keep; that
  experiment was reverted.
- The layout-browser tests were moved from repeated `--dump-dom` Chrome launches
  to the existing isolated CDP browser helper. The isolated layout suite then
  passed: 8/8 in 128562 ms, with the mini-player fixture completing in 86960 ms.
- Full `npm test` then passed on the same uncommitted harness fix path:
  496/496 in 116877 ms. The current-head clean M7 `--verify` rerun captured
  `testSuite.status`: `passed` with 496/496 tests in 136418.801375 ms.

## Current-Head Verify Evidence

Command:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --verify
```

Result on clean head `d3143ef5e0069878b17752c0b00f60baae69e9b0`:

- `productionBuild.status`: `passed`
- Production assets:
  `index-Bhuk6jS7.js`, `index-eTeZrjC5.css`, and
  `reglAtlasRenderer-DyXJwCzc.js`
- `testSuite.status`: `passed`
- Full test summary: 509/509 passed in 33743.350666 ms
- `clientServiceCredentials.status`: `passed`
- `clientServiceCredentials.environmentVariables`: `[]`
- `clientServiceCredentials.distAssetMatches`: `[]`
- `signingPrerequisites.status`: `needs-review`
- `validIdentityCount`: `0`
- `developerIdIdentityCount`: `0`
- `notarytool.status`: `passed`
- `appBundleSignatureDetails.status`: `not-run`
- `appBundleSignatureDetails.reason`: `no build in this evidence run`
- Tauri macOS signing posture: `hardenedRuntime=true`, entitlements file
  `src-tauri/entitlements.plist` with an empty entitlement dictionary
- Release sealing helper posture: `-- --release` uses `codesign --options
  runtime --entitlements src-tauri/entitlements.plist` with the selected
  Developer ID identity; ad-hoc sealing remains a local resource-sealing
  preflight only

Intermediate clean-head verify on
`f92c8abc5eb86e55b5c52f2a63b3428c5a908480` passed the production build and
client credential scan, including the explicit `POCKET_ID_` dist marker, but
reported `testSuite.status`: `unavailable` after two Chrome/CDP-heavy layout
browser tests failed with browser attach/open instability. Follow-up commit
`a5fe2249d0222825a3b3467d6adbfe74ca56c33a` reuses one Chrome session inside
the mini-player and track-action viewport sweeps. The isolated
`test/layoutBrowser.test.mjs` suite then passed 8/8 in 45008.249 ms before a
full clean-head `--verify` rerun passed 503/503. A later current-head `--verify`
on `8e23d4a74b00cbebe4c403edaf1554b245355016`, after the command-timeout and
numeric-redaction hardening, passed 505/505. The next current-head `--verify`
on `a79ca81c37daa06eeb3c84884fdad8a0cc4a5f81`, after unscanned dist-entry
coverage and CDP DPR normalization, passed 506/506. The next current-head
`--verify` on `5fc3bcd7ee7f22c4be42165b9bb154280ddd674d`, after redaction,
source-map credential-scan, evidence-timeout, session-evidence, and
layout-browser harness hardening, passed 509/509. The current-head `--verify`
on `a657a789aa45b8a4b89223d96331c766c74e411a`, after the evidence-doc refresh,
again passed 509/509. The exact PR-head `--verify` on
`d3143ef5e0069878b17752c0b00f60baae69e9b0`, after the final docs-only evidence
refresh, again passed 509/509.

Remaining automated incomplete evidence on this verify-only run:
`buildStatus`, `automatedChecks.appBundleSeal`,
`automatedChecks.appBundleCodesign`, `automatedChecks.appBundleGatekeeper`, and
`automatedChecks.signingPrerequisites`.

## Current-Head Build Evidence

Command:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --build
```

Result on clean head `6ef7ee848c5f22a9ba3535114c9ebe0fed3f75d1`:

- `buildAttempted`: `true`
- `releaseSealAttempted`: `false`
- `buildStatus`: `passed`
- `automatedChecks.appBundleSeal.status`: `passed`
- `automatedChecks.appBundleCodesign.status`: `passed`
- `automatedChecks.appBundleGatekeeper.status`: `unavailable`
- Gatekeeper output: `NaviMuse.app: rejected`
- `clientServiceCredentials.status`: `passed`
- `clientServiceCredentials.environmentVariables`: `[]`
- `clientServiceCredentials.distAssetMatches`: `[]`
- `signingPrerequisites.status`: `needs-review`
- `validIdentityCount`: `0`
- `developerIdIdentityCount`: `0`
- `notarytool.status`: `passed`
- `appBundleSignatureDetails.status`: `passed`
- `Signature`: `adhoc`
- `TeamIdentifier`: `not set`
- `Sealed Resources version=2 rules=13 files=0`

The `--build` evidence path now runs `native:macos:seal-app` after a successful
Tauri build. This proves the local bundle-resource seal and codesign preflight
inside the M7 evidence record, but it remains ad-hoc evidence and does not
satisfy the Developer ID, notarization, or Gatekeeper release gates.

Current-head release-mode fail-closed check:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --build --release
```

Result on clean head `225349bf2fca19d59c06c5310f9a149a7d9dd1c7`:

- `buildAttempted`: `true`
- `releaseSealAttempted`: `true`
- `buildStatus`: `passed`
- `automatedChecks.appBundleSeal.status`: `unavailable`
- `automatedChecks.appBundleSeal.output`: release sealing requires
  `NAVIMUSE_MACOS_CODESIGN_IDENTITY` or `--identity`
- `automatedChecks.appBundleCodesign.status`: `not-run`
- `automatedChecks.appBundleGatekeeper.status`: `not-run`
- `appBundleSignatureDetails.status`: `not-run`
- `clientServiceCredentials.status`: `passed`
- `signingPrerequisites.status`: `needs-review`
- `validIdentityCount`: `0`
- `developerIdIdentityCount`: `0`
- `notarytool.status`: `passed`

This proves the release-mode build path refuses to downgrade to ad-hoc signing
when Developer ID credentials are absent.

## Current-Head Diagnostics Evidence

Command:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm run native:macos:diagnostics
```

Result on clean head `1e9c867d1fe9873112d6ce93279da7cda8b1fc47`:

- Output path:
  `.scratch/diagnostics/navimuse-macos-diagnostics-2026-08-30T02-43-59-793Z.json`
- `diagnosticType`: `navimuse-macos-support-diagnostics`
- `contract`: `docs/support-diagnostics.md`
- `repository.commit`: `1e9c867d1fe9873112d6ce93279da7cda8b1fc47`
- `repository.branch`: `hardening/m7-release-checklist`
- `repository.dirtyState`: `""`
- `commandTimeoutMs`: `30000`
- `environment.bffOrigin`: `https://navimuse.example.com`
- `environment.serviceCredentialVariables`: `{ "count": 0, "prefixes": [] }`
- `appBundle.exists`: `true`
- `.scratch/diagnostics` permissions: `drwx------`
- diagnostics JSON permissions: `-rw-------`
- spot check for high-risk literals found no unredacted
  `NAVIDROME_PASSWORD`, `AUDIOMUSE_API_TOKEN`, `POCKET_ID_CLIENT_SECRET`,
  `NAVIMUSE_SETUP_TOKEN`, `NAVIMUSE_OIDC_CLIENT_SECRET`, `navimuse_session`,
  raw `item_id=`, or raw `token=` values.

This verifies the local diagnostics command and support-bundle shape. It does
not replace the remaining release-candidate diagnostics review that should be
performed against the signed/notarized app before claiming M7 exit.

## Current-Head Evidence Bundle

Current repository and PR evidence is aligned on clean head
`0d9bf9d8e1a7da29c131fa35c4931e60ef1471ef`:

- Verify evidence, posted to PR #177 as comment 3851, used
  `npm --silent run native:macos:m7-evidence -- --verify`. It recorded
  `evidenceSchemaVersion`: `1`, passed the production build check, passed the
  full 510-test suite, and found no client service credential environment or
  dist-asset matches.
- Local build evidence, posted as comment 3852, used
  `npm --silent run native:macos:m7-evidence -- --build`. It passed the local
  Tauri build, ad-hoc bundle seal, bundle tree checksum, and local
  `codesign --verify --deep --strict --verbose=2`; Gatekeeper rejected the
  ad-hoc/non-notarized bundle as expected.
- Release-mode fail-closed evidence, posted as comment 3854, used
  `npm --silent run native:macos:m7-evidence -- --build --release`. It passed
  the local build, then refused release sealing without
  `NAVIMUSE_MACOS_CODESIGN_IDENTITY` or `--identity`, leaving checksum,
  codesign, and Gatekeeper checks not-run behind the failed release seal.
- Diagnostics evidence, posted as comment 3856, generated a redacted support
  diagnostics JSON artifact for the same clean head with 0700 diagnostics
  directory permissions, 0600 file permissions, a redacted BFF origin, and no
  injected diagnostic secret values or secret env-var names in the serialized
  JSON.

This bundle proves the current repo-side automated M7 posture. It does not
replace the remaining Developer ID signing, Apple notarization, post-staple
Gatekeeper acceptance, or pinned MacBook Air manual evidence required for M7
exit.

The credential-scan evidence is intentionally value-free: historical failures
recorded marker labels such as `NAVIMUSE_SETUP_TOKEN` and the affected asset path
only. No setup token, OIDC secret, provider token, service password, cookie, or
library identifier value was copied into this document or the PR comments.

Follow-up signed release evidence on
`7a846fed1b5036f018b6ce623503e804c12f9395` cleared the Apple release gate:

- Developer ID Application signing prerequisites passed with team
  `ABCDE12345`.
- Release-mode M7 evidence passed the local build, Developer ID app-bundle seal,
  bundle checksum, local `codesign --verify --deep --strict --verbose=2`,
  signature details, and client credential scan.
- Apple notarization submission `50db7360-dfe1-4fe8-97cb-37a27cf81d58`
  returned `Accepted`.
- `xcrun stapler staple` and `xcrun stapler validate` passed for
  `NaviMuse.app`.
- Post-staple `spctl -a -vv` returned `accepted` with
  `source=Notarized Developer ID`.

This satisfies the signed-artifact and notarization command evidence for that
release candidate. M7 exit still requires the pinned MacBook Air manual release
pass and the remaining checklist reviews against the accepted artifact.

## Blockers Found

- Codesign verification did not pass:
  `NaviMuse.app: code has no resources but signature indicates they must be present`
- Gatekeeper verification did not pass with the same bundle signature/resource
  error:
  `NaviMuse.app: code has no resources but signature indicates they must be present`
- Follow-up inspection showed the generated executable was ad-hoc signed, but
  the `.app` bundle itself was not sealed: `Info.plist=not bound` and
  `Sealed Resources=none`.
- Manually sealing the `.app` with an ad-hoc signature made
  `codesign --verify --deep --strict --verbose=2` pass locally, but
  `spctl -a -vv` still returned `rejected`, as expected for a non-notarized
  ad-hoc test artifact.
- Follow-up work added `npm run native:macos:seal-app` so this ad-hoc resource
  sealing step is repeatable and can later require a real Developer ID identity
  with `-- --release`.
- Current-head sealing helper evidence on `571385fb758a10bb79335d7219ebce59ae946133`:
  `npm run native:macos:seal-app` exited 0, reported `sealStatus`: `passed`,
  and `verification.status`: `passed`. Follow-up `codesign -dv --verbose=4`
  showed `Signature=adhoc`, `TeamIdentifier=not set`, `Info.plist entries=14`,
  and `Sealed Resources version=2 rules=13 files=0`. `spctl -a -vv` still
  returned `rejected`, as expected until the artifact is Developer ID signed and
  notarized.
- M7 signing prerequisites are not satisfied on this machine because no valid
  Developer ID Application signing identity is installed.
- Client service credential scanning returned `needs-review` because the built
  asset scan found `NAVIMUSE_SETUP_TOKEN in dist/assets/index-BJT4eZt9.js`.
  Follow-up commit `257a744` removed the client-facing env-var placeholder text;
  after rebuilding, the dist scan found no `NAVIMUSE_SETUP_TOKEN` marker and
  `clientServiceCredentials.status` returned `passed`.
- The evidence command did not run the production build or full test suite as
  automated checks because it was invoked with `--build`, not `--verify`. A
  later bounded `--verify` attempt passed production build evidence but timed
  out during the full `npm test` run; isolated investigation points to
  `test/layoutBrowser.test.mjs`, which now passes through the CDP-backed harness.
  Full `npm test` also completed successfully after the harness change, and a
  clean M7 `--verify` rerun captured both production build and test-suite checks
  as passed.
- A later clean-head `--verify` on `f92c8ab` exposed residual CDP launch
  instability in the layout browser sweeps after the Pocket ID scan fix. The
  browser harness now reuses a Chrome session for the two widest viewport
  sweeps, and the follow-up clean-head `--verify` on `a5fe224` passed the full
  503-test suite.
- A later clean-head `--verify` on `8e23d4a` after timeout parsing and numeric
  JSON secret redaction hardening passed the production build, credential scan,
  and 505-test full suite.
- A later clean-head `--verify` on `a79ca81` after unscanned dist-entry
  coverage and CDP DPR normalization passed the production build, credential
  scan, and 506-test full suite.
- Manual M7 evidence remains scaffolded for signing, notarization, update and
  rollback, long-session behavior, WebGL recovery, accessibility,
  privacy/security, and migration. Diagnostics command behavior has local
  evidence, but final release-candidate diagnostics review still remains.

## Next Actions

1. Configure the release candidate for bundle sealing with the intended
   Developer ID Application identity, hardened runtime, and entitlements, then
   rerun the build evidence.
2. Produce a real Developer ID signed and Apple-notarized release candidate.
3. Complete the pinned MacBook Air manual evidence runs before claiming M7 exit.
