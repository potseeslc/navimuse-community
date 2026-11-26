# macOS M7 Launch Smoke Evidence - 2026-08-30

This is a pinned MacBook Air smoke check against the signed and notarized M7
release candidate. It does not replace the full two-hour long-session,
accessibility, migration, update-channel, WebGL recovery, or privacy/security
manual reviews required for M7 exit.

## Release Candidate

- Commit: `5127fd2ac82c9f24c0741347a8879859bb456af9`
- Dirty state: `''`
- Package version: `0.2.0-preview.1`
- BFF origin: `https://navimuse.example.com`
- App bundle path: `/Users/developer/.buzz/REPOS/navimuse-m6-lifecycle/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app`
- App bundle exists: `True`

## Pinned Device

```text
ProductName:		macOS
ProductVersion:		26.6.2
BuildVersion:		25G83
arch: arm64
```

Hardware captured separately with `system_profiler` showed MacBook Air
`Mac14,2`, Apple M2, 8 GB memory, running macOS `26.6.2 (25G83)`.

## Launch Smoke Result

- Gatekeeper before launch: `/Users/developer/.buzz/REPOS/navimuse-m6-lifecycle/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app: accepted | source=Notarized Developer ID | origin=Developer ID Application: Example Developer (ABCDE12345)`
- Codesign verification before launch: `/Users/developer/.buzz/REPOS/navimuse-m6-lifecycle/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app: valid on disk | /Users/developer/.buzz/REPOS/navimuse-m6-lifecycle/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app: satisfies its Designated Requirement`
- Direct launch command: `NaviMuse.app/Contents/MacOS/navimuse`
- Direct launch result: process stayed alive for the launch probe with no stdout
  or stderr.
- Process snapshot after launch:

```text
88277 S 0.0 0.2 15040 /Users/developer/.buzz/REPOS/navimuse-m6-lifecycle/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app/Contents/MacOS/navimuse
```

- Screenshot evidence: `.scratch/m7-notarization/navimuse-launch-smoke-5127fd2.png`
- Diagnostics evidence: `.scratch/diagnostics/navimuse-macos-diagnostics-2026-08-30T15-05-10-067Z.json`
- Diagnostics JSON permissions: `0600`; diagnostics directory permissions:
  `0700`; injected launch-smoke secret and URL identifier values were absent
  and redaction markers were present.

## Current-Head Follow-Up

The pinned-device launch observation above remains the manual launch smoke
record. After later M7 hardening documentation updates, release evidence was
refreshed for PR head `7f506911295a87229bdffe1292598d330e3ed0b2`: Developer ID
signing, Apple notarization, stapling, post-staple Gatekeeper assessment, and
support diagnostics all passed for the signed `7f50691` artifact. See PR comment
`#3904`, notarization submission
`88a039ae-0d46-4b4d-bf19-cfec8969d50b`, archive
`.scratch/m7-notarization/NaviMuse-7f50691-20260830T160313Z-signed.zip`, and
diagnostics file
`.scratch/diagnostics/navimuse-macos-diagnostics-2026-08-30T16-04-48-942Z.json`.

## Remaining Manual Evidence

The native session evidence scaffold remains pending for authentication,
playback controls, sleep/wake, network recovery, output-device changes, media
keys, now-playing metadata, battery, memory over a listening window, crash logs,
WebGL recovery, accessibility, migration, update-channel, and privacy/security
review.
