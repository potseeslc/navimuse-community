# NaviMuse M8 Product Redesign Plan

- Status: proposed
- Date: 2026-08-29
- Product baseline: NaviMuse `0.2.0-preview.1`
- Planning head: `a0156b2`
- Native target: Tauri v2, `aarch64-apple-darwin`
- Visual direction: Midnight Broadcast atmosphere with Chromatic Minimalism structure, calibrated as Cinematic Focus

## Accepted execution goals — 2026-09-06

The owner approved the [tab-by-tab delivery and QA plan](NAVIMUSE_M8_TAB_PASSES_2026-09-06.md)
as required M8 goals. It operationalizes this plan in Home, shared player/queue,
Search, Library completion, Sonic, Settings, access/onboarding, and integrated
release passes. Each pass carries explicit visual, functional, accessibility,
real-service, native/PWA, review, and deployment evidence. Unperformed checks remain
open. The master plan's full M8 scope and final-candidate acceptance remain binding.

## Purpose

M8 turns the proven daily-player and Sonic Atlas behavior into one polished native
music product. It is a system redesign, not a reskin. Existing playback, queue,
library, search, playlist, discovery, settings, authentication, service-degradation,
Journey, and accessibility behavior must remain available and truthful.

M8 begins only after M7 release-hardening evidence is accepted. It does not reopen
the macOS-first platform decision, move credentials into the client, replace the
Node BFF, enable Atlas on the phone/PWA, or create another playback authority.
The 2026-08-30 product decision moved final distribution proof from M7 into M8:
Apple notarization, stapling, Gatekeeper verification, packaged WebGL recovery,
and final release-channel evidence belong to M8 release-readiness after the
redesign closes the larger product gaps.
M7 evidence scaffolding and prior notarized candidate records can inform M8, but
they do not satisfy the M8.5 final Apple Silicon distribution-candidate gate.

## Current-product audit

Audit performed on 2026-08-30 at production head `a0156b2`, NaviMuse
`0.2.0-preview.1`. The production build passes and all 457 tests in 41 test files
pass. These counts are a point-in-time audit record for that commit, not a maintained
invariant. `src/main.jsx` is 2,195 lines, `src/styles.css` is 4,118 lines, and
`server.mjs` is 2,748 lines. M8 is therefore redesigning a substantial working
product, not filling an empty shell. Several layout tests verify source structure
and bounded geometry, but they do not substitute for visual task review: the tested
900 px shell still produces a visibly cramped primary content lane.

### Preserve as implemented behavior

- The app already has one persisted queue and cursor, persisted playback position,
  shuffle pool and heard-track history, repeat, continuous advancement, volume,
  non-autoplay relaunch restoration, Media Session commands and metadata, playback
  reporting, seek safety, and session-kind-aware transition planning.
- The audio engine already uses two media decks, bounded next-track preparation,
  Web Audio gain staging, gapless ordinary transitions, and equal-power fades for
  eligible Journey and Artist-DJ transitions. M8 must test and expose this behavior;
  it must not describe it as an unimplemented audio-engine replacement.
- Album and discovery playback already build multi-track queues at the selected
  item, Search protects against stale requests, playlists have create/update/delete
  flows, and AudioMuse/Atlas failures are designed not to own ordinary playback.
- The current shell has five primary destinations: Home, Library, Search, Sonic, and
  Settings. Library currently owns playlist management; Sonic owns discovery and
  Atlas/Journey work. This is a useful starting information architecture, not a
  temporary omission that automatically requires eight top-level destinations.

### Confirmed product gaps

- The visible queue supports inspection and selection, but does not yet provide a
  complete user-facing `Play next`, `Add to queue`, reorder, remove, clear, or undo
  workflow. Queue source identity is implicit in entries rather than a durable,
  displayed album/playlist/search/radio/Journey descriptor.
- The wide shell permanently allocates a right queue column even when the queue is
  empty. At 900 px, fixed 240 px navigation and roughly 320 px player tracks leave
  the primary content visibly cramped; below 900 px the composition switches
  abruptly to a floating vertical rail rather than a deliberate compact Mac layout.
- First-run setup, service administration, playback preferences, discovery
  preferences, library preferences, and live health are combined in one long
  Settings surface. Setup is technically operable but does not guide a new listener
  into music or separate ordinary preferences from owner-only administration.
- The supported BFF-served application correctly rendered a recoverable
  `Navidrome credentials are not configured` state during the audit. A direct,
  unsupported Vite-only launch did not provide the expected BFF response shape and
  eventually rendered blank; this is a development-harness limitation, not evidence
  of a production blank-window defect. M8 should still add payload normalization and
  a last-resort recovery boundary as defense in depth, without treating them as a
  blocker or claiming the current supported app fails this way.
- Settings copy says gapless controls will appear when the engine supports them even
  though the transition engine already implements gapless preparation. UI language
  and capability detection are not yet reliably derived from the actual engine.
- ReplayGain, lyrics presentation, full offline downloads, output selection, remote
  casting, and general-purpose queue editing are not equivalent in maturity. The
  plan must not group them together as visual polish.

### Planning corrections

1. Treat existing playback, queue persistence, transition, reporting, and Atlas
   boundaries as preservation contracts with regression evidence.
2. Put compact/wide shell behavior and queue usability before palette, motion, or
   expanded authentication UI. Add payload normalization and error containment as
   bounded defense-in-depth work, not as remediation of an observed production crash.
3. Keep the five-destination navigation model for the first M8 implementation.
   Evaluate Library-owned Playlists and a mode-based Sonic surface with task testing
   before promoting any child surface to primary navigation.
4. Make queue comprehension and mutation the primary daily-player capability slice.
   Source-aware queue metadata is an extension of the one queue, never a new queue.
5. Keep trusted-device, local-account, and passkey contracts as a separately gated
   security workstream. They may land before their redesigned UI, but they must not
   block shell and daily-player usability work that can preserve the current session
   boundary.
6. Require an audio-engine spike before ReplayGain, equalizer, user-configurable
   crossfade, exclusive output, or bit-perfect claims enter M8 implementation scope.

## Authority and visual references

Architecture remains governed by:

- `NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md`;
- `../decisions/ADR-001-MACOS-FIRST-TAURI.md`;
- the accepted Sonic Atlas lab decisions and `sonic-atlas/v1` production contracts.

Implementation-facing visual references are:

- `design/finalists/c-cinematic-focus/onboarding-and-login.png`;
- `design/finalists/c-cinematic-focus/local-login-passkey.png`;
- `design/finalists/c-cinematic-focus/home.png`;
- `design/finalists/c-cinematic-focus/discover.png`;
- `design/finalists/c-cinematic-focus/playlists.png`;
- `design/finalists/c-cinematic-focus/journeys.png`;
- `design/finalists/c-cinematic-focus/settings.png`;
- `design/finalists/c-cinematic-focus/sonic-atlas-production-topology.png`;
- `design/finalists/c-cinematic-focus/sonic-atlas-stop-selected.png`;
- `design/finalists/c-cinematic-focus/m8-sonic-journey-follow.png`;
- `design/finalists/c-cinematic-focus/m8-sonic-journey-transition.png`;
- `design/finalists/c-cinematic-focus/m8-sonic-journey-explore.png`;
- `design/finalists/c-cinematic-focus/m8-library-editable-queue.png`;
- `design/finalists/c-cinematic-focus/m8-full-player-lyrics.png`;
- `design/finalists/c-cinematic-focus/m8-compact-playlist.png`;
- `design/finalists/c-cinematic-focus/m8-settings-playback.png`.

Generated copy, controls, data, and imagined map geometry are not requirements.
Production behavior and the real projection topology take precedence. The four
original `m8-*` references demonstrate the revised five-destination navigation,
source-aware editable queue, optional lyrics and delivered-quality treatment,
collapsed compact queue, and listener/owner Settings separation. The three
`m8-sonic-journey-*` references demonstrate active Journey continuity, shared
playback controls, state-driven handoff motion, and uninterrupted Explore mode.

## Product principles

1. **Music first.** Artwork, track identity, playback, and the collection dominate;
   application chrome stays quiet.
2. **Adaptive, not unstable.** Album art supplies local atmosphere and accent color,
   while neutral surfaces, typography, focus, and contrast remain predictable.
3. **Dense, not cramped.** Library work supports scanning and repeated actions;
   Atlas receives the largest continuous canvas.
4. **Motion communicates state.** Motion confirms cause and effect, progress,
   selection, playback, and spatial context. It is never ambient decoration.
5. **Truth over spectacle.** The Atlas shows the real embedding. A Journey shows
   only resolved ordered stops; exploratory neighbors cannot masquerade as planned
   route branches.
6. **One product in every condition.** Missing artwork, incomplete analysis,
   renderer loss, offline services, locked sessions, empty libraries, and reduced
   motion receive designed states rather than fallback-looking screens.

## Open-source client usability findings

The Navidrome open-source client catalog was reviewed on 2026-08-30 as product
evidence, not as a feature checklist. The recurring strengths across Airdrome,
Airsonic Refix, Amperfy, Feishin, Supersonic, Tempo, and other maintained clients are
persistent queue context, gapless playback, native media integration, lyrics,
ReplayGain, useful offline or cache behavior, configurable library browsing, and
fast access to common track actions. The catalog and representative primary sources
are:

- https://www.navidrome.org/apps/?oss=true
- https://github.com/JPGuillemin/Airdrome
- https://github.com/jeffvli/feishin
- https://github.com/supersonic-app/supersonic
- https://github.com/BLeeEZ/amperfy
- https://substreamer.org/

### Open-source pattern to NaviMuse screen traceability

| Proven client pattern | Reference implementation evidence | NaviMuse visual reference | M8 decision |
| --- | --- | --- | --- |
| Persistent, source-aware queue with repeat/shuffle and recovery | Airdrome exposes a persistent queue and the OpenSubsonic `getPlayQueue`/`savePlayQueue` boundary; its Cockpit and dynamic-playlist entries preserve where playback began. | `m8-library-editable-queue.png`, `m8-compact-playlist.png` | **Adopt.** Keep the visible `Playing from …` source, deterministic cursor, reorder/remove/clear, and one-step Undo. All mutations still cross NaviMuse's single queue authority; server queue persistence is an interoperability boundary, not a second queue. |
| Large-library scanning without losing context | Supersonic uses infinite scrolling, album filters, sortable/configurable track columns, and direct download actions. Substreamer adds grid/list choice and alphabetical quick-scroll. | `m8-library-editable-queue.png`, `m8-compact-playlist.png` | **Adapt.** Retain dense sortable rows on wide windows, grid/list choice for artwork-led browsing, incremental rendering, remembered filters, and stable keyboard focus. Downloads remain deferred; no download affordance ships before the storage contract. |
| One player that survives navigation and joins the operating system | Airdrome provides Media Session integration; Amperfy provides Apple media, CarPlay, Siri, gapless, and offline lifecycle support; Supersonic provides macOS media-center/media-key control. | `m8-full-player-lyrics.png`, all wide references with the bottom transport | **Adopt.** The persistent bottom transport and expanded player are two views of one engine. Media keys, Now Playing, pause/seek, sleep/wake, and reconnect must stay synchronized. CarPlay/Siri belong to the later mobile plan, not the M8 Mac/PWA surface. |
| Lyrics as an optional playback companion | Feishin supports synchronized and unsynchronized lyrics; Supersonic and Amperfy expose lyrics without making them playback-critical. | `m8-full-player-lyrics.png` | **Adopt with explicit states.** Preserve synchronized follow, manual-scroll escape, unsynchronized reading, unavailable, loading, and provider-failure states. Opening lyrics swaps inspector content and never changes the queue or audio session. |
| Honest quality and audio policy | Supersonic exposes gapless, ReplayGain, waveform seek, and optional exclusive playback; Amperfy also implements ReplayGain and EQ. | `m8-settings-playback.png`, `m8-full-player-lyrics.png` | **Adapt.** Keep waveform seek and actual delivered-quality readout. Gapless-compatible behavior remains automatic. ReplayGain enters only through the accepted engine gate; EQ, exclusive/bit-perfect output, and user crossfade remain deferred rather than appearing as decorative settings. |
| Network-loss recovery with visible storage ownership | Substreamer uses a recoverable background download queue, automatic offline switching, storage limits, and explicit cache/data management; Airdrome persists cache and downloads. | `m8-settings-playback.png` | **Adapt narrowly for M8.** “Brief network protection” means current track plus a bounded next-track runway and must report its real state. Full offline downloads, eviction, encryption, and backup require their separate storage contract; the UI must not call cache-ahead “offline.” |
| Fast common actions and reusable mixes | Airdrome exposes full-text results grouped/sorted by artists, albums, and tracks plus radio-like dynamic playlists. Substreamer exposes global search, playlist reorder/save-current-queue, and AudioMuse-backed “Play more like this.” | `home.png`, `discover.png`, `playlists.png`, `m8-library-editable-queue.png` | **Adopt the action grammar, not duplicate features.** `Play now`, `Play next`, `Add to queue`, `Start radio`, and `Start Journey` appear consistently. AudioMuse radio and a bounded Journey remain visibly different products even when both start from the same track. |
| Capability-aware degradation | Substreamer adjusts features to the connected server's reported support and exposes cached/downloaded/scrobble data management. | `m8-settings-playback.png`, `settings.png`, every loading/error reference | **Adopt.** Unsupported lyrics, analysis, quality, or service capabilities render an honest unavailable/degraded state while transport and the local queue remain usable. Never show inert controls or route ordinary listeners into owner setup. |
| Responsive information architecture rather than scaled desktop chrome | Airdrome shares a responsive Web/PWA/Android UI; Substreamer uses a purpose-built tablet multi-pane layout. | `m8-compact-playlist.png` and the wide `m8-*` references | **Adopt.** Compact mode collapses inspectors and queue into explicit layers while retaining the five primary destinations and bottom transport. Wide mode may reveal useful context, but it never reserves an empty queue column. |

Cross-reference outcome: the selected images already place the right anchors—stable
transport, source-labeled editable queue, dense library table, lyrics inspector,
delivered-quality text, and separated listener Settings. Implementation acceptance
must additionally prove the states the polished images cannot show: empty and huge
libraries, unsynchronized/missing lyrics, partial capability, reconnect, cache
pressure, stale search, keyboard focus retention, and undo after queue mutation.
No reviewed client justifies a second player store, a second queue, provider tokens in
the client, or converting Sonic Atlas into a generic radio visualizer.

The important lesson is consistency rather than feature count. A polished client
makes the result of clicking a track obvious, preserves the collection or search
context that produced the queue, exposes the same action vocabulary everywhere, and
recovers without making the listener reconstruct their session. Feature-rich clients
still feel unfinished when a row click, header Play, double-click, and context-menu
action produce different unexplained queues.

### M8 playback priority

**P0 - predictable daily listening:**

- Preserve and harden the existing two-deck gapless transition for compatible
  consecutive tracks, with no duplicate playback, clipped starts, stale metadata,
  artificial pause, or preloaded-track position drift between album tracks.
- One explicit action vocabulary everywhere: `Play now`, `Play next`, `Add to queue`,
  `Start radio`, and `Start Journey`. The default row activation is documented and
  identical in Library, Search, Home, playlists, and Atlas inspectors.
- Source-aware queue creation. Starting an album, playlist, search result set, radio,
  or Journey records and displays that source; selecting a track starts at that item
  within the visible source rather than silently collapsing to a one-track queue.
- Persistent current item, queue order, queue cursor, elapsed position, shuffle and
  repeat modes, volume, and originating context across navigation and ordinary app
  relaunch. Resume must distinguish `Resume` from `Start over` and never autoplay
  unexpectedly on launch.
- Truthful queue mutation with immediate feedback, undo for a single accidental
  remove or clear where safe, deterministic previous behavior, and a visible reason
  when an operation is unavailable for radio or Journey-owned runway items.
- Native media keys and Now Playing remain synchronized with in-app controls through
  pause, seek, track transition, sleep/wake, network recovery, and output changes.
- Playback reporting is idempotent and uses documented thresholds so seeking,
  replaying, relaunch, or reconnect cannot create duplicate scrobbles.

**P1 - high-value product additions:**

- Synchronized lyrics when timestamps exist, readable unsynchronized lyrics
  otherwise, a clear unavailable state, current-line follow with manual-scroll escape,
  and no dependency on lyrics for playback.
- Continuous play or AutoMix is opt-in, visibly separated from the finite user queue,
  and adds only a bounded runway through the same queue authority.
- Streaming format and bitrate are visible but quiet. A change applies at a defined
  track boundary unless the user explicitly restarts the current track; the UI reports
  actual delivered quality rather than only the requested preference.
- Cache-ahead protects the current track and a bounded next-track runway from brief
  network loss. It is not presented as offline download support, which remains outside
  M8 unless a separate storage, encryption, eviction, and rights contract is accepted.

ReplayGain moves into P1 only after the audio-engine spike accepts an off/track/album
policy, bounded preamp, clipping protection, metadata source, and testable interaction
with the existing Web Audio master/deck gain graph. Until then it is deferred and the
Settings surface must not imply that a control is imminent.

**P2 - defer until measured demand:**

- ReplayGain without an accepted spike, equalizer, user-configurable crossfade,
  playback speed, exclusive or bit-perfect output, multi-server aggregation, remote
  casting, and full offline downloads. These are valuable in
  several clients, but each changes the audio, device, persistence, or queue boundary
  enough to require focused architecture and lifecycle evidence. M8 may reserve
  discoverable Settings locations; it must not ship placeholders in the player.

### Interaction and polish contract

- A single click selects; double-click or Return performs the platform-consistent
  default play action; Space toggles playback only when focus is not in an editable
  control; command shortcuts are listed in menus and remain remappable only if a
  complete shortcut system is introduced.
- The primary play control never moves. Secondary controls retain stable dimensions,
  tooltips, focus order, pressed state, and disabled reason in the mini and full
  players. Opening lyrics or the queue changes the inspector, not playback context.
- Track rows reveal the same ordered action set through hover controls, context menu,
  keyboard menu, and VoiceOver actions. Destructive and queue-replacing actions are
  visually distinct; common additive actions do not require confirmation.
- The queue identifies `Playing`, `Played`, `Up next`, and bounded continuous-play or
  Journey additions. Shuffle shows the effective upcoming order while retaining
  enough history for Previous to return to what was actually heard.
- Optimistic favorite, rating, and queue feedback must reconcile with the server.
  Failure restores the prior value and names the failed action without interrupting
  audio or displaying a generic global error.
- Loading, buffering, reconnecting, paused, unavailable, and failed are distinct
  states. Buffering never replaces the play/pause control with an ambiguous spinner;
  elapsed time and seek availability remain truthful.
- Empty and degraded states offer the next useful action. Missing artwork, waveform,
  ReplayGain tags, lyrics, analysis, or Atlas rendering never removes core transport,
  queue, or track-identity controls.

### Usability evidence

M8.0 must capture baseline recordings for five representative tasks: resume a prior
session, play an album from track three, add a search result next, repair an accidental
queue removal, and recover from a network interruption. M8.2 repeats them with
pointer, keyboard, and VoiceOver and records action count, unexpected queue replacement,
focus loss, layout shift, and playback interruption. M8.5 requires at least three
uninterrupted real-library listening sessions covering an album, a hand-built queue,
and a Journey; qualitative sign-off cannot waive a queue or playback-state mismatch.

## Information architecture

Primary macOS navigation begins as Home, Library, Search, Sonic, and Settings,
matching the current product. Library owns Playlists. Sonic provides clear Discover,
Atlas, and Journey modes and exposes active Journey context without creating three
permanent navigation destinations. Promote a child surface to primary navigation
only when task testing shows that the five-destination model hides or slows a common
workflow. Every child surface still retains a keyboard-reachable entry point and
deterministic deep link.

The persistent player spans the window bottom. The queue is a collapsible right
inspector, not a permanently competing column on every screen. It may remain pinned
only at a measured wide breakpoint when it contains useful context; an empty queue
never reserves a fixed column. Sonic Atlas and
Journeys may replace that inspector with contextual detail while keeping queue
access one action away. Window chrome, navigation, content, inspectors, dialogs,
and player use stable layout tracks so asynchronous content does not shift controls.

## Functional coverage matrix

### Application shell and session

- Full-bleed native shell with overlay titlebar, retained traffic lights, tested drag
  regions, window resize, compact and wide Mac layouts, PWA presentation, deep links,
  keyboard navigation, and focus restoration.
- First-launch onboarding, returning-user silent restoration, interrupted onboarding
  recovery, optional contextual tips, and a Settings entry to replay onboarding.
- Local username/password and passkey sign-in, optional Pocket ID sign-in/sign-out,
  setup-token owner creation, locked settings, session expiry, trusted-device
  renewal/revocation, reconnect, and credential-free client behavior.
- Global notifications, dialogs, destructive confirmations, context menus, tooltips,
  command feedback, and diagnostic/service notices.

### Home

- Continue listening with current queue context and immediately useful playback.
- Recent, recently added, smart-playlist, radio, Artist Journey, and AudioMuse entry
  points, filtered by the active Navidrome library and discovery preferences.
- Loading, partial-result, unavailable, empty-library, and missing-artwork states.

### Discover

- Smart playlists, Navidrome radio/SOMA sources, artist and genre discovery, Track
  Journey entry, AudioMuse availability, CLAP/text discovery, and lyrics discovery
  when their production services expose them.
- Results distinguish playable library tracks, exploratory suggestions, unavailable
  analysis, and service failure without blocking ordinary playback.

### Library

- Albums, artists, songs, playlists, and radios; Music Library and Live Music Archive
  switching; grid, cover-list, and compact-list modes; pagination and large results.
- Album/artist detail, play now, play next, queue, shuffle, favorite/rating, playlist
  actions, keyboard selection, and long-title handling.

### Playlists

- Playlist browse/detail, create, add current track, remove track, reorder where the
  service supports it, play/shuffle, busy states, conflict/error feedback, and empty
  playlists. Smart playlists are visually identified as rule-driven and read-only
  where applicable.

### Search

- Debounced playable-library search, album/artist/song grouping, quick searches,
  keyboard result traversal, cancellation, no-result state, stale-request protection,
  and a separately labeled sonic discovery scope.

### Player and queue

- Persistent mini player and full player; square artwork; title, artist, album;
  waveform with progress-rail fallback; elapsed/remaining time; codec/quality status;
  play/pause, seek, previous/next, shuffle, repeat, volume, favorite, rating, queue,
  playlist, similar/radio, lyrics, current output status, and more actions. Casting is
  omitted until a real remote-playback capability exists; M8 does not ship a dead
  placeholder control.
- Preserve current inspect/select, shuffle history, continuous play, playback
  reporting, media keys, output changes, sleep/wake, and network recovery. Add one
  consistent queue mutation model for play next, append, reorder, remove, clear, and
  one-step undo, with capability restrictions for radio and frozen Journey items.
  No visual redesign may create another queue or player state.

### Sonic Atlas

- Full-library overview, exact-point selection, pan/zoom, pointer and trackpad input,
  keyboard alternative, Follow/Overview/Explore camera modes, filters, density/detail,
  focus restoration, and a selected-point inspector with artwork and track actions.
- Journey preview/start, skip, dislike, destination change, reroute, detach, save,
  resume, revalidate, repair, completion, and the complete ordered non-map fallback.
- Once started, a Journey remains visible through automatic advance, Previous, Next,
  seek, pause, transition, window navigation, and reopening Sonic. The view follows
  the persisted Journey identity and canonical queue binding, never `nowPlaying.id`.
  Only a genuine queue replacement detaches it, and that detach is explicit.
- A preview is not silently discarded when playback changes. It remains visible in
  a stale-start state with Recalculate and Dismiss actions; it never masquerades as
  an active Journey.
- Loading, progressive tile delivery, stale identity, renderer initialization,
  context loss, AudioMuse failure, missing analysis, offline, and reduced-motion states.

### Journeys

- Active, saved, completed, detached, stale, and repairable Journeys; ordered stops,
  current position, destination, history, resume, reroute, remove, and playback-owned
  state. A visual possibility is not a Journey stop until the planner resolves it.
- Played, current, transitioning, prepared-next, upcoming, skipped, failed, and
  generated-boundary stops remain spatially and textually distinguishable without
  changing the authoritative queue.
- The map exposes the same previous, play/pause, next, seek, volume, queue, Play Next,
  Pause After Current, Extend Journey, and End Journey behavior as other playback
  surfaces. Map actions dispatch to the shared player and queue; the renderer owns
  no transport state.

### Settings

- Secure settings session, Navidrome and AudioMuse endpoints/health, library choices,
  appearance, streaming format/bitrate, playback, Home/Discovery visibility, artwork
  size, storage/cache, privacy, diagnostics, and save/validation feedback.
- Unsaved, saving, saved, validation-error, locked, degraded-service, and destructive
  reset states use stable placement and specific language.
- Separate ordinary listener preferences from owner administration. First-run setup
  owns bootstrap and required service connection; Settings groups Playback,
  Appearance, Library, Discovery, Storage, Account, Services, and Diagnostics with
  search or a stable subsection index. Owner-only service credentials are not placed
  above everyday playback preferences after setup completes.

## Onboarding and durable sign-in

Onboarding is a short path into real music, not a feature tour. Required setup and
optional education are separate so returning users never wait behind introductory
slides. Follow Apple's guidance that onboarding be brief, interactive, and optional:
https://developer.apple.com/design/human-interface-guidelines/onboarding

### Launch state machine

1. Render the branded shell immediately with a static `SignalSpinner`; do not flash
   a login screen before session restoration finishes.
2. Probe the BFF and restore the app session. A valid session opens the last useful
   surface, queue, and playback context without user interaction.
3. If a short session expired and a trusted-device session exists, rotate it through
   the BFF, issue a new short session, and continue without opening Pocket ID.
4. If authentication is required, preserve the intended deep link and present one
   focused sign-in surface. Resume the intended destination after callback.
5. If deployment setup is incomplete, enter owner setup instead of ordinary sign-in.
6. If the BFF is unreachable, show the cached shell and specific reconnect state;
   never erase queue or onboarding progress because the network is temporarily down.

### First-run owner setup

- **Welcome:** NaviMuse name, one sentence, current BFF origin, and Continue. No
  carousel, marketing copy, or permission wall.
- **Secure access:** create the first local username/password account and offer passkey
  enrollment, or use Pocket ID when the deployment intentionally enables it. Owner
  bootstrap consumes the one-time setup token without exposing it again.
- **Music service:** automatically resolve the Pocket ID subject to the approved
  Navidrome account mapping, test that identity, show its library count, and offer
  service configuration only when federation or connectivity is incomplete.
- **Sonic services:** automatically test AudioMuse through NaviMuse's BFF-held service
  identity, show `Connected by NaviMuse` rather than another user login, clearly mark
  sonic features optional, and allow `Continue with Navidrome` when unavailable or
  still analyzing.
- **Choose library:** select the initial Music Library/Live Music Archive scope using
  real counts and remember it as a preference.
- **Ready:** show one real album and a `Start listening` action. Atlas preparation
  continues in the background and never blocks entry.

Each completed step persists server-side under an onboarding schema version. Relaunch
returns to the first incomplete required step. Completion is per deployment/account;
optional tips are per device and can be reset in Settings.

### Returning-user sign-in

The sign-in view uses the same quiet adaptive surface as the app: NaviMuse identity,
recognized server, `Sign in with a passkey` when available, local username/password,
optional Pocket ID when enabled, `Remember this Mac` enabled by default, and a small
troubleshooting disclosure. It never shows service configuration unless the
deployment is actually incomplete.

After the first successful entry, context tips may point to queue, search, and Sonic
Atlas when each feature is first encountered. Tips never block controls, appear only
once unless reset, and are absent under reduced motion when their positioning would
cause movement.

### Persistent-session contract

The current 12-hour signed app cookie is not sufficient for the desired return
experience. M8 introduces a versioned BFF trusted-device session before changing UI:

- keep a short-lived app session for ordinary authenticated requests;
- add a cryptographically random opaque trusted-device token in a `Secure`,
  `HttpOnly`, `SameSite=Lax` cookie scoped to the narrow refresh endpoint;
- store only a hash of that token server-side with user subject, device label, issue
  time, last use, idle expiry, absolute expiry, rotation family, and revocation state;
- default `Remember this Mac` to a 30-day idle window and 180-day absolute lifetime,
  configurable by deployment policy; rotate on use and reject replay of an invalidated
  predecessor;
- renew silently at launch and before short-session expiry, with concurrency-safe
  rotation so multiple startup requests cannot invalidate a legitimate session;
- regenerate session identifiers after authentication or privilege changes;
- expose `This Mac`, other trusted devices, last active time, revoke-device, and
  `Sign out everywhere` controls in Settings;
- revoke the active short session and trusted-device family on explicit sign-out;
- preserve Pocket ID authorization-code flow with PKCE, state, and nonce. If provider
  refresh tokens are ever requested, `offline_access` consent and encrypted BFF-only
  storage require a separate security review;
- never store the trusted token, provider token, or service credential in React state,
  `localStorage`, IndexedDB, logs, analytics, generated evidence, or artwork caches;
- require HTTPS for persistent sessions outside loopback development and keep the
  existing trusted-proxy and origin restrictions.

Timeouts and rotation are enforced by the BFF. The UI may explain expiration but is
not a security authority. This balances the requested persistence with OWASP's idle,
absolute, renewal, revocation, and identifier-regeneration guidance:
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

OpenID Connect `prompt=none` may be evaluated only as a standards-compliant fallback
check for an existing provider session. It cannot replace the trusted-device record,
and interactive sign-in remains the fallback for `login_required` or
`interaction_required`: https://openid.net/specs/openid-connect-core-1_0-18.html

### Authentication modes and passkeys

Pocket ID is optional. A deployment selects one of three explicit modes:

- `local`: NaviMuse username/password plus passkeys; no Pocket ID controls or
  dependency;
- `oidc`: Pocket ID plus passkeys attached to the resulting NaviMuse account, with
  local password disabled except recovery policy;
- `hybrid`: local accounts and Pocket ID are both enabled and account linking is an
  explicit authenticated action, never automatic matching by email or display name.

All methods resolve to one immutable NaviMuse account ID and the same authorization,
trusted-device, onboarding, Navidrome mapping, and audit contracts. Authentication
method is not itself a role.

#### Local accounts

- Replace the single anonymous administrator-password record with a versioned local
  account schema: opaque account ID, normalized unique username, display name,
  password hash/version, roles, disabled state, created/updated timestamps, and
  downstream identity mappings.
- Usernames are case-insensitively unique and safely normalized, but authentication
  and authorization use the opaque account ID. Responses and timing do not reveal
  whether a username exists.
- New passwords use a pinned, benchmarked Argon2id implementation. If the approved
  runtime cannot support it reliably, use Node's scrypt with reviewed parameters.
  Rehash the existing PBKDF2 administrator credential after successful migration;
  never decrypt or log passwords.
- Apply length and breached/common-password policy without composition gimmicks,
  allow password-manager paste/autofill, rate-limit by account and trusted network
  signals, and preserve the existing setup-token bootstrap guard.
- Recovery uses owner-controlled one-time recovery codes or a fresh deployment setup
  ceremony with explicit session revocation. No security-question or email-reset
  flow is invented without a configured mail and identity-verification boundary.
- Account creation, disablement, role changes, password changes, and recovery rotate
  or revoke affected sessions and produce privacy-safe audit events.

Password storage follows OWASP's current Argon2id/scrypt guidance:
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

#### Passkeys

- Use WebAuthn discoverable credentials so `Sign in with a passkey` can work without
  entering a username. A username-first passkey path remains available for devices
  with non-discoverable credentials.
- Use a pinned, maintained WebAuthn library such as SimpleWebAuthn for option
  generation and response verification; do not hand-roll CBOR, COSE, attestation,
  challenge, origin, RP-ID, counter, or signature validation.
- Registration is allowed only from a recently authenticated account or controlled
  first-owner setup. Require user verification during final response verification
  and default attestation to `none` unless a later device-policy decision requires it.
- Store credential ID, public key, opaque user handle, sign counter, transports,
  device/backup metadata, label, creation time, and last use. Private key and biometric
  data remain with the authenticator and never reach NaviMuse.
- Authentication challenges are random, single-use, server-side, bound to the
  ceremony/session, expire within five minutes, and are deleted after success or
  failure. Verify exact expected origin, RP ID, type, challenge, signature, and user
  verification before issuing a NaviMuse session.
- Support multiple named passkeys, platform authenticators such as Touch ID, synced
  passkeys, and external security keys. Settings can add, rename, and remove them but
  cannot remove the last recovery method without adding another.
- Passkeys require a stable canonical HTTPS origin and RP ID. Pin those values for
  the deployed BFF domain and prove that the packaged Tauri first-party redirect and
  supported PWA origin participate in the same intended relying-party scope. LAN IP
  or changing-host deployments fall back to password until this is valid.
- Passkey cancellation, timeout, unavailable authenticator, invalid signature,
  counter anomaly, lost device, and unsupported WebView receive explicit recoverable
  states without silently falling back to a weaker method.

WebAuthn makes passkeys scoped public-key credentials and requires authorization to
be based on an opaque user handle rather than display name:
https://www.w3.org/TR/webauthn-3/

SimpleWebAuthn's passkey guidance covers discoverable credentials, username-less
authentication, user verification, and one-time server-side challenges:
https://simplewebauthn.dev/docs/advanced/passkeys

### Downstream service identity

The authenticated NaviMuse account is the application identity authority, whether it
was established by a local password, passkey, or Pocket ID. M8 must make Navidrome
and AudioMuse access automatic after that one sign-in, but it must not pretend that
the two upstream services expose the same authentication protocol.

#### Navidrome

The approved integration target is Navidrome externalized authentication, not a
stored copy of each user's password. Current Navidrome supports a trusted source
asserting an authenticated username in `Remote-User`, including `/rest/*` Subsonic
requests: https://www.navidrome.org/docs/usage/integration/authentication/

- Pin the deployed Navidrome version and verify it contains the documented
  `ExtAuth.TrustedSources` and `ExtAuth.UserHeader` behavior before enabling this.
- Define a stable mapping from the immutable NaviMuse account ID (and Pocket ID `sub`
  when linked) to an explicit Navidrome username. Never use mutable display name as
  identity.
- Prefer an administrator-approved mapping for existing accounts. Automatic account
  creation is opt-in, because Navidrome grants the first account on a fresh database
  administrator privileges and otherwise creates users with random passwords.
- Only a dedicated identity-aware proxy or the NaviMuse BFF may set `Remote-User`.
  Strip any client-supplied copy, restrict `ExtAuth.TrustedSources` to the exact
  proxy/BFF source, prevent direct bypass to the protected Navidrome listener, and
  verify Docker network/source-address behavior on the deployed topology.
- Continue to proxy artwork, streams, library, writes, and Subsonic calls through the
  BFF. The React/Tauri client receives neither a Navidrome password nor a reusable
  upstream token.
- Preserve a deployment-controlled service-account fallback during migration and
  degraded auth, but never silently collapse multiple Pocket ID users onto that
  account when user-specific playlists, ratings, or scrobbles are expected.
- Role and library access remain authoritative in Navidrome. Pocket ID groups must
  not grant Navidrome administrator access unless a separately reviewed mapping
  contract explicitly supports it.

Navidrome warns that a misconfigured trusted-header source permits impersonation, so
this work requires a threat model and deployment test before replacing the current
credential flow: https://navidrome.org/docs/usage/admin/security/

#### AudioMuse

The reviewed AudioMuse-AI configuration documents `AUTH_ENABLED`, user/password,
API token, and JWT-secret controls, but not native OIDC resource-server validation:
https://github.com/NeptuneHub/AudioMuse-AI/blob/main/docs/PARAMETERS.md

- NaviMuse therefore authenticates the human once with Pocket ID and authorizes each
  AudioMuse feature at the BFF route. The BFF calls AudioMuse with its existing
  encrypted/file-backed service token; no second login is shown during onboarding.
- Do not forward a Pocket ID ID token or access token to AudioMuse unless AudioMuse
  gains explicit issuer, audience, signature, expiry, and scope validation through
  an accepted upstream release and a versioned NaviMuse contract.
- If direct access to the separate AudioMuse web UI is desired, protect that browser
  surface with an OIDC-capable reverse proxy registered as its own Pocket ID client.
  Keep its cookie, redirect URI, and audience separate from NaviMuse.
- If per-user AudioMuse authorization becomes a product requirement, add native OIDC
  or a validated identity-header boundary upstream as a separate security milestone;
  do not encode it as cosmetic onboarding state.

#### Automatic onboarding result

After any successful local, passkey, or Pocket ID authentication, onboarding runs one
identity bootstrap operation and reports three independent outcomes: `NaviMuse signed
in`, `Navidrome linked as <username>`, and `AudioMuse connected by NaviMuse`. A partial
failure has a specific repair action and never asks for a credential the deployment
can resolve automatically. Navidrome failure blocks library entry; AudioMuse failure
only disables sonic enhancements.

## Visual system

### Structure

- The macOS application is full bleed. Use Tauri's native decorated window with
  `titleBarStyle: "Overlay"` so content extends through the titlebar area while the
  standard traffic lights remain. Do not render a separate title row, centered app
  name, toolbar strip, or imitation window controls.
- Reserve exact safe space for the traffic lights at compact and wide densities.
  Mark only quiet, noninteractive background regions as window drag regions; buttons,
  lists, search fields, scrubbing, scrolling, selection, and Atlas interaction must
  never initiate a window drag. Preserve native window movement and double-click
  behavior and verify it in the packaged Tauri app, not only the browser.
- The PWA uses the same full-bleed composition without traffic-light inset or native
  drag regions. Platform chrome differences stay in the shell adapter rather than
  shifting surface content unpredictably.
- Use an 8 px spatial base with 4 px optical adjustments. Controls have stable
  dimensions; repeated cards use at most an 8 px radius; major surfaces are unframed.
- Use compact macOS-scale typography. Hero-size type is reserved for the full player
  or an artist/album identity moment, never settings or operational panels.
- Use Lucide icons already in the project for commands. Text accompanies an icon only
  when the command is ambiguous, high consequence, or a primary action.
- Avoid pills for ordinary actions, nested cards, glass panels, generic gradients,
  decorative blur fields, and permanent borders around page sections.

### Adaptive color

Create a deterministic `ArtworkPalette` pipeline with cached extraction keyed by
artwork identity. It yields background, surface, foreground, muted foreground,
accent, accent foreground, and two restrained atmospheric colors. The pipeline must:

- sample off the main thread or during artwork preparation, never in render-critical
  interaction paths;
- clamp saturation and luminance into a tested gamut rather than mirror raw dominant
  colors;
- select text and control colors by measured contrast;
- transition only local atmosphere over 350–600 ms, while structural neutrals remain
  stable;
- fall back to a neutral charcoal/soft-white/coral palette for missing artwork;
- store no private artwork-derived payload outside the existing cache boundary.

No screen becomes a full-window blur of the cover. Color appears as restrained light
around artwork, active playback, selection, Atlas regions, progress, and focus.

### Motion language

Use four motion families:

- **Respond:** 80–140 ms opacity/scale feedback for buttons and selection.
- **Rearrange:** 180–260 ms transform/opacity for inspectors, lists, and layout.
- **Reveal:** 220–360 ms staged content entry after data becomes ready.
- **Breathe:** slow low-amplitude state motion only for current playback and active
  Atlas points; pause it when hidden, suspended, settled, or reduced motion is active.

Sonic Journey motion composes those families into state-driven travel rather than
ambient spectacle:

- **Follow:** glide the camera between resolved stops with an interruptible bounded
  transform; never reset framing on ordinary playback advance.
- **Progress:** move one restrained signal along the active segment from playback
  progress. Seeking updates the signal without replaying entry animation.
- **Handoff:** during Smart Blend or crossfade, recede the outgoing stop while the
  prepared next stop gains emphasis; the queue and map change state atomically.
- **Skip:** accelerate toward the next resolved stop and mark the prior stop skipped;
  do not clear, rebuild, or flash the route.
- **Extend and reroute:** draw on only the accepted suffix. Preserve the traveled
  prefix, current stop, camera, and selection.
- **Explore:** playback continues while the camera is user-controlled. A familiar
  location-arrow Return to Journey command restores Follow mode without changing
  queue position.

Every camera move must be interruptible by pointer, trackpad, keyboard, playback,
window, or lifecycle input. Reduced motion replaces camera travel and route draw-on
with stable framing, opacity/state changes, and textual status while preserving the
same controls and information.

Prefer CSS transforms/opacity for simple interaction. Evaluate a pinned Motion for
React dependency only for interruptible layout/presence transitions that are costly
to implement correctly in CSS. Do not add Rive or Lottie in M8: their runtime and
asset pipeline are disproportionate for small product indicators, and an additional
WebGL/WASM animation surface would complicate Atlas context, energy, and recovery.

## Loading and progress system

Loading treatment is selected by task semantics, not screen aesthetics:

1. **Immediate actions under 300 ms:** no loader; retain pressed state.
2. **Local indeterminate work:** a 16–20 px `SignalSpinner`, built from the existing
   Lucide `LoaderCircle` geometry or equivalent inline SVG, with one illuminated arc.
3. **Content fetch:** structural skeleton matching the final rows/shelves; never a
   centered spinner over an otherwise empty page.
4. **Known progress:** determinate bar with real percentage/count, such as analysis,
   cache preparation, or Atlas tile delivery. Never simulate progress.
5. **Atlas preparation:** `PointFieldLoader`, a small deterministic set of points that
   resolves from dust into the actual projection silhouette as manifest/tiles arrive.
   Loaded tiles appear progressively without changing camera framing.
6. **Journey planning:** `RoutePulse`, two or three points exchanging a restrained
   signal; its label says what is happening, such as “Resolving 25 stops,” and exposes
   Cancel when cancellation is supported.
7. **Artwork:** stable aspect-ratio placeholder with a low-contrast luminance wash;
   crossfade the decoded image without shimmer.

All indefinite animation stops when work completes, fails, is aborted, the document
is hidden, the native window is suspended, or reduced motion is enabled. Reduced
motion uses static glyphs, opacity changes, and textual/determinate status. Every
container uses `aria-busy`; meaningful status changes use a non-chattering live
region; spinners themselves are decorative when adjacent status text exists.

External references reviewed for this decision:

- Apple progress-indicator guidance: https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- Motion reduced-motion API: https://motion.dev/docs/react-use-reduced-motion
- Motion performance guidance: https://motion.dev/docs/performance
- MDN reduced-motion guidance: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using_for_accessibility
- LDRS minimalist loader source survey: https://github.com/GriffinJohnston/ldrs
- Rive runtime/state-machine evaluation: https://rive.app/docs/runtimes/web/state-machines

LDRS is inspiration only. M8 should own two or three small NaviMuse indicators in
CSS/SVG so their geometry, accessibility, tokens, and lifecycle are controlled by
the app without adding a loader package.

## Sonic Atlas rendering specification

The real production projection is authoritative. It contains roughly 92K–96K exact
track points with a large irregular central mass, internal voids, wispy boundaries,
and detached islands. M8 must not regularize it into a circular galaxy, invent
geographic semantics, or conceal most points to make the canvas look airy.

### Journey trail truth

The luminous Journey trail is an accepted visual target with a narrow semantic
meaning: it communicates ordered playback history, normalized progress on the active
handoff, and the accepted future stop sequence. Every stop remains anchored to its
exact AudioMuse projection coordinate. Interpolation between stops is presentation
geometry only; it is not an AudioMuse graph edge, street, distance, cluster boundary,
or claim about unsampled embedding space. Visual smoothing must never move a stop,
hide a jump, reorder the Journey, or imply that a decorative curve is provider data.

If a real AudioMuse route backtracks or crosses the 2D projection, NaviMuse renders
that truth. Camera choreography and progressive emphasis may keep it legible, but
they may not redraw a more flattering route. A future route-aware projection or graph
may strengthen the metaphor only after a versioned AudioMuse contract and lab gate.

### Required render passes

1. Clear to the stable Atlas neutral, independent of album-color extraction failure.
2. Draw all points at the selected LOD as crisp antialiased point sprites. Use size,
   alpha, and local density to preserve individual texture without forming a teal
   slab. Never load tens of thousands of album covers for map rendering.
3. Apply a restrained palette field derived from the current artwork palette and
   deterministic projection-space bands. This colors regions consistently while
   preserving topology; it does not imply genre truth unless a versioned contract
   supplies genre/cluster metadata.
4. Draw hover/focus/selection halos and accessible focus state. Album art and metadata
   appear only in the selected-point inspector/popover, never as resting map markers.
5. Draw resolved Journey stops with state-specific pulse/ring treatments. When route
   context is requested, render the accepted order as a bounded soft trail with a
   traveled prefix, active progress, and restrained upcoming suffix. It must remain
   subordinate to the exact topology and carry only the accepted Journey-trail
   meaning above.
6. Draw current playback last, with a bounded breathing signal visible at every LOD.

### Rendering behavior

- Preserve the current `regl@2.1.0`/WebGL2 renderer isolation and exact-point tile
  delivery. Any renderer frame/style contract extension lands versioned before its
  dependent UI and receives the required lab acceptance evidence.
- Compute density metadata once per loaded tile or in an evidence-approved contract;
  do not run an O(n²) neighborhood pass in the frame loop.
- Use typed buffers and batched draw calls. Palette changes update uniforms or a
  compact lookup texture, not 96K React nodes and not per-point DOM styles.
- Camera fitting must use real projection bounds and stable padding. Progressive LOD
  swaps preserve current point, selection, destination, Journey stops, and camera.
- Pan/zoom and hit testing must remain exact enough to select a visible point. Hover
  is throttled; selection is persistent; keyboard focus has a non-map equivalent.
- Animate only bounded overlays. The 96K-point base is static between camera or data
  changes. Pause requestAnimationFrame when settled, hidden, suspended, or reduced.
- Follow/Overview/Explore is product state outside the renderer. Renderer frames may
  consume a versioned camera intent, stop state, and normalized playback progress but
  may not derive queue position or discard a Journey when the current track changes.
- Target perceptually continuous 60 Hz interaction on the pinned MacBook Air. Record
  frame-time percentiles for Follow travel, Smart Blend handoff, skip, route extension,
  and user-interrupted camera motion; no accepted effect may cause audio underruns.
- Define point-size and alpha curves for 1x/2x DPR and every supported window class.
  Avoid broad glow, additive overdraw, and blur passes that threaten fill rate.
- Preserve renderer-neutral failure isolation, context-loss recovery, identity-keyed
  cache invalidation, 128-tile budget, six-request tile concurrency, and ordinary
  playback during every failure.

The production-topology and `m8-sonic-journey-*` PNGs are look-and-feel and state
composition targets, not renderer evidence. Their invented geometry, copy, artwork,
and point data are non-normative. M8 must compare the real projection, controls, and
state transitions against these references on the pinned MacBook Air.

## State and accessibility requirements

Every redesigned component documents default, hover, focus, active, selected,
disabled, loading, success, empty, error, offline, locked, stale, and reduced-motion
states where applicable. Keyboard and VoiceOver flows must expose all actions
available by pointer. Focus never disappears into album-derived color.

Use WCAG contrast checks against every generated palette. Support 200% text zoom,
long titles, missing metadata, narrow desktop windows, system reduced motion,
increased contrast, and reduced transparency. The ordered Journey fallback remains
complete and operable when canvas rendering is unavailable.

## Delivery sequence

### M8.0 - Inventory and contracts

- Freeze the functional coverage matrix and capture baseline screenshots.
- Record the current capability ledger as `preserve`, `harden`, `add`, or `defer`;
  prohibit surface branches from reimplementing `preserve` behavior or presenting a
  `defer` capability as an enabled control.
- Capture the five baseline playback-task recordings and freeze the shared track
  action vocabulary, default activation behavior, source-aware queue contract,
  persistence schema, and playback-reporting thresholds before redesigning controls.
- Record exact production head, services, target hardware, macOS, WebView, DPR,
  dataset identity/count, and power state.
- Define design tokens, palette contract, component-state schema, visual-regression
  viewports, and any renderer-style contract extension.
- Pin Pocket ID, Navidrome, AudioMuse, reverse-proxy, and Docker-network identities;
  publish the NaviMuse-account-to-Navidrome mapping contract and downstream-auth
  threat model.
- Publish the versioned local-account, WebAuthn ceremony/credential, recovery, account
  linking, and authentication-mode migration contracts before UI implementation.
- Send renderer-affecting changes through the Sonic Atlas lab gate and land shared
  contracts before implementation branches.

### M8.1 - Foundations

- Add bounded BFF payload normalization and an application recovery boundary while
  preserving the supported app's existing service-error and retry states. Treat this
  as defense in depth and development-harness hardening, not a prerequisite rewrite.
- Replace the current fixed three-column breakpoint with measured compact and wide
  layout contracts. Collapse the empty queue, preserve useful content width, and
  verify every width around the 900 px transition rather than only endpoint screenshots.
- Configure and verify the full-bleed overlay titlebar in the packaged Tauri app,
  including traffic-light clearance, focused and unfocused dragging, double-click,
  fullscreen transitions, compact/wide resize, and no accidental drag from controls.
- Introduce tokenized color, typography, spacing, elevation, focus, and motion.
- Build application shell, navigation, inspectors, toolbar, buttons, menus, dialogs,
  notices, skeletons, progress, artwork, empty/error states, and loading indicators.
- Run onboarding, trusted-device sessions, local accounts, passkeys, recovery, and
  account migration as a contract-first security workstream. Only its first-launch
  shell and session-state interfaces block surface integration; unfinished optional
  authentication modes do not block daily-player layout and interaction work.
- Land Navidrome trusted-source integration and AudioMuse service-identity bootstrap
  behind deployment flags, retaining the current credential path for rollback.
- Add an internal component-state gallery and automated contrast tests.

### M8.2 - Daily player surfaces

- Redesign shell, Home, Library, Playlists, Search, Settings, mini player, full player,
  queue, and playlist dialogs without changing domain ownership.
- Preserve and instrument the existing transition engine, queue persistence, shuffle
  history, Media Session, and playback reporting before changing their controls.
- Land the source-aware queue descriptor and complete mutation workflow before adding
  new playback features. Then add accepted P1 lyrics, delivered-quality reporting,
  and bounded cache-ahead behind explicit capability and degraded-state tests.
  ReplayGain remains gated by the audio-engine spike; do not pull P2 engine work into
  the visual redesign.
- Repeat the five representative tasks with pointer, keyboard, and VoiceOver and
  record action count, focus loss, queue replacement, layout shift, and interruption.
- Verify every matrix action and degraded state before moving to Atlas.

### M8.3 - Discover and Journeys

- Redesign discovery entry points, results, analysis status, Journey planner, saved
  Journey management, ordered fallback, repair, and contextual inspectors.
- Land the Journey-identity continuity contract and shared playback-control parity
  before renderer motion depends on it. Prove advance, skip, transition, navigation,
  relaunch, stale preview, and genuine queue-detach behavior without the canvas.

### M8.4 - Atlas renderer and interaction

- Implement the accepted visual renderer contract, density treatment, palette field,
  exact-point interaction, camera controls, progressive loading, selection inspector,
  and bounded Journey overlays, including Follow travel, progress, handoff, skip,
  extension, reroute, Explore, and Return to Journey states.
- Re-run sustained renderer, context-loss, memory, thermal, and battery evidence on
  the real full-library dataset and pinned MacBook Air.

Implementation checkpoint (2026-08-30): the Overview population path now selects
every populated tile from the manifest's highest-detail LOD and reports ready only
when unique loaded points, renderer-drawn points, populated tiles, and manifest
population agree. The live AudioMuse manifest inspected at this checkpoint contains
94,736 points at LOD 2; stripped-coordinate visual evidence and executable tests
record 94,736 loaded and drawn at 1× and 2× pixel ratios. This closes the earlier
5,198-point sampled resting-map gap. Sustained pinned-hardware and packaged-production
evidence remains part of the M8.4 gate.

### M8.5 - Polish and release proof

- Complete motion, copy, icon, tooltip, keyboard, VoiceOver, contrast, reduced-motion,
  reduced-transparency, missing-data, offline, and service-failure audits.
- Run screenshot comparison at compact/wide Mac and supported PWA viewports.
- Conduct repeated end-to-end daily listening and Journey sessions with no mocked
  data and no console errors.
- Produce the final Apple Silicon distribution candidate: Developer ID signing,
  Apple notarization, stapling, Gatekeeper verification, package checksum, release
  channel record, rollback instructions, diagnostics review, and packaged WebGL
  recovery evidence on the pinned MacBook Air. This must be proven on the exact
  M8 release-candidate commit, not inherited from M7 scaffolding or an earlier
  notarized M7 artifact.

## Verification gates

M8 is complete only when all of the following pass on one exact commit:

- the functional matrix has a test or recorded manual proof for every row;
- unit, contract, integration, server, Tauri, and production-build suites pass;
- no ordinary playback behavior depends on AudioMuse, Atlas, or animation runtime;
- gapless-compatible album playback, queue source/cursor persistence, Previous under
  shuffle, bounded continuous play, media-key synchronization, and idempotent
  playback reporting pass against real library tracks; ReplayGain evidence is
  required only if its separate audio-engine gate accepts it into M8;
- absent or malformed bootstrap fields, locked sessions, BFF loss, service loss, and
  a deliberately thrown surface render error produce recoverable shell states rather
  than a blank window or lost local queue;
- compact and wide layouts plus widths immediately below, at, and above every shell
  breakpoint retain the agreed minimum content width and do not reserve an empty
  queue column;
- the five representative usability tasks complete by pointer, keyboard, and
  VoiceOver with no unexplained queue replacement, lost focus, unexpected autoplay,
  or interruption of the current track;
- an active Journey remains visible and queue-attached across automatic advance,
  manual skip, Smart Blend/crossfade, seek, pause, navigation away and back, and
  renderer recovery; its current, played, skipped, prepared, upcoming, and generated
  states match the canonical queue after every action;
- Follow, Overview, Explore, and Return to Journey are interruptible, preserve the
  current stop and selection, meet the accepted frame-time envelope, and degrade to
  a complete reduced-motion presentation without affecting audio;
- screenshots pass at pinned compact/wide Mac and PWA viewports with no overlap,
  clipping, layout shift, illegible palette, blank canvas, or missing asset;
- keyboard-only and VoiceOver users can complete playback, queue, playlist, search,
  onboarding, sign-in, trusted-device management, settings, Journey, and
  ordered-fallback workflows;
- reduced motion and reduced transparency are visually complete, not merely disabled;
- a 30-minute full-library Atlas session meets or improves the accepted M4 frame-time,
  memory, battery, and thermal envelope and survives WebGL context loss;
- dynamic palette extraction meets contrast, latency, cache, and missing-artwork tests;
- loading indicators reflect real state, stop correctly, never block unrelated audio,
  and produce no continuous idle animation or hidden-window frame loop;
- a returning trusted Mac reaches the last useful surface without visible auth flash;
  expired, revoked, replayed, concurrent-rotation, offline, and sign-out-everywhere
  sessions fail securely while preserving recoverable local playback state;
- one Pocket ID sign-in establishes the mapped Navidrome identity and BFF-authorized
  AudioMuse access without exposing downstream secrets; forged identity headers,
  direct-listener bypass, mismatched users, missing mappings, and partial service
  failures are independently tested;
- local username/password and username-less passkey sign-in establish that same
  downstream identity; replayed/expired challenges, wrong origin/RP ID, invalid
  signatures, account enumeration, lost authenticators, recovery, method linking,
  and legacy-admin migration are independently tested;
- the final Apple Silicon distribution candidate is Developer ID signed, Apple
  notarized, stapled when applicable, accepted by Gatekeeper, checksummed, recorded
  in the release channel, rollback-tested, diagnostics-reviewed, and proven through
  packaged WebGL recovery on the pinned MacBook Air;
- product review signs off against the real app, not generated mockups alone.

Exit evidence: NaviMuse presents one coherent, highly polished music experience
across daily listening and Sonic Atlas while preserving all accepted contracts,
degraded behavior, native requirements, and the operational PWA.

## Explicit non-goals

- No BFF rewrite, Node sidecar, Tauri mobile, Windows/Linux promise, or PWA removal.
- iOS and Android are separately gated M9 and M10 programs; M8 creates reusable
  contracts and responsive behavior but does not authorize either mobile shell.
- No new queue, player, Journey authority, or renderer-owned product state.
- No forwarding Pocket ID tokens to Navidrome or AudioMuse as if they were valid for
  a different audience, and no mutable display-name-only account mapping.
- No custom WebAuthn cryptography, automatic account linking by email, plaintext or
  reversible passwords, or passkey-only account without a proven recovery path.
- No geographic language, distance, ETA, streets, or unvalidated similarity claims.
- No invented branching Journey graph. True branch planning requires a new accepted
  lab decision and versioned production contract.
- No Rive/Lottie runtime, decorative 3D scene, per-point album-art texture, or design
  dependency added solely because it resembles a concept image.
