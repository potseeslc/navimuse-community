# M8 Inventory and Frozen Product Contracts

- Status: active M8.0 baseline
- Baseline commit: `2b15f2607372a6d335fa539ed6c5928256826eee`
- Package: NaviMuse `0.2.0-preview.1`
- Captured: 2026-08-30
- Target: MacBook Air (`Mac14,2`), Apple M2, 8 GB, `arm64`
- OS: macOS 26.6.2 (`25G83`)
- Local tools: Node 26.7.0, npm 11.19.0, Rust/Cargo 1.88.0

This record starts M8 from the accepted M7 merge and freezes the behavior that the
redesign must preserve. It does not authorize a second queue, a client credential
boundary, invented Atlas semantics, or any capability listed as deferred.

## Selected design

Implementation follows the complete `design/finalists/c-cinematic-focus` set,
calibrated as **Midnight Broadcast + Chromatic Minimalism / Cinematic Focus**.
The generated controls and data are illustrative; production behavior wins.

The four revised `m8-*` references resolve earlier concept ambiguity:

- keep five primary destinations: Home, Library, Search, Sonic, Settings;
- keep Playlists inside Library and Discover/Journeys as Sonic modes;
- collapse the queue into a contextual inspector instead of reserving an empty rail;
- use one persistent bottom transport in compact and wide layouts;
- separate listener preferences from locked owner/service administration;
- use square artwork, stable neutral chrome, and restrained signal-orange adaptive accents.

Reference PNGs are pinned by their repository contents. The four revised anchors are:

| Reference | SHA-256 |
| --- | --- |
| `m8-library-editable-queue.png` | `998090c16f43c55c2c9754343806a9f82fd2a359e09aaf92f2ff0b1e03a521ff` |
| `m8-full-player-lyrics.png` | `5236db45d8771f35a1d31d62a4122be8db0873ae87898f57fe95283bc06314b9` |
| `m8-compact-playlist.png` | `027a373c88728aa76bac8f84515756824519e6bb1f502ebb704cae54c6588311` |
| `m8-settings-playback.png` | `48eecf9fcc03327dcdf2fe2a2c38dbf122440aab4f460e27cd77b20749359dea` |

## Capability ledger

| Area | Capability | Classification | M8 rule |
| --- | --- | --- | --- |
| Playback | one queue/current-index authority | preserve | UI and Atlas dispatch through `usePlayerQueueState` |
| Playback | two-deck preparation and current transition modes | preserve/harden | label only measured behavior; do not claim sample-accurate gapless |
| Playback | queue, cursor, position, shuffle/repeat, volume restoration | preserve | restore without autoplay |
| Playback | media keys and Now Playing metadata | preserve/harden | remain synchronized through lifecycle recovery |
| Playback | now-playing/scrobble reports | preserve/harden | retain idempotence and frozen thresholds below |
| Playback | source-aware queue identity | add | attach a display-safe descriptor to the same queue |
| Queue | inspect, select, played/upcoming visibility | preserve | keep stable item indices and shuffle history |
| Queue | play next, append, reorder, remove, clear, one-step undo | add | restrictions must name why an item cannot mutate |
| Queue | generated continuation boundary | add | mark the boundary inside the same queue |
| Queue | a second autoplay/radio/Journey queue | defer/prohibited | never implement |
| Home | continuation, recent, added, discovery entry points | preserve/redesign | prioritize resume and active queue context |
| Library | albums, artists, songs, playlists, pagination | preserve/redesign | dense table/shelf views; no nested-card dashboard |
| Search | debounce, grouping, cancellation, stale-result protection | preserve/redesign | library-first, sonic scope separately labeled |
| Playlists | create/update/delete and multi-track playback | preserve/redesign | remain Library-owned in the five-destination model |
| Sonic | discovery, radio, Atlas, Journey planning | preserve/redesign | modes within Sonic; real service truth only |
| Atlas | exact points, progressive LOD, camera modes, fallback | preserve/redesign | no invented geography, distance, streets, or branches |
| Journey | plan/start/skip/dislike/reroute/save/resume/repair | preserve/redesign | queue remains authority and ordered fallback stays complete |
| Session | current BFF/session and credential-free client boundary | preserve | no upstream secrets in the client |
| Session | payload normalization and recovery boundary | harden | defense in depth, not a claim of production blank-window failure |
| Auth | trusted-device rotation, local accounts, passkeys, recovery | add/gated | contract-first security workstream |
| Player | lyrics and delivered-quality truth | add/gated | ship only with real capability and degraded states |
| Player | bounded cache-ahead | add/gated | not offline downloads |
| Audio | ReplayGain, EQ, configurable crossfade, exclusive/bit-perfect output | defer | absent until a separate engine gate accepts each capability |
| Remote | casting | defer | no dead control |
| Mobile | native iOS/Android | defer | M9/M10 only; PWA remains operational |

## Frozen track interaction contract

Every track-bearing surface uses the ordered vocabulary exported from
`src/productInteractionContract.js`:

1. `Play now`
2. `Play next`
3. `Add to queue`
4. `Start radio`
5. `Start Journey`

Single click selects. Double-click or Return performs `Play now`. Space toggles
playback only when focus is outside an editable control. Hover controls, context
menus, keyboard menus, and VoiceOver actions expose the same order. A surface may
disable an unavailable action with a reason; it may not silently change its meaning.

`Play now` replaces the finite queue with the visible source and starts at the
activated item. `Play next` inserts after the current committed item. `Add to queue`
appends before any explicitly marked generated continuation. Neither additive action
interrupts the current item.

## Queue source descriptor v1

The source descriptor extends the existing queue; it is not another owner:

```text
QueueSourceDescriptorV1
  version: 1
  kind: album | playlist | search | radio | journey | artist | songs | ad-hoc
  id?: stable service or product identifier
  label: display-safe source name
  detail?: display-safe supporting identity
  generatedBoundary?: first generated-continuation index
```

Search query text is not persisted in `label` or `detail`; use a generic `Search
results` label and a server-safe result-set identity when available. Credentials,
provider tokens, private origins, raw Atlas identifiers, and mutable display-name-only
account mappings never enter the descriptor. Frozen Journey queue identity remains
owned by the existing Atlas transaction contract.

The implementation phase will evolve `navimuse.queue.v1` with an explicit migration
or a versioned successor. Existing valid v1 snapshots must restore without autoplay
and receive an `ad-hoc`/`Your queue` descriptor in memory. Invalid future versions
continue to fail closed rather than being partially interpreted.

## Playback reporting contract

- Send now-playing once after playback is confirmed for a track.
- Submit a scrobble after 50% of track duration or 240 listened seconds, whichever
  arrives first. Unknown/invalid duration requires 240 listened seconds.
- Listening progress is accumulated time, not the seek position.
- Each track lifecycle sends at most one successful now-playing and one successful
  submission report.
- Retry network failures, 408, 429, and 5xx with exponential backoff capped at 60 s.
- Do not retry terminal 4xx responses such as 401 without a new authenticated state.
- Seeking, relaunch, stale deck events, and reconnect must not duplicate a report.

## Visual foundation contract

M8.1 tokens will implement these semantics rather than copying arbitrary pixels:

- stable charcoal background and near-black elevated surfaces;
- warm off-white primary text and cool neutral secondary text;
- signal orange/coral for current playback, selection, focus support, and primary action;
- album-derived atmosphere remains local and contrast-clamped;
- 8 px spacing base with 4 px optical adjustments;
- repeated artwork/card radius no greater than 8 px; major surfaces remain unframed;
- compact macOS typography; large display type only for music identity moments;
- one persistent 96–120 px transport track, one navigation track, one flexible content
  track, and an optional contextual inspector track;
- no ordinary-action pills, glass panels, generic gradients, or decorative blur fields.

Motion uses Respond (80–140 ms), Rearrange (180–260 ms), Reveal (220–360 ms), and
bounded Breathe families. Reduced motion replaces transforms/continuous animation
with static state and opacity changes. Reduced transparency replaces translucent
surfaces with opaque semantic equivalents.

The executable token and contrast contract lives in `src/designSystem.js`. Its
structural charcoal, foreground, muted, signal-orange, focus, spacing, radius, motion,
and component-state values are stable inputs for M8.1. Artwork extraction may alter
only the validated palette fields; it may not replace the stable semantic chrome.

## Component state schema

Each redesigned component records the applicable states from this shared set:

`default`, `hover`, `focus-visible`, `active`, `selected`, `disabled-with-reason`,
`loading`, `success`, `empty`, `error`, `offline`, `locked`, `stale`,
`reduced-motion`, and `reduced-transparency`.

State changes never rely on color alone. Async containers own `aria-busy`; meaningful
status uses a non-chattering live region; modal/menu focus returns to the opener.

## Visual-regression viewports

The M8 baseline and redesigned shell are compared at:

| Class | Viewport | Purpose |
| --- | --- | --- |
| PWA phone | 390 x 844 @ 1x/3x | operational phone presentation, Atlas disabled |
| compact Mac | 744 x 900 @ 1x/2x | minimum deliberate desktop composition |
| breakpoint probes | 899/900/901 x 900 @ 1x/2x | expose the current abrupt transition |
| standard Mac | 1180 x 800 @ 1x/2x | daily laptop window |
| wide Mac | 1440 x 900 @ 1x/2x | optional useful inspector |
| design review | 1586 x 992 @ 1x | finalist-reference comparison |

M8.1 may replace the 900 px implementation breakpoint only after measuring content
minimums. Tests must retain widths immediately below, at, and above every accepted
breakpoint. An empty queue never reserves an inspector track.

## Baseline task evidence

The automated baseline at this commit covers queue restoration without autoplay,
multi-track album/search playback, queue selection, network/service degradation,
focus containment/restoration, playback reporting, and compact/wide geometry.

Credential-free visual baseline captures and the comparison rubric are pinned in
[`docs/evidence/m8/baseline`](evidence/m8/baseline/README.md). They confirm the two
highest-priority shell defects from the audit: the empty wide queue reserves space,
and the compact Mac layout falls into a floating vertical rail rather than a
deliberate native composition. The PWA remains recoverable and operational.

The following real-library recordings remain required before M8.2 surface signoff:

1. resume a prior session;
2. play an album from track three;
3. add a search result next;
4. remove a queue item and undo it;
5. lose and recover the network without losing playback/queue truth.

The baseline cannot honestly record tasks 3 and 4 until their M8 queue mutation
capabilities exist. They are explicitly marked `not-yet-implemented`, not passed.

The complete surface-by-surface acceptance ledger is maintained in
[`m8-functional-coverage-matrix.md`](m8-functional-coverage-matrix.md).
