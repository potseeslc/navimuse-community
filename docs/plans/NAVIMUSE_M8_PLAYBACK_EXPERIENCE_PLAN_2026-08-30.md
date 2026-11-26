# NaviMuse M8 Playback Experience Plan

Date: 2026-08-30  
Status: proposed M8 subplan  
Parent: `NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md`
Program: `NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md`

## Purpose

M8 must make NaviMuse dependable as a daily music player, not only visually
coherent. This plan defines continuous playback, authored gapless album playback,
Journey transitions, loudness handling, recovery, controls, and proof requirements.

The queue and current queue position remain the single product authority. A native
or web audio engine is a transport adapter beneath that authority. It may pre-roll
one committed next item, but it must not own a second user-visible queue or invent
Journey stops.

Sonic Atlas is another view of that same authority. An active map remains attached
to its persisted Journey identity while playback advances or skips; it updates stop
state and camera intent from canonical queue events instead of clearing on a change
to `nowPlaying.id`. Map transport and queue actions dispatch through the shared
player, and renderer failure never changes playback.

Ordinary Navidrome playback must survive AudioMuse, Sonic Atlas, analysis, renderer,
and Journey-planner failure.

ReplayGain, configurable crossfade, exclusive output, and native-engine behavior in
this subplan are candidate capabilities until the M8 engine gate accepts them. The
parent product plan controls M8 scope; rejected capabilities remain absent from the
UI rather than becoming inert settings.

## Current baseline and gaps

The production client already has useful foundations:

- two `HTMLAudioElement` decks;
- a shared Web Audio graph with per-deck and master gain;
- a 30-second standby preload and silent pre-heat path;
- equal-power gain curves scheduled on the audio clock where Web Audio is available;
- `hard`, `gapless`, and `sweet-fade` transition modes;
- a two-second default sweet fade for Journey and Artist DJ sessions;
- queue persistence, continuous in-queue advance, playback reports, and stale-event
  suppression;
- regression coverage for a previously pre-heated next track starting partway in.

The current behavior is not yet a complete playback product:

- the so-called gapless path promotes a separate media element after the outgoing
  element reports `ended`; this is preloaded continuity, not proven sample-accurate
  gapless playback;
- `playback.gapless` is stored in preferences, but the current `main.jsx` call to
  `transitionModeFor()` passes session, shuffle, repeat, and track data without that
  preference, so it does not select the transition mode;
- `playback.replayGain` is stored but is not applied to the output graph;
- `continuousQueue` means automatic advance inside the existing queue; it does not
  define autoplay or extend a Journey runway;
- transition selection does not inspect sequential album position, disc boundary,
  direct-play versus transcode, decoder format, network readiness, ReplayGain data,
  leading/trailing silence, or an explicit user override;
- shuffle and repeat force a hard transition even when a safe preloaded transition
  could be possible;
- live streams and unknown-duration tracks share insufficiently explicit fallback
  behavior;
- there is no surfaced transition status, buffer health, signal path, or reason for
  a degraded handoff.

M8 must describe each level honestly: `Gapless`, `Smart Blend`, `Crossfade`, or
`Standard transition`. A short overlap that hides a browser gap must not be labeled
true gapless.

## Product behavior

### M8 playback feature coverage

The transition engine is only one part of daily-player quality. M8 playback scope
also includes:

- exact queue save/restore with current item, position, shuffle order, repeat mode,
  Journey attachment, and generated-continuation boundary;
- Play next, Add to queue, Play last, reorder, remove, clear upcoming, and clear
  played without interrupting the current item;
- Pause after current, Stop after queue, and a sleep timer supporting elapsed time,
  end of track, and end of queue with a bounded final fade;
- explicit autoplay control in the queue surface, not only a buried preference;
- current plus two-upcoming network/cache preparation with cancellation after queue
  edits and a configurable storage ceiling;
- waveform seek with a normal progress-rail fallback and no waveform dependency for
  playback;
- playback reports, now-playing/scrobble timing, favorite, rating, lyrics, media
  keys, system now-playing metadata, and remote-command consistency through every
  automatic transition;
- internet-radio ICY metadata, reconnect policy, and an explicit no-gapless/no-seek
  capability state;
- output-device selection, output-change recovery, and release of any exclusive
  device while paused;
- direct-play/transcode selection by network policy and an honest warning when a
  transcode path cannot preserve ReplayGain or gapless metadata;
- accessible transition, buffering, queue-end, Journey-extension, and degraded
  playback status without constant visual motion.

Equalizer, crossfeed, spatial effects, tempo matching, beat matching, and automatic
silence trimming are not required for M8 completion. They must not delay gapless,
continuous-play, loudness, lifecycle, and queue correctness. The transition contract
leaves room for later analysis without promising an AutoMix product in M8.

### Listening contexts

Every adjacent queue pair receives an immutable transition decision when it enters
the committed playback runway. The decision is recalculated only after an explicit
queue edit, skip, seek into the transition window, setting change, output change, or
recovery event.

#### Sequential album playback

- Consecutive tracks on the same album and disc use authored gapless playback.
- The engine preserves encoded silence, ambience, applause, and intentional pauses;
  it does not trim or overlap album tracks by default.
- A disc boundary uses the same no-overlap policy unless the user explicitly starts
  another context.
- Album ReplayGain is used across the album so track-to-track dynamics remain intact.
- If the active engine or stream cannot prove a gapless handoff, it uses the least
  destructive standard transition and records the degraded reason. It does not
  silently apply a multi-second crossfade to conceal the limitation.

#### Journey, Artist DJ, radio, and mixed-source playback

- The default is `Smart Blend`, not a fixed fade applied blindly to every pair.
- M8 Smart Blend uses deterministic metadata and playback readiness. AudioMuse
  enrichment is optional and must never be required for the next track to play.
- The initial blend window is configurable from 1 to 12 seconds, with a restrained
  default of 4 seconds and an equal-power curve.
- The planner shortens the blend for cold endings, short tracks, spoken material,
  sequential same-album pairs, insufficient buffered media, and tracks with unknown
  duration.
- The planner may skip material only when a future accepted contract supplies
  explicit leading/trailing-silence or mix-point analysis and the user enables it.
  M8 must not infer destructive seek points from Sonic Atlas coordinates.
- Track ReplayGain is used for mixed-track contexts. Peak data and output headroom
  prevent clipping during overlap.
- If analysis is absent, the transition falls back to a normal metadata-driven
  equal-power crossfade. If the next track is not ready, it falls back to a standard
  transition rather than stalling or replaying the outgoing track.

#### Playlists and ad hoc queues

- `Smart` follows album continuity for adjacent sequential same-album tracks and
  Smart Blend for unrelated tracks.
- Users may choose `Preserve tracks` to disable overlap or `Crossfade` for a fixed
  1-to-12-second blend.
- Reordering, removing, or replacing the next entry invalidates only its prepared
  transition and does not interrupt the current track.

#### Manual actions

- Manual Next uses a short click-safe fade-out/fade-in, not the full automatic blend.
- Previous follows the existing queue-history contract and starts at the requested
  track boundary.
- Seeking into or out of a transition window cancels the prepared transition,
  restores one audible deck, and prepares again from the new position.
- Pause during overlap atomically pauses both transport decks. Resume restores one
  coherent current item and never resumes two audible tracks.
- Repeat One never preloads or starts another track. Repeat All may preload the first
  queue item only after the last-to-first transition is committed.

### Continuous play and Journey runway

M8 separates three settings that are currently conflated:

1. **Continue through queue** advances through already committed entries.
2. **Extend Journeys automatically** requests and atomically appends another bounded
   Journey segment before the playback runway is exhausted.
3. **Autoplay after queue** creates a clearly labeled radio continuation after a
   non-Journey queue ends.

For an active Journey:

- the authoritative queue contains the current bounded runway, not tens of thousands
  of speculative future items;
- extension begins at a configurable runway threshold based on remaining playable
  duration and at least two upcoming resolved stops, rather than a UI timer alone;
- the Journey controller freezes the existing prefix and atomically appends the
  accepted segment under the existing versioned Journey contracts;
- a failed or slow extension never blocks already buffered tracks;
- if extension remains unavailable at the final committed stop, NaviMuse completes
  the Journey honestly and offers Retry, Change destination, Continue similar music,
  or Stop;
- detach, reroute, and queue editing retain their existing truthful-state rules;
- no transition analysis service may mutate the Journey route or queue order.

For normal queues, autoplay is off by default until product testing accepts its
placement and language. Enabling it must show where the original queue ends and the
generated continuation begins.

## Transition decision contract

The domain layer should produce a serializable decision resembling:

```text
TransitionDecision
  pair: outgoing queueItemId -> incoming queueItemId
  queueRevision
  context: album | playlist | journey | artist-dj | radio | manual
  mode: authored-gapless | smart-blend | fixed-crossfade | standard
  durationMs
  curve: equal-power | linear
  incomingOffsetMs
  outgoingGainDb
  incomingGainDb
  peakLimited
  requiredReadiness
  reasonCode
  degradedFrom
```

`incomingOffsetMs` remains zero throughout initial M8. Non-zero offsets require a
separate accepted analysis contract and user-facing control because they alter the
recorded work.

The engine reports preparation and outcome events against the same queue revision:
`requested`, `buffering`, `ready`, `started`, `completed`, `cancelled`, and
`degraded`. Late events from an obsolete revision are ignored.

## Loudness and signal integrity

- Read OpenSubsonic `replayGain` values when the connected server exposes them.
- Support `Off`, `Automatic`, `Album`, and `Track` modes. `Automatic` selects Album
  for sequential album playback and Track for mixed contexts.
- Apply base gain plus the selected album/track gain once in the authoritative output
  graph; do not apply it independently in both deck and master gain paths.
- Use peak metadata to reduce preamp gain and prevent clipping. When peak metadata is
  absent, preserve conservative overlap headroom and expose that fact in diagnostics.
- Do not advertise bit-perfect playback while ReplayGain, crossfade, EQ, resampling,
  or any other DSP is active.
- Preserve one master-volume path across transitions, media keys, mute, output-device
  changes, and restoration.

## Playback settings

The primary Playback settings available before the engine gate should remain
understandable:

- Gapless albums: enabled by default;
- Continue through queue: enabled by default;
- Extend Journeys automatically: enabled by default for an active Journey;
- Autoplay after queue: disabled by default;

Only after the engine gate accepts the corresponding capabilities may primary
settings add:

- Transitions: `Smart`, `Preserve tracks`, or `Crossfade`;
- Crossfade length when applicable: 1 to 12 seconds;
- Loudness: `Automatic`, `Album`, `Track`, or `Off`;
- Prevent clipping: enabled by default.

Advanced settings may expose streaming quality, preload policy, output device,
exclusive/bit-perfect mode only if proven, and a `Signal path` inspector. Settings
must state when combinations are mutually exclusive; for example, fixed crossfade
and bit-perfect output cannot both be active.

The Signal path inspector should show source format and bitrate, direct play or
transcode, decoder/engine, sample rate and channels when known, ReplayGain mode and
applied gain, transition mode, DSP, output route, buffer health, and any degradation
reason. It is diagnostic truth, not decorative technical text.

## Engine architecture gate

M8 must not choose an engine from reputation alone. Build the same transition
contract against measured candidates:

### Candidate A: current WebView dual-deck engine

- remains the PWA baseline and rollback path;
- lowest migration cost and already supports useful equal-power fades;
- cannot be called sample-accurate gapless until capture evidence proves it;
- media-element event timing, decoder padding, background behavior, and network
  buffering remain browser/WebView dependent.

### Candidate B: Web Audio decoded-buffer engine

- can schedule `AudioBufferSourceNode.start(when)` on the audio clock;
- can produce precise boundaries for fully decoded, supported media;
- full-file fetch/decode increases memory, startup time, and data use, and Web Audio
  background behavior conflicts with the operational PWA requirement;
- may be retained as a test/reference implementation, not assumed as the product
  answer.

### Candidate C: macOS native playback adapter

- evaluate an in-process Tauri platform adapter using Apple media frameworks,
  libmpv, and a second proven native pipeline such as GStreamer `playbin3`;
- the adapter receives only the current item plus one committed next item and emits
  transport events; JavaScript remains queue and Journey authority;
- compare codec coverage, remote authenticated streams, transcoding, gapless
  continuity, crossfade/DSP needs, media keys, output changes, sleep/wake, packaging,
  notarization, memory, energy, and maintainability;
- adding the adapter does not authorize a BFF rewrite, Node sidecar, or client-held
  service credentials;
- land the selected boundary in an ADR before replacing the production transport.

The macOS release should use the native candidate only if it materially improves
captured boundaries and lifecycle reliability without violating the existing trust
and queue contracts. The PWA continues with a capability-labeled web adapter.

## Open-source client findings

### Supersonic

Supersonic is the closest direct desktop/Navidrome comparison reviewed for this plan.
Its Go playback layer delegates decoding and continuity to libmpv. It configures
`gapless-audio=weak` and `prefetch-playlist=yes`, appends one next URL to MPV's own
playlist roughly ten seconds before the current track ends, and separately caches the
current plus two upcoming tracks. The important lesson is that the decoder/output
pipeline, not a UI `ended` callback, owns the album boundary.

Supersonic also demonstrates:

- an engine-independent player interface beneath one application play queue;
- replacement of MPV's single prepared next item whenever the authoritative queue
  changes;
- ReplayGain `None`, `Album`, `Track`, and `Auto`, where the playback origin selects
  Album for album/discography contexts and Track for playlists, radios, shuffled
  selections, and individual tracks;
- ReplayGain preamp and clipping prevention;
- local output selection, exclusive mode, and releasing exclusive output while
  paused;
- direct/raw versus requested Opus/MP3 transcoding controls;
- Pause after current, saved queue state, waveform pre-generation, scrobbling, and
  radio metadata;
- autoplay as separate queue-extension logic: near the final track it tries similar
  artist tracks, then genre, then random, filtering recently played and user-rejected
  material.

NaviMuse should adopt the prepared-next replacement contract, current-plus-two cache
runway, origin-aware ReplayGain, and separation of autoplay from transport. It should
not copy Supersonic's ten-second-only autoplay trigger: a bounded Journey needs a
duration-aware runway and enough time for route resolution. Supersonic does not
provide the crossfade/Smart Blend behavior required by Journeys.

### Strawberry

Strawberry uses GStreamer `playbin`/`playbin3`. Its no-crossfade path queues the next
URI into the same pipeline for gapless playback. Crossfade uses overlapping pipelines,
and automatic same-album transitions can explicitly bypass crossfade. NaviMuse should
retain this separation between one-pipeline album continuity and controlled overlap
for unrelated tracks.

### Feishin

Feishin exposes native MPV and web playback backends. This supports capability-based
adapters: the native app can promise stronger continuity than the web/PWA without
forking queue semantics or hiding the weaker web guarantee.

### Firmium

Firmium's desktop player decodes with Symphonia, outputs through CPAL, and mixes
per-track sessions. Its queue manager decides when to preload or crossfade; the audio
engine performs the transition. Crossfade and gapless are mutually exclusive global
settings, with configurable 1-to-12-second and linear/equal-power fades.

NaviMuse should adopt the queue-decision-versus-engine-execution boundary and include
Symphonia/CPAL only if it survives the same macOS evidence comparison. It should not
copy a global mutual-exclusion model: an album followed by a Journey can require
authored gapless and Smart Blend decisions in the same queue. Firmium's own source
notes that desktop crossfade gain handling has differed from normal ReplayGain, which
reinforces the requirement to verify the actual mixed output rather than settings.

### Amperfy

Amperfy places autoplay as an explicit infinity action in the upcoming-queue surface
and keeps a separate persistent autoplay preference. It also parses OpenSubsonic
album/track ReplayGain and peak values. NaviMuse should similarly expose generated
continuation at the queue boundary and make it reversible without conflating it with
ordinary next-track advance.

### MPD and MixRamp

MPD provides fixed crossfade plus MixRamp, which uses measured start/end loudness to
choose a blend point when both tracks and the output format are compatible. This is a
valuable future model, but NaviMuse M8 should not claim equivalent intelligence until
it owns accepted mix-point/loudness analysis and captured transition evidence.

## Adopted M8 playback model

The combined findings produce a three-layer model:

1. **Queue/Journey authority:** owns order, history, context, generated boundaries,
   and immutable pair decisions.
2. **Transition policy:** selects authored gapless, Smart Blend, fixed crossfade, or
   standard handoff from context, capabilities, settings, readiness, and loudness.
3. **Transport adapter:** prepares at most the committed runway, executes the chosen
   decision, and reports revision-keyed events without owning product order.

This is intentionally stronger than copying any single client. Supersonic supplies
the native queued-gapless pattern, Strawberry supplies the same-album exception,
Firmium supplies the multi-session crossfade boundary, Amperfy supplies visible
autoplay ownership, and MPD supplies a future loudness-aware direction.

## Verification matrix

Create deterministic fixtures and real-library cases for:

- a continuous PCM source split into adjacent FLAC, ALAC, MP3, AAC, and Opus tracks;
- native/direct streams and every supported Navidrome transcode target;
- sequential album, disc boundary, unrelated playlist pair, Journey pair, very short
  track, spoken track, live stream, unknown duration, and corrupted next stream;
- differing sample rate, bit depth, channel layout, ReplayGain, and peak metadata;
- local network, constrained network, mid-preload loss, BFF session rotation, server
  restart, sleep/wake, output-device switch, Bluetooth, and AirPlay where supported;
- pause, seek, Next, Previous, repeat, shuffle, reorder, remove-next, clear queue,
  reroute, detach, and Journey extension during preparation and overlap;
- reduced power, background/hidden window, and a multi-hour listening session.

Capture output through a controlled loopback path and compare it to the fixture. Do
not accept a visual event log as gapless evidence. Record inserted silence, dropped or
duplicated samples, boundary discontinuity, transition start error, gain envelope,
clipping, next-track start offset, buffering, CPU, memory, energy, and recovery time.

Native authored-gapless acceptance requires no inserted silence or duplicated audio
beyond the selected engine's documented output-buffer tolerance, no click at a
continuous fixture boundary, and repeated success across every required direct-play
format. Crossfade acceptance requires the selected curve and duration to remain
within the pinned timing tolerance, no clipping, and incoming playback beginning at
zero. PWA limitations must be measured and labeled rather than hidden.

## Delivery sequence

These playback phases refine, rather than compete with, the parent M8 sequence:

| Playback phase | Parent phase | Ownership |
| --- | --- | --- |
| M8-PB.0 | M8.0 | Playback contracts, fixtures, and pinned evidence environment |
| M8-PB.1 | M8.1 | Web baseline corrections that do not depend on gated capabilities |
| M8-PB.2 | M8.2 | Native engine evidence and acceptance decision |
| M8-PB.3 | M8.2 | Integration of only the capabilities accepted by the gate |
| M8-PB.4 | M8.5 | Playback release proof within the product-wide verification pass |

### M8-PB.0 - Contract and evidence fixtures

- freeze transition, capability, event, and signal-path contracts;
- add current-behavior tests proving which preferences are and are not wired;
- create codec, silence, loudness, peak, and boundary fixtures;
- pin the MacBook Air, macOS, WebView, Navidrome, BFF, formats, and output route.

### M8-PB.1 - Correct the web baseline

- make already-supported settings drive existing transition decisions and remove
  inert capability claims;
- add same-album/sequential metadata and explicit context policy;
- separate continue, Journey extension, and autoplay behavior;
- harden cancellation, readiness, failure, and diagnostic events;
- retain the dual-deck engine as the tested PWA adapter.

### M8-PB.2 - Native engine spike and ADR

- implement identical fixture playback through shortlisted native adapters;
- capture and compare boundary, lifecycle, resource, and packaging evidence;
- accept one adapter or record why the web engine remains the macOS release choice;
- publish the queue/transport boundary before production integration.

### M8-PB.3 - Product integration

- integrate the accepted adapter behind the same playback authority;
- add Playback settings, Signal path, degradation messages, and transition status
  only for accepted capabilities;
- if accepted by the engine gate, apply ReplayGain once with clipping protection and
  implement user-configurable crossfade; otherwise keep those controls absent;
- connect Journey runway extension without making AudioMuse a playback dependency;
- migrate persisted settings with conservative defaults.

### M8-PB.4 - Release proof

- run the complete transition, failure, accessibility, lifecycle, and long-session
  matrix on one exact commit;
- prove ordinary album playback with AudioMuse and Atlas unavailable;
- prove a long Journey continues through successful extensions and ends truthfully
  when extension fails;
- retain rollback to the web adapter without queue or settings loss.

## Exit criteria

- Sequential same-album playback preserves authored boundaries under the accepted
  native capability and never receives an automatic multi-second crossfade.
- Journey and mixed-context transitions use a deterministic, inspectable Smart Blend
  with safe fallback and no non-zero incoming seek.
- Continue queue, Journey extension, and autoplay are distinct, tested behaviors.
- Sonic Atlas exposes playback-control parity and preserves the active Journey across
  advance, skip, transition, seek, pause, navigation, and renderer recovery without a
  second player or queue.
- If accepted into M8 by the engine gate, ReplayGain Automatic/Album/Track/Off and
  clipping prevention affect real output as documented; otherwise the product makes
  no ReplayGain capability claim.
- No transition starts the next track partway through, duplicates a queue event,
  loses playback reports, or diverges Atlas/Journey state.
- Renderer, AudioMuse, transition-analysis, and network failures do not stop already
  playable ordinary Navidrome audio.
- Native and PWA capability differences are visible and supported rather than hidden
  behind the same claim.
- Captured audio evidence, lifecycle evidence, tests, and the production build pass
  on one pinned release candidate.

## Research references

- MPD crossfade and MixRamp:
  <https://github.com/MusicPlayerDaemon/MPD/blob/master/doc/user.rst>
- Strawberry GStreamer engine and same-album crossfade policy:
  <https://github.com/strawberrymusicplayer/strawberry/tree/master/src/engine>
- GStreamer gapless playback design:
  <https://gstreamer.freedesktop.org/documentation/additional/design/playback-gapless.html>
- Feishin web/MPV playback backends:
  <https://github.com/jeffvli/feishin>
- Supersonic libmpv playback, queue prefetch, ReplayGain, and autoplay:
  <https://github.com/dweymouth/supersonic>
- Navidrome open-source client catalog:
  <https://www.navidrome.org/apps/?oss=true>
- Firmium native desktop gapless/crossfade engine:
  <https://github.com/fossisawesome/firmium>
- Amperfy queue/autoplay and ReplayGain implementation:
  <https://github.com/BLeeEZ/amperfy>
- Gapless-5 Web Audio and HTML media tradeoffs:
  <https://github.com/regosen/Gapless-5>
- Web Audio scheduled buffer start:
  <https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start>
- OpenSubsonic ReplayGain response:
  <https://opensubsonic.netlify.app/docs/responses/replaygain/>
