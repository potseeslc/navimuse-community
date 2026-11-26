# NaviMuse M9 iOS Application Plan

- Status: proposed; blocked on M8 completion and a superseding mobile-platform ADR
- Date: 2026-08-29
- First product target: iPhone
- Distribution target: TestFlight, then App Store

## Objective

Deliver NaviMuse as a dependable iPhone music application without weakening the
macOS application, operational PWA, BFF credential boundary, or single playback and
queue authority. M9 is not authorization to wrap the desktop UI in a phone WebView.

## Entry gates

- M8 behavior, design system, authentication, and degraded-state evidence is complete.
- A superseding ADR authorizes iOS and chooses between Tauri v2 mobile, a native Swift
  shell around shared domains, or another measured boundary.
- Pin Xcode, Swift, Rust, Tauri, CocoaPods/SPM, iOS deployment target, WebKit, BFF,
  NaviMuse commit, and Apple signing identities.
- Pin an oldest-supported iPhone plus the owner's primary validation device, exact
  iOS versions, storage state, battery health, network types, and power modes.

## Product scope

- Mobile-specific Home, Discover, Library, Playlists, Search, Sonic entry, Journeys,
  Settings, mini player, full player, queue, dialogs, onboarding, and account views.
- Local username/password, passkeys, optional Pocket ID, trusted-device restoration,
  automatic Navidrome identity mapping, and BFF-authorized AudioMuse access.
- Library browse/search, album/artist/song detail, playlists, favorites, ratings,
  scrobbling, radios, discovery, queue editing, waveform fallback, and Journey list.
- Native background audio, lock-screen/Control Center metadata and commands, headset
  controls, interruptions, route changes, Bluetooth, AirPlay, seek, shuffle, repeat,
  and remote-command reconciliation with the one queue authority.
- Secure, user-controlled downloads for offline playback after a versioned download,
  storage, encryption, eviction, logout, and rights/privacy contract lands.
- Reachable offline, expired-session, unavailable-service, interrupted-download,
  missing-artwork, and storage-pressure states.

## Native architecture gate

Build a thin vertical slice for each credible shell candidate. It must sign in,
stream one real track, background and resume, survive screen lock, respond to remote
commands, restore queue state, and report lifecycle evidence. Choose by measured
correctness, energy, maintainability, accessibility, and App Store compatibility,
not frontend reuse alone.

If Tauri is selected, Swift mobile plugins own native audio session, background
playback, remote commands, secure storage, downloads, reachability, and lifecycle
events. WebView JavaScript cannot be the sole background playback authority after
the UI is suspended. Tauri's official mobile plugin model supports Swift modules,
but every required capability must be proven on-device:
https://v2.tauri.app/develop/plugins/develop-mobile/

## iOS playback contract

- Use the accepted native playback engine and configure the appropriate
  `AVAudioSession` category, activation, interruption, and route-change behavior.
- Enable only the Audio/AirPlay background mode required for music playback.
- Publish now-playing metadata, duration, elapsed time, rate, artwork, and queue-aware
  commands through native media APIs.
- Serialize native and React commands through one transition boundary so remote,
  UI, headset, and end-of-track events cannot advance the queue twice.
- Persist position and queue transactionally before suspension and reconcile with
  actual native player state after termination, interruption, network loss, or crash.
- Ordinary Navidrome playback remains usable with AudioMuse and Atlas unavailable.

Apple requires explicit background-audio capability and audio-session configuration:
https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback

## Mobile experience

- Adapt M8 tokens and visual identity to native mobile density and safe areas; do not
  shrink desktop columns or reproduce a desktop sidebar.
- Use tab navigation for the most frequent destinations, a persistent mini player,
  a full-height now-playing surface, native-feeling sheets, and one-handed actions.
- Support Dynamic Type, VoiceOver, Switch Control, reduced motion/transparency,
  increased contrast, portrait/landscape, keyboard where present, and long metadata.
- Onboarding is short: server discovery/deep link, authentication, library choice,
  download preference, notification/media explanation only when needed, then music.
- Passkeys use the stable HTTPS BFF relying-party scope proven in M8; app-associated
  domain and native/WebView origin behavior receive explicit verification.

## Sonic Atlas gate

Atlas is disabled by default on iPhone. Before enablement, the sibling lab must record
an accepted iOS gate using the real full-library dataset on the oldest supported
iPhone and primary validation phone. Evidence includes point selection, LOD truth,
context loss, background/foreground recovery, thermal state, memory, frame time,
battery, reduced motion, and 30-minute sustained use. Failure leaves the complete
non-map Journey/list experience and ordinary playback intact.

## Delivery sequence

1. **M9.0 ADR and device matrix:** select shell and pin the support envelope.
2. **M9.1 Native playback slice:** prove background audio and one queue authority.
3. **M9.2 Mobile foundation:** authentication, secure restoration, navigation,
   lifecycle, media session, reachability, diagnostics, and accessibility.
4. **M9.3 Daily player:** all library, search, playlist, discovery, queue, and player
   workflows with native mobile presentation.
5. **M9.4 Offline and Journeys:** downloads/storage and complete non-map Journey use.
6. **M9.5 Optional Atlas:** only after the independent iOS Atlas gate is accepted.
7. **M9.6 Release:** signing, privacy manifest, TestFlight, App Store assets/review,
   crash/energy evidence, migration, support, and rollback.

## Exit evidence

- A signed TestFlight build on the pinned commit completes real multi-hour listening
  sessions across foreground, background, lock, interruption, Bluetooth/AirPlay,
  network loss, process termination, and device restart without queue divergence.
- Authentication, passkeys, trusted-device renewal, downloads, logout/revocation,
  offline playback, accessibility, diagnostics, privacy, and migration tests pass.
- The App Store artifact and privacy declarations match the audited binary and BFF
  data flow. Atlas is either backed by accepted phone evidence or visibly unavailable
  with the complete fallback.

## Non-goals

- No iPad, CarPlay, watchOS, or universal Apple-platform promise without follow-on
  scope and device evidence.
- No client-held Navidrome/AudioMuse credentials, embedded Node BFF, second queue,
  or background JavaScript assumption.
- No Atlas enablement based on simulator, desktop, or short synthetic results.
