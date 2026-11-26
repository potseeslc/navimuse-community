# iOS TestFlight pilot

Authority: ADR-003. Baseline: ec15ba6 (current live phone branch).

The iOS-specific config selects version 0.2.0, build 4, team ABCDE12345,
and bundle ID com.developer.navimuse. Confirm the bundle ID is available in
App Store Connect before registration; select a new build number if already used.
It loads https://navimuse.example.com in the main webview. Server deployments change
this UI independently of the installed shell. No general Rust IPC is enabled. Build 2 adds the restricted track bridge described below.
The macOS config and production server are unchanged.

## Reproduce

1. Install Xcode iOS platform support; allow ample disk space for the SDK/runtime,
   Rust dependencies, archive, and export (20 GB free is a reasonable starting budget).
2. Sign in to Apple Developer in Xcode Settings > Accounts. Enable iOS signing for
   the matching team and register the application in App Store Connect.
3. Run `npm ci`, then `npm run tauri:ios:init -- --ci`.
4. Run `node scripts/ios-pilot-icons.mjs` to populate the radio-tower icon catalog.
5. Run `npm run tauri:ios:build -- --ci`. Use Xcode archive validation and upload
   to App Store Connect. Confirm encryption declarations and TestFlight processing.
   Do not label a local archive as an uploaded or installable TestFlight build.

Generated `src-tauri/gen` is ignored and recreated by init. This first comparison
build retains web audio and does not add native background capabilities or promise
a fix. Native playback work follows measured device results.

## Evidence: 2026-09-08

- Xcode 26.6 (17F113); reported iPhone SDK 26.5; Rust pinned 1.88.0.
- Installed iOS Rust targets and missing CocoaPods tooling; iOS init succeeded.
- Unsigned archive attempt stopped: iOS platform not installed.
- Platform download refused: requires 8.49 GB; disk had approximately 923 MB free.
- Only macOS Developer ID signing identities found. No iOS provisioning profiles
  or App Store Connect API key files found in the standard checked directories.
- No archive, physical-device run, TestFlight upload, or playback acceptance yet.

## Device acceptance

Record iOS/device version, shell build, and live JS asset revision. Test login and
session restoration; library/player navigation; foreground and background start,
pause/resume; lock-screen previous/next; uninterrupted album advance; speaker,
AirPods, Tesla Bluetooth, WiiM AirPlay; interruptions and network reconnect.
Compare Safari-tab and home-screen-web-app behavior. Record receiver artwork
separately from phone artwork. These checks remain open.

Local foundation regression: 19 tests passed. Icon generation and catalog copy passed.

## Xcode setup and unsigned archive verified

On 2026-09-08 installed iOS 26.5 simulator runtime 23F77; macOS verification
completed. `cargo check --locked --target aarch64-apple-ios`, frontend build, and
`tauri ios build --ci --no-sign --archive-only` passed. Archive:
`src-tauri/gen/apple/build/navimuse_iOS.xcarchive`.

This is an unsigned device archive, not a TestFlight upload or a simulator/device
playback pass. Apple account signing, App Store Connect registration and upload
remain outstanding.

## Signed App Store export verified

After the owner signed into Xcode, `npm run tauri:ios:build -- --ci` succeeded.
Export: `src-tauri/gen/apple/build/arm64/NaviMuse.ipa` (0.2.0 build 1).
The embedded profile has no device list and disallows debugging; signature
resources are present. Package identity/hash are recorded in
`docs/evidence/m8/ios-testflight-pilot/signed-package.json`.
App Store Connect app registration, upload, Apple processing and physical QA
remain pending; a signed export is not a TestFlight acceptance result.

## App Store Connect registration and icon correction

Registered NaviMuse (Apple ID 6809988650), iOS, English (US), SKU navimuse-ios,
bundle ID com.developer.navimuse. Created internal NaviMuse Pilot group with
automatic distribution disabled and added the owner account as its sole tester.

First upload was rejected with error 90717: large icon contained an alpha channel.
The icon preparation script now uses CoreGraphics to write RGB PNGs without alpha;
`sips -g hasAlpha` reports no for the 1024px icon. Rebuilt and exported successfully.
Updated package hash is recorded in signed-package.json. Upload retry succeeded
at 2026-09-08T23:36:36Z. App Store Connect lists 0.2.0 (1) as Processing.

## TestFlight enabled

Apple completed processing. The encryption declaration selects none of the listed
app-implemented algorithms: this shell uses OS-provided HTTPS/WebKit, with service
encryption in the remote BFF. After saving, Apple marked 0.2.0 (1) Ready to Test.
Added the build to NaviMuse Pilot. Verified group: 1 tester, 1 build, status Testing.
Apple build ID: 6c97f795-d147-49b9-8067-7db80911f683.
Physical installation, login and playback acceptance remain open.

## Build 2: safe area and native track commands

The owner installed build 1 and reported Home overlapping the status bar and
lock-screen controls still showing 10-second seeking. Build 2 constrains the
WKWebView to the native safe area and registers native Previous/Next commands.
A document-start bridge calls the existing web queue handlers exactly once;
WebKit track handlers are cleared to avoid duplicate advancement. Play/Pause
and audio remain owned by WebKit. This is not a native AVPlayer implementation.

The bridge accepts only main-frame messages from the exact production HTTPS
origin, exposes only two fixed track actions, and sends only availability flags.
No credentials, track metadata, artwork URLs, or general IPC are exposed. Native
command delivery still depends on WebView execution, so background resume and
physical lock-screen behavior remain device acceptance checks. Receiver artwork
is not changed by this build.

Regenerate the ignored Apple project when adding frameworks: a repeated iOS init
can preserve an existing project.yml. The generated project must list
MediaPlayer.framework. Then regenerate the opaque icon catalog.

Validation: 22 foundation/bridge tests passed; aarch64-apple-ios cargo check
passed; unsigned aarch64-sim archive passed and installed/launched on the
iPhone 17 Pro simulator (iOS 26.5). Native UI inspection timed out twice, so
simulator launch is not visual or playback acceptance. Signed upload status is
recorded separately after export.

Build 2 signed export and upload succeeded (2026-09-09T00:18:50Z). Apple
completed processing; OS-only encryption declaration saved. Added to NaviMuse
Pilot and verified 0.2.0 (2) status Testing, one tester, two builds in the group.
Build ID 7ac670f0-0a69-4411-9f0e-bef709edeb3d. Build-specific device checks are
saved in TestFlight. Package hash and validation limits are in build-2.json.

## Build 3 feedback correction

Build 2 device feedback disproved the command-bridge approach: car commands
did nothing and lock-screen controls remained relative seeking. Build 3 removes
that bridge, preserving WebKit callbacks and safe-area constraints. This is a
rollback of the unsuccessful experiment, not a native-control acceptance claim.
The live frontend now supports dragging the plain timeline. See
`docs/evidence/m8/ios-feedback/README.md` for reports, validation and open issues.

## Build 4 native audio candidate

ADR-004 authorizes replacing installed iOS audio with AVPlayer. Native playback
uses the authenticated BFF stream and artwork endpoints, native audio-session
routing, remote commands and Now Playing artwork. The browser/PWA path remains
HTML audio. The existing queue selects tracks through versioned, generation-
scoped events; direct native play/pause/seek no longer depends on JavaScript.
Background track-command delivery and WiiM artwork require device acceptance.
See `docs/evidence/m8/ios-native-audio/README.md`.

### Xcode 27 build prerequisite

The pinned `swift-rs` 1.0.8 build helper needs Rust's `llvm-tools` component
with Xcode 27 to restore the exported C entry points in Swift static libraries.
Install it for the toolchain that builds NaviMuse:

```sh
rustup component add llvm-tools --toolchain 1.88.0-aarch64-apple-darwin
```

If a build already cached libraries while this component was missing, clean the
`tauri` and `swift-rs` package artifacts for the iOS target before rebuilding.
The warning mentions internalized `@_cdecl` symbols; later linker failures name
`log_stdout`, `on_webview_created`, or `retain_object`. Keep the normal Rust
library outputs and strict final linking; changing library types does not fix
missing Swift exports.

The repository carries a bounded `swift-rs` patch for the three SwiftRs C ABI
helpers embedded in Tauri’s static archive. See
`src-tauri/vendor/swift-rs/NAVIMUSE_PATCH.md`; LLVM tools alone only repairs
Tauri’s own exported functions with the pinned dependency.
