# NaviMuse M10 Android Application Plan

- Status: proposed; blocked on M9 shared-mobile evidence and an Android platform ADR
- Date: 2026-08-29
- First product target: Android phones
- Distribution target: Play internal testing, then production

## Objective

Deliver NaviMuse as a dependable Android music application while reusing only the
M9 contracts that proved platform-neutral. Android playback, lifecycle, storage,
authentication, accessibility, and renderer behavior receive independent native
implementation and device evidence.

## Entry gates

- M9 has separated shared product/domain contracts from iOS-specific behavior.
- An Android ADR chooses Tauri v2 mobile, a Kotlin shell, or another measured boundary
  after a real playback spike.
- Pin Android Studio, JDK, Gradle, Android Gradle Plugin, SDK, NDK, Rust/Tauri,
  min/target SDK, System WebView, Media3, signing, BFF, and NaviMuse versions.
- Pin an oldest-supported low/mid-range phone, the owner's primary Android validation
  device, and at least one OEM with aggressive background-process management.

Tauri Android development requires the Android SDK/NDK, JDK, and Rust Android targets;
versions must be pinned rather than inherited from a workstation:
https://v2.tauri.app/start/prerequisites/

## Product scope

- Mobile-specific Home, Discover, Library, Playlists, Search, Sonic entry, Journeys,
  Settings, mini player, full player, queue, onboarding, account, and diagnostics.
- Local username/password, Android passkeys, optional Pocket ID, trusted-device
  restoration, Navidrome identity mapping, and BFF-authorized AudioMuse access.
- Complete daily-player behavior: browse/search, detail, playlists, feedback,
  scrobbling, radios, discovery, queue, waveform fallback, and Journey list.
- Native background playback, media notification, lock-screen controls, headset and
  Bluetooth commands, audio focus, noisy-route handling, seek, shuffle, repeat,
  process recreation, and one queue authority.
- Versioned secure downloads and offline playback with scoped storage, quota,
  eviction, logout cleanup, corruption recovery, and storage-pressure behavior.

## Native architecture and playback gate

The vertical slice must authenticate, play a real track through background and screen
lock, publish a media notification, respond to headset controls, lose/regain network,
survive Activity and process recreation, and restore the authoritative queue.

If Tauri is selected, Kotlin plugins own native playback, service, notification,
secure storage, downloads, connectivity, and lifecycle. The player and media session
must live outside the Activity/WebView lifecycle. Android's recommended background
model is Media3 `MediaSessionService` or `MediaLibraryService`:
https://developer.android.com/media/media3/session/background-playback

- Use a pinned Media3 player/session implementation and foreground media-playback
  service with correctly declared permissions and notification behavior.
- Serialize UI, notification, headset, Bluetooth, audio-focus, and completion commands
  through one transition boundary; never maintain a Kotlin queue and React queue that
  can independently advance.
- Handle audio focus gain/loss, becoming noisy, call/navigation interruptions,
  Bluetooth route changes, Doze, battery saver, network handoff, process death, and
  OEM background restrictions with recorded outcomes.
- Restore queue and position transactionally, then reconcile against native player
  truth before accepting commands after recreation.

## Android experience

- Adapt the M8 visual identity to Android phone ergonomics, system bars, gesture
  insets, predictive back behavior, and multiple display densities.
- Use compact bottom navigation, persistent mini player, full now-playing surface,
  standard sheets/menus, stable touch targets, and no desktop sidebar compression.
- Support TalkBack, switch access, font scaling, reduced animation, high contrast,
  portrait/landscape, fold/resize resilience where supported, and long metadata.
- Use Android Credential Manager/WebAuthn-compatible passkey behavior through a
  stable HTTPS RP ID and verified app/domain association; retain password and recovery
  paths when credentials are unavailable.

## Sonic Atlas gate

Atlas is disabled by default on Android. The sibling lab must record an accepted
Android gate using the real full-library dataset on every required performance tier.
Evidence includes WebView/GPU identity, exact-point selection, LOD, context loss,
Activity/process recreation, thermal throttling, memory pressure, frame time, battery,
and 30-minute sustained use. A single flagship-phone pass cannot establish the
oldest-supported-device envelope.

## Delivery sequence

1. **M10.0 ADR and device matrix:** select shell and pin Android support.
2. **M10.1 Native playback slice:** prove Media3/service lifecycle and queue unity.
3. **M10.2 Mobile foundation:** authentication, passkeys, restoration, navigation,
   notification/media session, reachability, lifecycle, diagnostics, accessibility.
4. **M10.3 Daily player:** complete library, search, playlists, discovery, queue,
   player, settings, and failure behavior.
5. **M10.4 Offline and Journeys:** downloads/storage and non-map Journey workflows.
6. **M10.5 Optional Atlas:** only after accepted Android device-tier evidence.
7. **M10.6 Release:** signed AAB, internal/closed testing, Play declarations, crash and
   Android vitals review, staged rollout, support, migration, and rollback.

## Exit evidence

- A signed internal-testing build on the pinned commit completes real multi-hour
  sessions across foreground/background, lock, notification/headset commands, audio
  focus, Bluetooth, network changes, Doze, process death, and restart without queue
  divergence.
- Authentication, passkeys, trusted sessions, downloads, offline playback,
  revocation, accessibility, storage, privacy, and migration tests pass across the
  pinned device matrix.
- The production AAB, Play data-safety declaration, permissions, foreground-service
  behavior, and audited BFF data flow agree. Atlas remains gated independently.

## Non-goals

- No Android tablet, TV, Auto, Wear OS, or ChromeOS promise without follow-on scope.
- No client-held upstream credentials, embedded BFF, second playback authority, or
  WebView-only background player.
- No Atlas enablement inferred from iOS, macOS, emulator, or flagship-only results.
