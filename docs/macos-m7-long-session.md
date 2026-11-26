# macOS M7 Long-Session Proof

M7 must prove that the packaged NaviMuse release candidate remains dependable
during a real listening session on the pinned Apple Silicon MacBook Air. This
proof covers runtime endurance and native lifecycle behavior that unit tests and
short browser runs cannot establish.

The long-session run must use one release candidate commit, one packaged app,
one BFF origin, and one target device. If the app, server, operating system, or
network changes during the run, record the change and restart the evidence window
or mark the run invalid.

## Required Setup

Record these details before playback starts:

- release candidate commit SHA and package version;
- signed app path and bundle identifier;
- macOS version, hardware model, architecture, and power source;
- BFF origin and whether the app is on LAN, Wi-Fi, or another network path;
- output device and initial volume;
- starting memory, energy, and process observations from Activity Monitor or an
  equivalent system tool;
- whether Sonic Atlas is active, degraded, or intentionally idle.

## Listening Run

Run at least one uninterrupted real listening session long enough to expose native
lifecycle problems. The default target is two hours; a shorter run needs an
explicit reason and cannot satisfy M7 exit unless accepted in the release record.

During the session, record timestamped observations for:

1. ordinary playback start, pause, resume, seek, skip, previous, and queue advance;
2. Sonic Atlas Journey visibility if active, including fallback behavior if the
   renderer or AudioMuse degrades;
3. memory growth, CPU, energy impact, fan or thermal state, and battery drain;
4. sleep and wake recovery with playback and session state noted before and after;
5. network loss and recovery, including whether playback, session, and service
   health messages remain truthful;
6. output-device changes such as built-in speakers, headphones, or AirPlay when
   available;
7. media-key and now-playing metadata behavior;
8. any app logs, console warnings, crash reports, or diagnostics generated during
   the run.

## Pass Criteria

The release candidate passes this item only when the recorded run proves:

- no app crash, unrecoverable blank surface, or forced relaunch is required;
- playback controls remain responsive after lifecycle events;
- queue position, current track, and Journey state remain truthful;
- memory and energy behavior do not show unexplained runaway growth;
- network and service failures degrade visibly without exposing credentials or
  private library metadata;
- sleep/wake and output-device changes do not leave playback or UI state stuck;
- any diagnostics bundle is redacted and attached only after review.

## Current Status

Status: prior long-session behavior accepted by product owner; current release
candidate spot-check recorded.

Existing automated tests cover queue, playback, Sonic Atlas fallback, and
diagnostic scaffolding.

On 2026-08-30, the signed and notarized release candidate at
`5325139e0234c8dd763fa9530d88e92c5740e7ef` was launched on the pinned MacBook
Air after Gatekeeper, stapling, and `codesign --verify --deep --strict` passed.
NaviMuse process `96378` stayed alive from `2026-08-30T15:13:34Z` through
`2026-08-30T15:38:53Z` across 24 one-minute samples before the operator accepted
existing prior two-hour evidence as representative and stopped the fresh timer.
The sample recorded AC power at 100%, no crash or sampler event rows, and RSS
settling from roughly 46 MB at launch to roughly 15-27 MB during steady state.

This 2026-08-30 sample is release-candidate stability evidence, not a replacement
claim that a new two-hour listening session was completed on this exact commit.
If M7 exit reviewers require fully fresh endurance evidence, rerun this contract
for the full window and attach the manual playback observations.
