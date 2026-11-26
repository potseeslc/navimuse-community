# macOS M7 Signing and Notarization Proof

M7 must produce one Apple Silicon release candidate that is signed for
distribution, notarized by Apple, stapled when applicable, and accepted by
Gatekeeper on the pinned MacBook Air. Ad-hoc signed development bundles remain
test artifacts only.

This document is a release evidence runbook. It does not select certificates,
store credentials, or claim the current app bundle is release-ready.

## Required Inputs

Record these inputs before building:

- release candidate commit SHA and package version;
- Tauri CLI version, Rust toolchain, macOS SDK, and deployment target;
- `aarch64-apple-darwin` target availability;
- BFF origin used at build time;
- Developer ID Application certificate common name and Team ID;
- hardened runtime and entitlements decision record;
- notarization credential source or keychain profile name, never the secret value;
- expected app bundle path and generated artifact checksums.

Before release evidence capture, set
`NAVIMUSE_NOTARYTOOL_KEYCHAIN_PROFILE` to the saved `notarytool`
keychain-profile name. The M7 evidence JSON records that this source is
configured, but it does not store the profile value, Apple ID passwords, issuer
secrets, API private keys, or keychain contents in the repository.

## Signed Artifact Procedure

Build the release candidate from a clean source state:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --build
```

For the actual release candidate, require release sealing inside the same M7
evidence run:

```sh
NAVIMUSE_MACOS_CODESIGN_IDENTITY="Developer ID Application: Example Team (TEAMID)" VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm --silent run native:macos:m7-evidence -- --build --release
```

If the generated `.app` needs an explicit post-build resource seal for local
diagnosis, run:

```sh
npm run native:macos:seal-app
```

This defaults to an ad-hoc signature and exists only to prove bundle resource
sealing and local `codesign --verify` behavior. For release sealing, provide the
selected Developer ID Application identity and require a non-ad-hoc identity:

```sh
NAVIMUSE_MACOS_CODESIGN_IDENTITY="Developer ID Application: Example Team (TEAMID)" npm run native:macos:seal-app -- --release
```

Release sealing uses `codesign --deep --options runtime --entitlements
src-tauri/entitlements.plist` with the selected identity and rejects identity
values that begin with `-`. Prefer the certificate SHA-1 hash from
`security find-identity -v -p codesigning` when duplicate Developer ID
Application common names are present in the keychain; this avoids ambiguous
identity selection while still producing a Developer ID signature.

The M7 helper keeps `--deep` for the generated thin Tauri bundle because the
current bundle has no separately managed nested application code and the command
has passed local Developer ID signing verification on the pinned MacBook Air. The
M8 distribution candidate must revisit component-by-component signing if the
bundle adds frameworks, extensions, helpers, sidecars, or other nested code.

Then record:

1. clean Git status before the build or an explanation for every dirty file;
2. generated `.app` path, bundle identifier, version, and architecture;
3. signing identity from `codesign -dv --verbose=4`;
4. hardened runtime and entitlement output;
5. verification from `codesign --verify --deep --strict --verbose=2`;
6. Gatekeeper assessment from `spctl -a -vv`;
7. checksum of the release artifact and any packaging logs.

The evidence and sealing scripts may capture automated `codesign` and `spctl`
status only after a successful build. Manual review must still confirm the
identity, entitlements, hardened runtime posture, and artifact provenance.

The Tauri macOS bundle configuration pins `hardenedRuntime` to `true` and points
to `src-tauri/entitlements.plist`. The only application entitlement is
`com.apple.developer.associated-domains`, limited to
`webcredentials:id.example.com`. It exists so the production Pocket ID relying
party can perform passkey authentication inside the packaged `WKWebView`. The
release record must verify the signed entitlement and the matching public AASA
entry; neither side is sufficient by itself.

## Notarization Procedure

Submit only the release candidate artifact that passed signed-artifact checks.
Record:

1. `notarytool submit` command shape with credential names redacted;
2. Apple submission ID;
3. accepted or rejected result;
4. notarization log path or exported result, with secrets redacted;
5. `stapler staple` result when the artifact supports stapling;
6. post-staple `spctl -a -vv` Gatekeeper result;
7. any Apple warnings, follow-up fixes, or explicit skipped reason.

Rejected notarization does not fail the branch by itself, but it blocks M7 exit
until the cause is fixed and a new release candidate passes.

Treat the submitted archive as immutable and retain it until stapling completes.
Extract the app from that exact archive before stapling if any build, test, or
evidence command has run since submission; never assume the mutable build-tree
bundle still carries the submitted code signature.

## Pass Criteria

The release candidate passes this item only when:

- the signed artifact was built from the recorded commit;
- the signature is a Developer ID Application signature for the intended team;
- hardened runtime and entitlements are recorded and match the release decision;
- `codesign --verify --deep --strict --verbose=2` passes;
- Apple notarization is accepted;
- stapling is completed or an accepted reason explains why it is not applicable;
- post-staple Gatekeeper verification passes on the pinned MacBook Air;
- no signing or notarization secret appears in logs, diagnostics, or the client
  bundle.

## Current Status

Status: signed and notarized release candidate captured for current PR head;
pinned-device manual evidence still pending.

The 2026-08-30 release candidate on
`7f506911295a87229bdffe1292598d330e3ed0b2` used Developer ID Application team
`ABCDE12345` with hardened runtime enabled and
`src-tauri/entitlements.plist`. Apple notarization submission
`88a039ae-0d46-4b4d-bf19-cfec8969d50b` returned `Accepted`, `stapler staple`
and `stapler validate` both passed, `codesign --verify --deep --strict
--verbose=2` passed, and `spctl -a -vv` returned `accepted` with
`source=Notarized Developer ID`.

M7 still needs the pinned MacBook Air manual release pass, including launch,
listening-session, diagnostics-review, accessibility, migration, update-channel,
and privacy/security evidence against the accepted release candidate before M7
exit can be claimed.
