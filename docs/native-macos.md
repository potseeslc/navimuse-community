# NaviMuse Native macOS Proof

M2 starts with a thin Tauri v2 shell around the existing React client. The Node BFF remains the authentication, service, and credential boundary; the native shell does not embed Navidrome or AudioMuse credentials.

## Pinned Starting Target

- NaviMuse package: `0.2.0-preview.1`
- Tauri CLI: `@tauri-apps/cli` `2.11.4`
- Tauri JS API: `@tauri-apps/api` `2.11.1`
- Rust toolchain: `1.88.0`
- Rust target: `aarch64-apple-darwin`
- First validation OS observed in this worktree: macOS `26.5.2` build `25F84`
- First validation CPU architecture observed in this worktree: `arm64`

## Current Shell Scope

The initial shell is intentionally minimal:

- `src-tauri/tauri.conf.json` loads Vite during development and `dist` for packaged builds.
- The only bundled target is a macOS `.app`.
- The app identifier is `com.developer.navimuse`.
- No Rust BFF, Node sidecar, Tauri mobile target, or non-macOS platform target is introduced.

## BFF Boundary

The web PWA keeps using same-origin `/api/...` requests. A Tauri build can point those same client service calls at the deployed Node BFF by setting `VITE_NAVIMUSE_BFF_ORIGIN` to the BFF's `http` or `https` origin at build time, or by assigning `globalThis.__NAVIMUSE_BFF_ORIGIN__` before the client starts in a native bootstrap.

Only NaviMuse BFF API paths are rewritten. The client still never receives Navidrome credentials, AudioMuse tokens, or service passwords; session recovery depends on the BFF's existing `navimuse_session` cookie and `credentials: 'include'` fetches.

Pocket ID sign-in navigation uses the same BFF origin resolver so a native asset-origin window does not try to open `/api/auth/login` locally.

The signed macOS bundle declares `webcredentials:id.example.com` as an associated
domain. Apple requires that entitlement for a passkey ceremony initiated inside
the packaged `WKWebView`. The relying-party domain must also serve a matching
`apple-app-site-association` document containing
`ABCDE12345.com.developer.navimuse`; the entitlement alone does not establish
the association or make the primary passkey path release-ready.

The deployed BFF must allow credentialed `/api/*` requests from the packaged Tauri origin (`tauri://localhost`) so the WebView can read session, settings, library, and playback responses. This CORS allowance is intentionally limited to Tauri local origins and does not replace the existing session cookie or `X-Requested-With: NaviMuse` write boundary.

When a deployed BFF origin is configured, the packaged app redirects its initial `tauri://localhost` page to the BFF origin before React mounts. That keeps Pocket ID and `navimuse_session` cookies first-party for the WebView, which is required for relaunch session recovery.

## Verification

JavaScript/PWA verification remains:

```sh
npm run build
npm test
```

Native verification requires Rust on `PATH`:

```sh
rustup target add aarch64-apple-darwin
npm run tauri:build
```

At the time this foundation was added, `rustc` was not available on `PATH` in the current shell, so the PR can verify the config and PWA build but cannot claim packaged `.app` evidence yet.

## Packaging Evidence Path

M2 packaging evidence must be captured on the owner's Apple Silicon MacBook Air after Rust is installed. The development package command is:

```sh
rustup target add aarch64-apple-darwin
VITE_NAVIMUSE_BFF_ORIGIN=<deployed-bff-origin> npm run tauri:build
```

The evidence capture command is:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=<deployed-bff-origin> npm run native:macos:evidence -- --build
```

Run it without `--build` to capture the current environment and confirm whether Rust, Cargo, and the installed Rust targets are available before attempting packaging.

The evidence command captures commit SHA, dirty Git state, package version, macOS version, CPU architecture, Node/npm versions, Rust/Cargo availability, installed Rust targets, Tauri CLI version, BFF origin, generated `.app` path, bundle existence, build status, and whether service-named environment variables or built assets indicate Navidrome or AudioMuse credential exposure. Signing identity, notarization status, and real-session lifecycle results are manual evidence fields and must be added to the PR after the corresponding checks are performed.

The release package path must use the same target and BFF origin, plus the signing identity and notarization credentials selected for NaviMuse. Do not publish or notarize a build until the PR records:

- exact NaviMuse commit SHA and package version;
- `sw_vers`, `uname -m`, `rustc --version`, `cargo --version`, `npm --version`, and `node --version`;
- Tauri CLI version and generated `.app` path;
- signing identity or unsigned-development status;
- whether notarization was skipped, submitted, or accepted;
- BFF origin used for the build, with no Navidrome or AudioMuse service credentials in the client environment;
- real-session evidence for sign-in, playback, media keys, sleep/wake, network recovery, output-device change, battery, memory, crash, and log behavior.
- a successful direct Pocket ID passkey ceremony after Apple has observed the
  matching `id.example.com` association document.

Until those fields are recorded, M2 can say the packaging path is defined but not that NaviMuse has passed native packaging exit evidence.

## Real Session Evidence Path

After a development `.app` exists, start a real-session evidence record before launching the app:

```sh
VITE_NAVIMUSE_BFF_ORIGIN=<deployed-bff-origin> npm run native:macos:session-evidence
```

The command emits measured repository, OS, toolchain, BFF origin, and `.app` path fields, then creates `pending-manual-validation` entries for each M2 lifecycle check. Do not replace those pending entries with `passed` until the packaged `.app` has been exercised on the pinned MacBook Air with a real authenticated library track.

The real-session record must cover:

- Pocket ID sign-in and relaunch session recovery through the deployed BFF;
- play, pause, seek, skip, and uninterrupted streaming of a real library track;
- sleep/wake recovery;
- network loss and recovery;
- audio output-device changes;
- macOS media key handling for the wired Media Session actions;
- now-playing title, artist, album, playback state, and position metadata;
- battery and power-state observations;
- NaviMuse process memory before, during, and after playback;
- crash report checks;
- NaviMuse, WebView, and BFF log review.

Validate a completed real-session record before using it as M2 exit evidence:

1. Confirm the evidence commit matches the packaged `.app` commit and that
   `dirtyState` contains no unexplained source changes.
2. Re-run `npm run native:macos:evidence -- --build` with the same BFF origin and
   confirm `appBundleExists: true`, `buildStatus: "passed"`, and no service
   credential matches in the client environment or built assets.
3. Confirm each lifecycle item is backed by a timestamped observation, command
   output, app accessibility state, system log excerpt, or an explicit reason it
   could not be verified on the current hardware.
4. Treat any lifecycle item without supporting evidence as incomplete, even if the
   app appeared to work during the session.
5. Attach the validation notes to the PR that records the evidence so reviewers can
   reproduce the claim from the exact commit, OS, hardware, BFF origin, and app
   bundle path.

## 2026-08-22 Development Package Evidence

The first development `.app` package completed on the owner's Apple Silicon MacBook Air:

```json
{
  "commit": "cbfd87a0f51d8270155615404a520a61b1a0b7b8",
  "packageVersion": "0.2.0-preview.1",
  "macos": "26.5.2 build 25F84",
  "arch": "arm64",
  "rustc": "rustc 1.88.0 (6b00bc388 2025-06-23)",
  "cargo": "cargo 1.88.0 (873a06493 2025-05-10)",
  "rustupTargets": ["aarch64-apple-darwin", "x86_64-unknown-linux-gnu"],
  "node": "v26.7.0",
  "npm": "11.19.0",
  "tauriCli": "tauri-cli 2.11.4",
  "bffOrigin": "http://192.168.1.242:8099",
  "appBundlePath": "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app",
  "appBundleExists": true,
  "buildStatus": "passed",
  "clientServiceCredentials": {
    "environmentVariables": [],
    "distAssetMatches": []
  },
  "signingStatus": "ad-hoc signed; not notarized"
}
```

The built executable is a thin `arm64` Mach-O. `codesign -dv --verbose=4` reported `Signature=adhoc` and `TeamIdentifier=not set`. `spctl -a -vv` did not accept the ad-hoc bundle for distribution, so release signing and notarization remain open.

Release signing remains a later M7 hardening task. Completing it requires an Apple
Developer Program team, a Developer ID Application certificate in the signing
keychain, notarization credentials or notarytool keychain profile, hardened runtime
settings, and a release PR that records the exact signing identity, notarization
submission identifier, and stapling result. M2 may use ad-hoc signed development
bundles only, and must label them as non-distributable.

This package evidence does not complete M2 by itself. The remaining M2 exit evidence is a real authenticated listening session in the packaged app covering sign-in/session recovery, play/pause/seek/skip/stream, sleep/wake recovery, network loss/recovery, output-device change, native media keys, now-playing metadata, battery, memory, crash, and log behavior.

## 2026-08-22 Authenticated Session Evidence

After the BFF CORS boundary and first-party BFF launch redirect landed, the packaged
development app was rebuilt from merged `main` and exercised against the deployed
BFF:

```json
{
  "commit": "092aaf54b17630459c85dca99455f4dc1ada9851",
  "dirtyState": "?? .scratch/",
  "packageVersion": "0.2.0-preview.1",
  "macos": "26.5.2 build 25F84",
  "arch": "arm64",
  "rustc": "rustc 1.88.0 (6b00bc388 2025-06-23)",
  "cargo": "cargo 1.88.0 (873a06493 2025-05-10)",
  "node": "v26.7.0",
  "npm": "11.19.0",
  "tauriCli": "tauri-cli 2.11.4",
  "bffOrigin": "https://navimuse.example.com",
  "appBundlePath": "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app",
  "appBundleExists": true,
  "buildStatus": "passed",
  "clientServiceCredentials": {
    "environmentVariables": [],
    "distAssetMatches": []
  },
  "signingStatus": "ad-hoc signed; not notarized"
}
```

Verified on the owner's Apple Silicon MacBook Air:

- Pocket ID sign-in completed through `https://navimuse.example.com`.
- Quitting and reopening the packaged app recovered the authenticated session at
  `https://navimuse.example.com/?view=home`; it did not return to the locked
  `tauri://localhost` Settings state.
- Home loaded real Navidrome library content with Library, Search, and Sonic
  navigation enabled.
- Queue persistence recovered "Butterfly" by Weezer at about `0:22 / 3:10`.
- Playback resumed, paused, resumed again, and skipped next from the recovered
  session; the next track was "Jolene" by Ray LaMontagne.
- A controlled deployed-BFF outage was performed by stopping the `navimuse`
  container for about eight seconds, restarting it, and confirming
  `https://navimuse.example.com/api/health` returned healthy Navidrome and
  AudioMuse status. The packaged app remained authenticated on Home and playback
  advanced through the outage to about `1:17 / 3:10`.
- Power state during validation was AC power, battery `100%`, fully charged, Low
  Power Mode `0`, with battery cycle count `108`.
- NaviMuse process memory was observed at about `80.7 MB` RSS immediately after
  relaunch, `27.3 MB` RSS during playback, and `25.6 MB` RSS after the network
  recovery check.
- No `NaviMuse` crash report matched in `~/Library/Logs/DiagnosticReports`.
- macOS WebKit media logs showed Media Session metadata and position updates
  during playback, including duration `190.31074829931973` seconds and advancing
  positions around `39.62` to `41.64` seconds.

Validation notes:

- Evidence commit matches the rebuilt packaged app commit
  `092aaf54b17630459c85dca99455f4dc1ada9851`.
- The only dirty state was the pre-existing untracked `.scratch/` directory.
- `native:macos:evidence -- --build` passed and reported no Navidrome or
  AudioMuse credential matches in environment variables or built client assets.
- Runtime observations came from the packaged app accessibility tree, BFF health
  checks, `ps`, `pmset`, `ioreg`, `system_profiler`, `log show`, and crash-report
  filesystem checks on the validation MacBook Air.

## 2026-08-22 M2 Lifecycle Completion Evidence

The three remaining M2 lifecycle checks were performed on the same packaged app
(PID 76994, commit `5639a63`) against the deployed BFF at
`https://navimuse.example.com`.

Pass/fail criteria: a check **passes** when the NaviMuse process survives the
lifecycle event without crashing, the authenticated session and playback queue
remain intact (same track or next track is visible and controllable), and the
WebKit Media Session re-registers with `mediaremoted` after the event. A check
**fails** if the process dies, the session is lost (app returns to the locked
Settings screen), playback cannot be resumed, or a crash report is generated.

### Sleep/Wake Recovery — Passed

Test procedure:

1. Confirmed a track was actively playing (position ~59s, duration 159.45s) with
   `log show --predicate 'eventMessage CONTAINS "isPlaying" AND process ==
   "navimuse"' --last 15s` showing `isPlaying = true`.
2. Captured pre-sleep baseline: PID 76994 alive, RSS ~21 MB, output device
   "MacBook Air Speakers", `pmset -g` reporting `sleep 0 (sleep prevented by
   coreaudiod, powerd)`.
3. Issued `pmset sleepnow` to force system sleep at 2026-08-23T04:16:17Z.
4. User confirmed the MacBook Air display went dark. User waited approximately
   10 seconds, then woke the machine by opening the lid.
5. Captured post-wake state at 2026-08-23T04:16:42Z (approximately 25 seconds
   after sleep trigger).

Observed results:

- The NaviMuse process (PID 76994) survived sleep/wake without restart; confirmed
  via `ps -o pid,rss,command -p 76994`.
- WebKit logged `MediaSessionManagerCocoa::maybeActivateAudioSession(0)
  successfully activated AudioSession` immediately on wake, confirming the audio
  session was reactivated by the system.
- `mediaremoted` posted `kMRMediaRemoteNowPlayingInfoDidChangeNotification` for
  `com.apple.WebKit.GPU/com.developer.navimuse (76997) NaviMuse` on wake,
  confirming Now Playing metadata was re-registered.
- Track position continued from ~61.5s to ~92.7s (approximately 31 seconds
  elapsed including sleep), confirming the session and queue survived sleep.
- Playback paused during sleep (expected macOS behavior); `isPlaying = false`
  in post-wake logs. The user pressed play in the app UI and the same track
  resumed from its current position.
- RSS increased from ~21 MB (pre-sleep) to ~28 MB (post-wake).
- `ls ~/Library/Logs/DiagnosticReports/ | grep -i navimuse` returned no results.
- BFF remained healthy throughout: `curl -s https://navimuse.example.com/api/health`
  returned `{"ok":true,...}` immediately after wake.

### Audio Output-Device Change — Passed

Test procedure:

1. Confirmed a track was actively playing through MacBook Air Speakers
  (Default Output Device per `system_profiler SPAudioDataType`).
2. User placed Example AirPods Pro in ears, triggering automatic Bluetooth
   connection. macOS switched the Default Output Device from "MacBook Air
   Speakers" to "Example AirPods Pro".
3. Captured device state with `system_profiler SPAudioDataType`: "Colter's
   AirPods Pro" confirmed as Default Output Device, Transport: Bluetooth,
   Current SampleRate: 48000, Output Channels: 2.
4. User confirmed audio was audible through the AirPods and playback continued
   without interruption.
5. User removed AirPods and closed the case. macOS reverted Default Output
   Device to "MacBook Air Speakers".
6. Captured device state again with `system_profiler SPAudioDataType` confirming
   the switch back.

Observed results:

- Playback continued without interruption through both output-device switches
  (speakers → AirPods → speakers). No pause, skip, or manual restart needed.
- Media Session fired `MediaSessionManagerCocoa::clientCharacteristicsChanged`
  on each route change, confirming WebKit detected and adapted to the new audio
  output device. Now Playing info was re-registered with `mediaremoted` on each
  change.
- Position advanced continuously from ~127s through both switches.
- RSS was ~18 MB during AirPods playback and ~27 MB after switching back to
  speakers.
- No `NaviMuse` crash report in `~/Library/Logs/DiagnosticReports`.

### Physical Media Keys and Now Playing UI — Passed

Test procedure:

1. Confirmed a track was actively playing (duration 190.31s, position ~16s).
2. User pressed hardware media key F8 (play/pause) on the MacBook Air keyboard.
3. User pressed hardware media key F9 (next track).
4. User pressed hardware media key F7 (previous track).
5. User opened Control Center from the macOS menu bar and confirmed whether a
   Now Playing widget was visible.

Observed results:

- F8 (play/pause): successfully toggled playback pause/resume for NaviMuse.
- F9 (next track): successfully advanced to a new track (duration 190.31
  seconds, confirmed in WebKit logs).
- F7 (previous track): successfully returned to the previous track.
- WebKit Media Session logs confirmed `isPlaying = true` with advancing position
  after the media-key actions: `MediaSessionManagerCocoa::updateNowPlayingInfo(0)
  title = "title", isPlaying = true, duration = 190.31074829931973`.
- `mediaremoted` posted `kMRMediaRemoteNowPlayingInfoDidChangeNotification` for
  NaviMuse, confirming the macOS media remote system received the metadata.
- User confirmed the macOS Now Playing widget was visible in Control Center,
  showing NaviMuse as the active media source with the current track.

### Final State

- NaviMuse process RSS: ~31 MB after all lifecycle checks.
- Battery: AC power, 100% charged, Low Power Mode `0`, cycle count 108.
- BFF health: Navidrome and AudioMuse both healthy (latency 32/28 ms).
- No `NaviMuse` crash report in `~/Library/Logs/DiagnosticReports`.
- Only dirty state: untracked `.scratch/` directory.

### M2 Exit Status

All M2 exit evidence requirements are now satisfied: the packaged development
`.app` completed a real listening session and recovered from sleep/wake,
network loss/recovery, and output-device changes on the pinned MacBook Air
environment. Native media keys and Now Playing metadata are confirmed.

## 2026-08-22 M3 Daily-Player Product Pass Evidence

M3 was delivered through bounded PRs after the M2 Tauri proof:

- #149: explicit native desktop shell with dedicated navigation rail, content
  surface, and now-playing zone while preserving compact/PWA presentation.
- #150: persistent desktop queue panel beside now-playing, reusing the existing
  `playQueueIndex` queue authority.
- #151: Home continuation section backed by existing now-playing and queue state.
- #152: Library/Search desktop ergonomics: sticky controls and `/` keyboard
  search focus.
- #153: clearer daily-player action labels for Track Journey, Artist DJ, and
  Queue.
- #154: M3 evidence and AudioMuse-disabled behavior.

### Visual Regression Coverage

Browser layout coverage now includes compact and wide Mac-like viewports:

- `test/layoutBrowser.test.mjs` verifies the M3 shell at 390x844 compact and
  1440x900 desktop sizes.
- Compact expectation: `native-desktop-shell` renders as `display: contents`,
  desktop brand and persistent queue panel are hidden, and bottom tab navigation
  stays inside the viewport.
- Desktop expectation: `native-desktop-shell` renders as a three-column grid with
  a 240px rail, content surface, and right now-playing/queue panel. The desktop
  brand and persistent queue panel are visible, the surface does not overlap the
  rail, and the mini-player stays bounded inside the player zone.

### AudioMuse Disabled Behavior

AudioMuse remains an optional enhancement for the daily player:

- Navidrome stream playback remains the playback authority and does not depend on
  AudioMuse waveform or similarity endpoints.
- When `audiomuseWaveform()` fails, returns no peaks, or is unavailable, the app
  sets `waveformState.status` to `unavailable` or `empty` and does not render a
  fake waveform shape.
- The expanded player renders a standard `ProgressRail` for elapsed/remaining
  time and seek affordance when no real waveform values are ready.
- The decorative waveform is only rendered when `waveformState.status === 'ready'`
  and real waveform values exist.
- Existing server tests cover missing optional AudioMuse token/health behavior and
  controlled AudioMuse proxy failures. Player integration tests now guard that the
  waveform UI disappears rather than fabricating fallback waveform peaks.

### Verification Commands

Executed on commit `1261853` plus the M3.6 branch changes:

- `node --test test/playerIntegration.test.mjs` — 53 passing.
- `node --test test/layoutBrowser.test.mjs` — 8 passing, including compact and
  desktop M3 shell coverage.
- `npm run build` — Vite production build passed.

### M3 Exit Status

M3 exit evidence is satisfied for the daily-player scope without Sonic Atlas: the
native desktop shell is suitable for daily listening, now-playing and queue are
persistently reachable, Home prioritizes continuation, Library/Search are more
efficient for pointer and keyboard workflows, compact/PWA presentation remains
preserved, visual regression coverage spans compact and wide Mac windows, and
AudioMuse absence no longer presents fabricated waveform UI or blocks playback.

## 2026-08-27 M4 Sonic Atlas Gate 0 Exit

M4 is complete in the sibling `navimuse-sonic-atlas-lab` repository. Final Gate 0
selects bounded Branch B and bounded regl/WebGL2 for initial packaged macOS. The
restricted live 92,610-point projection passed packaged functional and 30-minute
WKWebView device-budget evidence on the pinned MacBook Air.

Production-facing route, visual, ownership, evidence, and deferred-capability
constraints are recorded in [`sonic-atlas-gate0.md`](sonic-atlas-gate0.md).

The phone/PWA Atlas hold remains, and lab code is not promoted directly. M5 Atlas
contracts and foundation are unblocked.

## 2026-08-28 M5 Sonic Atlas Contracts and Foundation Exit

M5 is complete. Shared v1 contracts, authenticated projection/tile and bounded
Journey BFF boundaries, client identity/cache state, renderer-neutral failure
isolation, complete list/player fallback, and queue-owned atomic Journey persistence
are implemented. Cross-boundary and degraded-mode evidence is recorded in
[`sonic-atlas-m5-foundation.md`](sonic-atlas-m5-foundation.md).

No flagship Atlas map/Journey UI or production renderer is enabled yet; M6 remains
responsible for product integration under the accepted Branch B visual truth and
phone/PWA holds.
