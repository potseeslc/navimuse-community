# M8 Functional Coverage Matrix

- Baseline: `2b15f2607372a6d335fa539ed6c5928256826eee`
- Contract revision: M8.0 / 2026-08-30
- Status meanings: **preserve** is proven behavior; **harden** exists but needs M8
  proof; **add** is missing product scope; **gated** requires a separate accepted
  contract or evidence decision; **defer** must remain absent.

This matrix is the surface-level acceptance ledger for the redesign. A visual branch
cannot remove a preserve row, present an add row as implemented before it is real, or
turn a deferred capability into an enabled control.

## Shell, session, and global behavior

| Requirement | Status | Baseline evidence | M8 proof required |
| --- | --- | --- | --- |
| five primary destinations | preserve | `AppShell.jsx`, navigation tests | rendered compact/wide/PWA review |
| deep-linkable deterministic navigation | preserve | `navigationState.test.mjs` | focus restoration after every route |
| full-bleed overlay titlebar/traffic lights | harden | Tauri overlay config | packaged drag/double-click/fullscreen proof |
| compact and wide Mac layouts | harden | layout browser tests | useful-width probes around every breakpoint |
| PWA presentation remains operational | preserve | build/layout tests | signed-off phone and desktop PWA captures |
| empty queue consumes no wide track | add | baseline screenshot contradicts | screenshot and geometry assertion |
| application recovery boundary | add | none | thrown-surface recovery test; queue retained |
| BFF payload normalization | add | service adapters partly validate | malformed bootstrap matrix |
| returning-session silent restore | harden | session and queue restoration | no auth flash, no autoplay, last useful surface |
| first-run onboarding | add | none | interrupted/resumed owner/listener flows |
| trusted-device rotation/revocation | gated | none | security contract and replay/concurrency tests |
| local password/passkey/recovery modes | gated | none | accepted auth contract and threat-model suite |
| notifications/dialogs/menus/tooltips | harden | player/menu/dialog tests | component-state gallery plus keyboard/VO proof |

## Home and discovery

| Requirement | Status | Baseline evidence | M8 proof required |
| --- | --- | --- | --- |
| continue current/restored listening | preserve | Home/player integration tests | resume vs start-over task recording |
| recent and recently added shelves | preserve | Home surface tests | real-library loading/partial/empty states |
| smart playlist and radio entry points | preserve | discovery/radio tests | source-aware queue label and action parity |
| Artist Journey and AudioMuse entry points | preserve | Sonic radio/Journey tests | service-loss state without player interruption |
| Discover modes/results | preserve/redesign | Sonic surface and discovery tests | finalist-aligned composition and task proof |
| analysis/playable result distinction | harden | service messages | explicit playable/exploratory/unavailable states |
| missing artwork | harden | fallback artwork tests/layout | deterministic neutral artwork/palette capture |

## Library, playlists, and search

| Requirement | Status | Baseline evidence | M8 proof required |
| --- | --- | --- | --- |
| albums/artists/songs/playlists/radios | preserve | library/client/playlist tests | grid, cover-list, compact-list views |
| Music/Live Archive switching | preserve | scoped library tests | stable selection and queue source |
| pagination and large results | preserve | pagination/browser tests | performance and focus under real large library |
| album multi-track queue at selected item | preserve | player integration | album-from-track-three task |
| consistent track action vocabulary | add/frozen | `productInteractionContract.test.mjs` | same ordered actions on every track surface |
| favorite/rating optimistic reconciliation | harden | player feedback tests | named failure and rollback without audio stop |
| playlist create/update/delete | preserve | playlist tests | busy/conflict/empty/destructive states |
| playlist track reorder | add/service-gated | no complete UI | capability-specific behavior and error proof |
| debounced grouped search | preserve | search/client tests | keyboard result traversal and cancellation |
| stale search protection | preserve | discovery tests | rendered stale-request race proof |
| separately labeled sonic search | harden | Sonic entry points | task review and non-playable distinction |

## Player and authoritative queue

| Requirement | Status | Baseline evidence | M8 proof required |
| --- | --- | --- | --- |
| one queue/current-index authority | preserve/invariant | queue/Atlas transaction tests | no second owner in final audit |
| queue/cursor/position persistence | preserve | queue store/player tests | relaunch with source descriptor and no autoplay |
| local-plus-server queue recovery | add | local snapshot and OpenSubsonic endpoints exist separately | mutation/checkpoint save, paused restore, server failure fallback, missing-track repair |
| shuffle pool/history and deterministic Previous | preserve | player state tests | real-session task proof |
| repeat and continuous in-queue advance | preserve | player state/integration tests | boundary/lifecycle proof |
| two-deck preparation and transition safety | preserve/harden | queue-revision decision/event contract, deterministic policy fixtures, live truthful diagnostics | captured web boundary/fade measurements and engine gate |
| Media Session commands/metadata | preserve | media session tests | packaged media-key synchronization |
| idempotent playback reporting | preserve/frozen | playback report tests | real seek/relaunch/reconnect proof |
| persistent mini and full player | preserve/redesign | player/layout tests | stable bottom transport at all viewports |
| waveform plus progress fallback | preserve | player/discovery tests | loading/missing-analysis state captures |
| source-aware queue descriptor | add/frozen | contract tests | persistence migration and surface labels |
| Play next/Add to queue | add | missing | mutation tests and cross-surface action parity |
| reorder/remove/clear/undo | add | missing | keyboard/pointer/VO mutation tasks |
| played/playing/up-next sections | harden | queue overlay | explicit labels under shuffle and continuation |
| generated continuation boundary | add/frozen | descriptor contract | visible and reversible within same queue |
| pause after current | preserve | queue and full-player actions, persisted queue control, shared transport state | automated natural-end/manual-skip/repeat/edit/relaunch/cancel proof; packaged listening capture remains |
| lyrics | accepted P1 | authenticated library contract, synchronized follow, plain text, unavailable, stale-request cancellation, manual-scroll escape, reduced motion, Queue/Lyrics inspector | live provider coverage and packaged compact/wide listening capture |
| delivered quality | deferred P1 | player labels source metadata and requested preference without claiming delivery | migrate to decision/token playback, then prove actual direct/transcoded signal path |
| bounded cache-ahead | deferred P1 | one transition deck is prepared without persistent-storage or offline claims | current plus next two; revision cancellation; storage/eviction/logout/failure lifecycle contract |
| ReplayGain/EQ/configurable crossfade | defer | not implemented | remain absent unless engine gate accepts |
| casting | defer | not implemented | no placeholder control |

## Sonic Atlas and Journeys

| Requirement | Status | Baseline evidence | M8 proof required |
| --- | --- | --- | --- |
| real full-library topology and population | add/harden | full manifest is preserved, but M8.3 Overview LOD draws at most 8,192 sampled points | rendered unique-point count equals the live manifest count; real 92K–96K capture and topology comparison |
| exact-point selection and tile identity | preserve | renderer/client contract tests | visible hit-test proof at supported DPRs |
| Follow/Overview/Explore | preserve | camera tests | interruptible interaction and reduced motion |
| progressive LOD with pinned overlays | preserve | LOD/renderer tests | no selection/current/destination loss |
| ordered keyboard/screen-reader fallback | preserve | fallback/overview tests | complete task parity in packaged app |
| plan/start/skip/dislike/reroute | preserve | controller/Journey tests | task recording and visual state audit |
| save/resume/revalidate/repair/complete | preserve | Journey persistence tests | real-service lifecycle proof |
| Journey survives ordinary playback advance | preserve | controller/transaction tests | rendered continuity and camera proof |
| renderer/context loss preserves playback | preserve/harden | M7 trigger and isolation tests | packaged context-loss session |
| density-aware point treatment/palette field | gated | not in v1 contract | accepted renderer style contract/lab evidence |
| invented map streets/distance/branches | prohibited | contract rejection tests | absent from UI/copy/render audit |

## Settings and service administration

| Requirement | Status | Baseline evidence | M8 proof required |
| --- | --- | --- | --- |
| secure settings session | preserve | server/settings tests | locked/expiry/reconnect states |
| Navidrome/AudioMuse endpoints and health | preserve | service/server tests | owner-only section and partial failure |
| listener vs owner administration split | add | current long surface | task review and locked owner boundary |
| playback/appearance/library/discovery/storage groups | add/redesign | settings fields exist | stable subsection navigation/search |
| streaming preference truth | harden | app settings/service tests | defined boundary and actual delivered label |
| gapless capability copy | harden | Settings reports web prepared handoff and unverified authored gapless; authored pairs use a standard boundary | replace only after captured adapter evidence |
| privacy/diagnostics/reset states | preserve/redesign | M7 diagnostics tests/docs | explicit destructive/recovery proof |
| automatic downstream identity bootstrap | gated | absent | Navidrome mapping/AudioMuse threat-model suite |

## Cross-cutting quality

| Requirement | Status | Baseline evidence | M8 proof required |
| --- | --- | --- | --- |
| finalist-image visual direction | add | only concept assets/baselines | matching viewport comparisons every surface |
| deterministic contrast-safe palette | add/frozen | token tests | real artwork extraction/cache/latency tests |
| component state system | add/frozen | state vocabulary tests | internal gallery and per-component matrix |
| reduced motion | harden | media query/tests | complete static equivalents |
| reduced transparency/increased contrast | add | incomplete | opaque/contrast variants and screenshots |
| 200% text zoom and long metadata | harden | long-title tests | full surface matrix |
| VoiceOver/keyboard parity | harden | automated landmarks/focus tests | live packaged task pass |
| no ordinary playback dependency on Sonic | preserve/invariant | failure-isolation tests | real service-loss session |
| signed/notarized distribution candidate | gated M8.5 | earlier M7 evidence | exact final-head proof |
| long-session battery/memory/thermal | gated M8.5 | accepted M7 samples | exact final-head sessions |

## Required usability recordings

| Task | Baseline state | M8.2/M8.5 target |
| --- | --- | --- |
| resume a prior session | implemented; automation coverage | pointer, keyboard, VoiceOver; no autoplay/auth flash |
| play album from track three | implemented internally | obvious source label; no one-track collapse |
| add a search result next | missing | additive, current audio uninterrupted, announced |
| repair accidental removal | missing | one-step undo restores exact position/source |
| recover network interruption | partially automated | truthful states; queue/player/session preserved |

The matrix is complete only when every add/gated row accepted into M8 has direct
evidence on one exact release commit and every prohibited/deferred row remains absent.
