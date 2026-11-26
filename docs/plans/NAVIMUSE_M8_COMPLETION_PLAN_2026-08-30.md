# NaviMuse M8 Completion Plan

Date: 2026-08-30  
Status: active completion plan  
Current product assessment: M8.3  
Audited commit: `d996ac7e2a4cdb6e7b0d78bb5c147b5dc45f672a`

## Purpose

M8 has reached the intended visual direction, but it has not reached the original
daily-player exit criteria. The remainder of M8 is therefore a playback and product
truth program, not another broad visual redesign.

This plan reconciles:

- `NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md`;
- `NAVIMUSE_M8_PLAYBACK_EXPERIENCE_PLAN_2026-08-30.md`;
- `m8-functional-coverage-matrix.md` and the frozen M8 contracts;
- the selected `design/finalists/c-cinematic-focus` renderings;
- the production behavior observed on the audited commit with real Navidrome and
  AudioMuse data.

It also incorporates a source-level review of current open-source clients from the
[Navidrome apps directory](https://www.navidrome.org/apps/). The comparison is used
to validate daily-player behavior, not to import another client's visual language or
expand M8 into a feature census.

M8 remains complete only when one exact release candidate satisfies the existing
product and playback exit criteria. A green visual fixture or a large unit-test count
does not substitute for an operable listening session.

## M8.3 current truth

### Landed and worth preserving

- The five-destination shell, persistent bottom transport, responsive layouts,
  onboarding boundary, Home, Library, Search, Sonic, Settings, playlists, player,
  queue inspector, and Atlas surfaces follow the selected Cinematic Focus direction.
- The ordinary queue remains the single playback authority. Queue persistence,
  cursor, position, shuffle history, repeat, continuous in-queue advance, media
  session integration, playback reporting, and the two-deck web adapter remain in
  place.
- Ordinary queues support remove, bounded Up Next movement, clear upcoming, and one
  exact undo snapshot. Atlas queue order remains protected from ordinary edits.
- Journey planning can preview a real AudioMuse route without changing playback.
  The Atlas uses real projection topology and preserves the ordered fallback.
- The audited commit builds and all 546 automated tests pass.

### Still incomplete

- The frozen track-action vocabulary exists as a contract, but `Play next` and `Add
  to queue` are not wired consistently across track-bearing surfaces.
- Queue source descriptors are validated by contract tests but are not attached,
  migrated, persisted, and presented as the source of the live queue.
- Queue mutation is incomplete as a user workflow: played clearing, additive
  actions, generated-continuation placement, consistent disabled reasons, and
  pointer/keyboard/VoiceOver task proof remain absent.
- `Continuous Queue` still conflates already-queued advancement with Journey
  extension and autoplay. The three settings and queue boundaries required by the
  playback plan do not yet exist as separate product behaviors.
- The web transition baseline still uses broad session rules. It does not yet issue
  immutable, revision-keyed `TransitionDecision` records from album sequence,
  context, readiness, format, and explicit settings.
- The native playback engine gate, captured audio fixtures, and accepted adapter ADR
  have not been completed. The product therefore cannot claim proven authored
  gapless playback, accepted ReplayGain, configurable crossfade, exclusive output,
  or bit-perfect behavior.
- A planned Journey preview is correctly detached, but the transition from Preview
  to Start to one attached, playable queue is not obvious or fully proven in the
  daily flow. Preview controls being disabled is truthful; the product still needs a
  prominent start action and attached-state confirmation.
- The production BFF fetches the complete AudioMuse map (`/api/map?percent=100`) and
  the audited live source contains 94,736 points, but the resting Overview selects
  LOD 0. That LOD is capped at 64 tiles times 128 points, so no more than 8,192 of
  those tracks can be drawn. The production screen therefore shows a sampled map,
  not the complete AudioMuse track field required by the selected design.
- Automatic Journey runway extension, generated-boundary display, failure-at-final-
  stop choices, and ordinary-queue autoplay are not complete.
- Lyrics, delivered-quality truth, signal-path diagnostics, and bounded cache-ahead
  remain gated. The renderings show their intended composition, not proof that the
  capabilities exist.
- The required real-library usability recordings, captured transition evidence,
  packaged lifecycle sessions, accessibility pass, long Atlas session, signing,
  notarization, rollback proof, and exact-release visual comparison remain open.

## What the selected renderings require

The selected images are semantic references, not a checklist of decorative pixels.
They imply the following product behavior:

1. `m8-library-editable-queue.png` requires a source-labeled queue with Played,
   Playing, and Up Next sections; additive actions; safe reordering and removal; and
   one-step recovery without interrupting the current track.
2. `m8-full-player-lyrics.png` requires a player that is genuinely loaded and
   seekable, exposes truthful quality and analysis states, and shows lyrics only when
   a real synchronized or plain-text capability is available.
3. `m8-settings-playback.png` requires settings that change real playback behavior.
   No inert toggle or unmeasured gapless/quality claim may be included merely because
   it appears in the concept.
4. `m8-sonic-journey-follow.png`, `transition.png`, and `explore.png` require one
   attached Journey whose route, queue, player, transition status, and camera remain
   synchronized while audio advances. The Atlas must never become a second player.
5. The galactic Atlas references remain the visual target: real AudioMuse topology,
   atmospheric starlight rather than orb markers, a blended mood nebula, and an airy
   route ribbon. Every AudioMuse track must remain represented in the resting map;
   airiness comes from point treatment, opacity, color, and density-aware rendering,
   not from hiding most of the library. Visual refinement is accepted only after the
   complete field and the same live route are operable through the shared player.

## Open-source client precedent and NaviMuse adoption decisions

Reviewed on 2026-08-30 against the current source of five representative,
open-source Navidrome/OpenSubsonic clients listed in the
[Navidrome client catalog](https://www.navidrome.org/apps/):

| Client | Source-level daily-use pattern | NaviMuse decision | Selected-rendering cross-reference |
| --- | --- | --- | --- |
| [Airdrome](https://github.com/JPGuillemin/Airdrome) | Uses OpenSubsonic `getPlayQueue`/`savePlayQueue`; restores the current track and position paused; saves after queue mutations and on unload; exposes Play next/Add to queue; updates MediaSession position; and prepares the next URL through its cache-backed audio path. | Adopt the restore-paused rule, mutation-triggered persistence, MediaSession parity, and bounded next-track preparation. Do not copy its single undifferentiated continuation model. | `m8-library-editable-queue.png` and the persistent bottom transport become real session surfaces, not fresh-start-only compositions. |
| [Supersonic](https://github.com/supersonic-app/supersonic) | Saves queue/index/position locally and, when supported, to the server; falls back locally and skips deleted tracks safely; saves on queue changes; offers Play next/Add to queue, pause after current, near-end autoplay, next-track waveform preparation, media-key integration, and an MPV playback backend. | Adopt resilient local-plus-server restore, missing-item repair, pause after current, and precomputed next-track presentation. Treat MPV as evidence for the engine gate, not an automatic implementation choice. Keep autoplay visibly generated and separately controlled. | `m8-full-player-lyrics.png` may prepare waveform/lyrics without blocking transport; `m8-settings-playback.png` must expose measured adapter capability rather than a generic gapless promise. |
| [Feishin](https://github.com/jeffvli/feishin) | Persists its player store, restores server queue timestamp, can autosave the queue, separates web and MPV backends, triggers Auto DJ from a configurable remaining-item threshold, implements end-of-song/end-of-album/timed sleep behavior through a shared pause-after-current primitive, and keeps Queue/Lyrics/Related/Visualizer inside one full-player workspace. | Adopt the shared pause-after-current primitive, explicit generated-continuation threshold, and Queue/Lyrics full-player tabs. Defer Related/AutoMix until an accepted provider exists, and defer the larger sleep-timer menu unless it fits after the P0 queue work. Make backend-specific capabilities and degradation visible; never imply that web and native engines are equivalent. | The settings rendering keeps one calm playback surface while diagnostics carry backend detail; *m8-full-player-lyrics.png* retains its Queue/Lyrics hierarchy without adding placeholder tabs. |
| [Airsonic Refix](https://github.com/tamland/airsonic-refix) | Uses the same Play, Play next, and Add to queue vocabulary across album and track menus; exposes remove, clear, shuffle, and Save as playlist on the queue; checkpoints queue index and position; and integrates MediaSession controls. | Adopt one action vocabulary on every track-bearing surface and retain Save queue as playlist as a later daily-use candidate. Keep queue persistence and MediaSession bound to the same player authority. | *m8-library-editable-queue.png* remains the canonical queue surface, while *m8-full-player-lyrics.png* and the bottom transport expose the same actions without inventing a second queue. |
| [Amperfy](https://github.com/BLeeEZ/amperfy) | Maintains persistent context and user queues internally, gives explicit user-queued tracks priority, supports queue movement/removal, and predownloads a bounded set of upcoming tracks. Its [public queue discussion](https://github.com/BLeeEZ/amperfy/issues/688) also shows that exposing “user queue” versus “context queue” terminology can confuse users. | Adopt internal item provenance and priority, plus bounded preparation of the next two tracks. Reject multiple visible queue concepts: NaviMuse presents one authoritative queue with source, Played/Playing/Up Next, and a labeled generated boundary. | This directly preserves the simple queue inspector in `m8-library-editable-queue.png` and the single Journey queue in `m8-sonic-journey-follow.png`. |

These precedents freeze the following product rules for the remainder of M8:

1. **One visible queue, richer internal provenance.** Every item records whether it
   came from the committed source, an explicit user action, or generated
   continuation. The UI never asks a listener to understand separate user/context
   queues.
2. **Restore is quiet and repairable.** Persist queue identity, source, cursor, and
   position after every committed mutation and at bounded playback checkpoints.
   Restore paused; fall back locally when server queue retrieval fails; remove or
   label unavailable items without losing the remaining session.
3. **Explicit intent wins.** Play next inserts after the current item; Add to queue
   inserts after prior explicit additions and before generated continuation. Manual
   items are never displaced by Journey extension or autoplay.
4. **Preparation is bounded and cancellable.** Keep the current item and next two
   committed items ready when permitted. Queue revision changes cancel stale audio,
   waveform, lyrics, and artwork work.
5. **Continuation has a visible seam.** Ordinary autoplay and Journey extension may
   begin before the queue runs dry, but generated items appear below a labeled,
   removable boundary. Fetching may not block already committed audio.
6. **Pause after current is the primitive.** Ship Pause after current with the queue
   work. End-of-album and timed sleep may build on it later, but must not fork
   transport ownership.
7. **Capabilities are adapter-specific.** Web and accepted native backends report
   their actual gapless, crossfade, output, quality, and recovery capabilities.
   Controls disappear or explain why they are unavailable when the active adapter
   cannot honor them.

## Completion sequence

### M8.4A - Restore and transport truth

Make the first listening action dependable before adding more features.

- Define explicit `restored`, `loading`, `ready`, `playing`, `paused`, `buffering`,
  `recovering`, `ended`, and `error` transport states.
- Make the first Play after relaunch load the restored current item at the persisted
  position in one action, with an honest loading state and no autoplay.
- Save the queue after every committed mutation and checkpoint playback position at
  a bounded cadence. Prefer the OpenSubsonic server queue when available, retain a
  local fallback keyed to the server identity, and restore in a paused state.
- Repair a restored queue containing deleted or unavailable tracks without dropping
  its surviving source, cursor, and position.
- Ensure stale deck, seek, ended, session-rotation, network-loss, and source-change
  events cannot leave the visible queue and the audible deck disagreeing.
- Surface a retryable named error without discarding queue identity, cursor, or
  position.
- Prove resume, pause/resume, Next, Previous, seek, shuffle Previous, repeat, media
  keys, sleep/wake, network loss, and BFF-session recovery against real tracks.

Acceptance evidence:

- automated transport-state and stale-event tests;
- a packaged recording of relaunch, one-click resume, network loss, and recovery;
- no duplicate now-playing or scrobble reports during the same session.

### M8.4B - Finish the authoritative queue workflow

- Persist `QueueSourceDescriptorV1` with a conservative migration for existing
  `navimuse.queue.v1` snapshots and display the source in the queue inspector.
- Wire the frozen action order—Play now, Play next, Add to queue, Start radio, Start
  Journey—through every supported track surface.
- Insert Play next immediately after the committed current item and Add to queue
  before any generated continuation. Neither action may interrupt current audio.
- Complete Up Next reorder, remove, clear upcoming, clear played, generated-boundary
  removal, and one-step undo with named restrictions for attached Journeys.
- Store item provenance internally (`source`, `explicit`, or `generated`) while
  continuing to render one queue. Do not expose separate context/user queue modes.
- Keep selection, queue indices, shuffle history, prepared-next cancellation, and
  playback reports coherent after every mutation.

Acceptance evidence:

- one shared action-parity test matrix across Home, Library, Search, playlist, full
  player, queue, Sonic results, and Atlas point inspector;
- pointer, keyboard, and VoiceOver recordings for Play next, Add to queue, reorder,
  remove, clear, and undo;
- a real-library recording of “play album from track three, add a search result next,
  remove it, then undo” without interrupting the current track.

### M8.4C - Separate continuation policy

Implementation note (2026-08-30): Pause after current is now wired through the
authoritative queue/player controls and transport state. It persists with the queue,
survives navigation and queue edits, yields to no repeat or generated-continuation
path at natural end, cancels prepared transitions, advances the cursor to a paused
next track when available, and clears only after firing or explicit cancellation.
Automated coverage exercises natural end, manual Next, seek independence, repeat,
queue edits, relaunch migration/restore, cancellation, and accessible pressed-state
controls. Packaged real-track capture remains part of the release-candidate evidence.

- Replace the conflated Continuous Queue control with three independent settings:
  Continue through queue, Extend Journeys automatically, and Autoplay after queue.
- Default to continue enabled, Journey extension enabled for an active Journey, and
  autoplay disabled.
- Mark the generated continuation boundary inside the existing queue and make it
  visible, removable, and reversible.
- Add Pause after current as a queue/player action backed by the same transport state
  machine. It must survive navigation, clear automatically after firing, and remain
  independent of repeat, Journey extension, and autoplay.
- Trigger extension/autoplay early enough to keep a bounded runway, but never insert
  ahead of explicit user additions or block the last committed track while fetching.
- Keep ordinary album, playlist, radio, Artist DJ, and Journey behavior distinct.
  No mode may create a second queue.

Acceptance evidence:

- migration tests for existing preferences;
- boundary tests for end of queue, repeat, shuffle, manual stop, and generated items;
- truthful queue-end and extension-failure UI states.
- Pause-after-current tests for natural end, manual Next, seek, repeat, queue edits,
  relaunch, and cancellation.

### M8.4D - Implement the transition contract and correct the web baseline

Implementation status (2026-08-30): the queue-revision-keyed decision/event
contract, authored-pair detection, configurable Smart Blend/fixed-crossfade policy,
deterministic degradation reasons, and truthful Settings/Atlas diagnostics are
implemented. The current web adapter deliberately degrades authored pairs to a
standard boundary because sample-accurate gapless playback has not been captured.
The policy and integration suite is complete; captured boundary/fade measurements
remain part of the M8.4E engine gate and must not be inferred from UI behavior.

- Freeze the serializable, queue-revision-keyed `TransitionDecision` and transport
  event contracts from the playback plan.
- Detect sequential same-album/disc pairs and preserve their authored boundary. Do
  not apply a multi-second Journey fade to those pairs.
- Use deterministic Smart Blend only for accepted mixed contexts, with duration,
  readiness, unknown-duration, short-track, stream, and failure fallbacks.
- Make existing settings drive decisions or remove the settings. Replace the generic
  “gapless” label with measured capability language.
- Add transition and degradation diagnostics without making AudioMuse or Atlas a
  dependency of ordinary playback.

Acceptance evidence:

- deterministic policy fixtures for album, playlist, Journey, Artist DJ, radio,
  manual skip, live stream, unknown duration, failed preload, and queue edits;
- captured web-adapter boundary and fade measurements;
- no next track begins at a non-zero offset, clips, duplicates, or stalls the queue.

### M8.4E - Complete the macOS engine gate

Implementation status (2026-08-30): the PB.0 evidence input is reproducible. A
versioned generator now freezes sample-exact continuous-boundary, silence, loudness,
and peak WAV fixtures and records macOS codec-generation availability without
substitution. The audited MacBook Air has no controlled loopback route configured,
so adapter captures, comparative measurements, and the acceptance ADR remain open.

- Run the same pinned audio fixtures through the current WebView adapter and the
  shortlisted native adapters.
- Measure boundary discontinuity, inserted/dropped/duplicated audio, transition
  timing, clipping, codec coverage, startup, sleep/wake, output changes, memory,
  energy, packaging, and rollback behavior.
- Publish an ADR accepting one native adapter or explicitly retaining the web
  adapter for M8. Do not choose from reputation or mock UI.
- Integrate only capabilities proven by the gate. ReplayGain, configurable
  crossfade, output selection, exclusive mode, and bit-perfect claims remain absent
  when rejected or unproven.

Acceptance evidence:

- loopback audio captures and machine-readable results on the pinned MacBook Air;
- accepted adapter ADR and queue/transport boundary;
- rollback to the web adapter without queue or settings loss.

### M8.4F - Render the complete AudioMuse track map

- Remove the sampled resting-map behavior. When Overview reaches `ready`, the number
  of unique rendered point IDs must equal the current projection manifest
  `pointCount`.
- Preserve every real coordinate, the full projection bounds, central mass, holes,
  wispy edges, and detached islands. Do not replace missing points with generated
  stars, clusters, or synthetic topology.
- Keep progressive loading and semantic detail levels, but use them for point size,
  opacity, interaction detail, and tile scheduling—not permanent population loss.
  A partial progressive frame may be labeled loading; it may not be labeled the
  complete Overview.
- Make the galactic treatment work at full population through density-aware alpha,
  starlight scale variation, color fields, and bounded nebula texture. Selected,
  current, destination, and Journey stops remain exact pinned overlays rather than
  oversized resting orbs.
- Expose projection count, loaded count, drawn count, selected LOD/detail policy,
  tile completion, and renderer degradation in diagnostics so a sampled or partial
  map cannot be mistaken for a complete one again.
- Keep production and evidence paths honest. Synthetic fixtures may test failure and
  deterministic layout, but final captures must use the live AudioMuse projection
  and record the manifest count alongside the rendered unique-point count.

Acceptance evidence:

- a live manifest/draw assertion proving 94,736 of 94,736 unique points for the
  current audited projection, and equality against `manifest.pointCount` when the
  library changes;
- same-state Overview, Follow, and Explore captures compared to
  `sonic-atlas-production-topology.png` and the selected galactic Journey references;
- exact-point selection proof at supported device-pixel ratios after full-field
  rendering;
- a 30-minute full-map session meeting the accepted frame-time, memory, energy, and
  thermal envelope with no hidden-window frame loop or playback interruption.

### M8.4G - Make Journeys playable and continuously attached

- Give every successful preview an obvious Start Journey action that atomically
  commits the frozen route and begins through the shared player.
- After start, replace preview/detached language with attached queue identity and
  enable shared Previous, Play/Pause, Next, and Open queue controls.
- Preserve Journey identity and stop states across automatic advance, manual skip,
  seek, pause, transition, navigation, relaunch, renderer loss, Explore, and Return
  to Journey.
- Implement duration-aware append-only runway extension with at least two resolved
  upcoming stops. A slow or failed extension must never block already playable audio.
- At the final committed stop, present Retry, Change destination, Continue similar
  music, and Stop without fabricating more route.

Acceptance evidence:

- a real AudioMuse Journey from preview through start, transition, extension,
  Explore, renderer recovery, and truthful completion;
- exact queue/route assertions after every action;
- ordinary Navidrome playback continues while AudioMuse and the renderer are down.

### M8.4H - Resolve the remaining P1 capability gates

Lyrics decision: **accepted and implemented.** The authenticated BFF retrieves the
configured library's structured lyrics because AudioMuse uses that source during
analysis but persists only embeddings/axis vectors. The player preserves synchronized
timestamps and source offsets, falls back to readable plain text, cancels stale track
requests, exposes manual follow escape and reduced-motion behavior, and keeps every
failure independent from audio and queue authority. Compact and wide visual evidence
is stored under `docs/evidence/m8/player-queue/`.

Delivered quality/signal path decision: **deferred.** The current legacy `/stream`
playback path exposes requested format and source metadata but does not return an
authoritative direct/transcoded decision. The player now labels those two facts
separately and diagnostics explicitly withhold a delivered-quality claim. Acceptance
requires migration to the OpenSubsonic decision/token stream contract and proof of the
actual selected stream.

Bounded cache-ahead decision: **deferred.** The two-deck engine prepares one transition
deck in memory, but it does not implement current-plus-two persistent storage,
queue-revision cancellation across stored assets, eviction, logout cleanup, or failure
recovery. Settings and diagnostics describe the transition preload truthfully and do
not expose the latent offline-limit preference.

The acceptance contracts remain:

- Accepted lyrics must support synchronized, plain-text, unavailable, stale, manual-
  scroll, and reduced-motion states from a real service contract.
- Accepted delivered quality must report actual direct/transcoded source and signal
  path, not requested settings or container metadata alone.
- Accepted cache-ahead must cover current plus two upcoming tracks, bounded storage,
  cancellation after queue edits, eviction, logout, and failure without becoming an
  offline-download promise.
- Waveform, lyrics, artwork, and audio preparation must share queue-revision
  cancellation semantics so a rapid queue edit cannot publish stale next-track UI.
- Rejected capabilities stay absent from the release UI and their concept-only
  controls are documented as deferred.

### M8.5 - Product proof and release candidate

- Re-run the full functional matrix and close every Add row accepted into M8. Every
  deferred and prohibited row must remain absent.
- Record the five required daily-player tasks with pointer, keyboard, and VoiceOver.
- Complete compact, standard, wide, breakpoint, PWA, 200% text, long metadata,
  reduced-motion, reduced-transparency, increased-contrast, offline, and service-
  degraded visual comparisons.
- Run the real-library playback matrix, multi-hour listening session, 30-minute
  full-library Atlas session, WebGL context-loss recovery, and lifecycle tests on one
  exact commit.
- Build the Apple Silicon release candidate; sign, notarize, staple, verify with
  Gatekeeper, checksum, scan diagnostics, record the release channel, and execute the
  rollback drill.
- Product review compares the real packaged app—not fixture HTML alone—to every
  selected rendering and signs off on any intentional deviation.

## Pull-request order

Keep the work reviewable and make each PR leave the player more truthful:

1. transport state machine and restored-play recovery;
2. queue descriptor migration and cross-surface Play next/Add to queue;
3. queue mutation completion and accessibility;
4. continuation-setting separation and generated boundary;
5. pause-after-current primitive and bounded preparation;
6. transition decision contract plus corrected web policy;
7. native engine spike evidence and ADR;
8. accepted adapter integration and diagnostics;
9. complete AudioMuse population rendering and diagnostics;
10. Journey start/attachment and shared control parity;
11. Journey runway extension and truthful queue-end handling;
12. accepted P1 capability slices;
13. exact-head usability, audio, lifecycle, visual, accessibility, and release proof.

Every implementation PR must pass the full automated suite and Code Bot review.
Playback-affecting PRs also require a focused real-track recording; rendering PRs
require a same-state comparison against the selected reference at the pinned
viewport. M8 is not complete until the final exact-head audit passes.

## Immediate next action

Begin with the transport state machine and restored-play recovery. It is the
smallest vertical slice that directly improves daily playability, creates the event
vocabulary required by transition and Journey work, and gives later visual states a
truthful source. Queue actions follow immediately; Atlas polish does not move ahead
of those two slices.
