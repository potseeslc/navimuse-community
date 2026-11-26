---
title: "NaviMuse macOS Tauri Master Plan"
tags: [navimuse, macos, tauri, sonic-atlas, product, architecture]
status: active
created: 2026-08-21
---

# Decision

2026-09-08 amendment: [ADR-003](../decisions/ADR-003-IOS-TESTFLIGHT-PILOT.md)
authorizes an early iOS TestFlight comparison pilot using the current live app.
This does not complete M8 or bring forward the full M9 release scope.

NaviMuse will become a macOS-first Tauri application. The first supported and
validation platform is Apple Silicon macOS on the owner's MacBook Air, targeting
`aarch64-apple-darwin`. The existing PWA remains operational during the transition
and remains the phone-access path until a separate mobile decision is recorded.

Sonic Atlas is NaviMuse's flagship music-discovery and Journey experience. It is
not a separate product, a second player, or a technical visualization beside the
app. NaviMuse must first become a dependable daily music application, then integrate
Sonic Atlas through the same playback and queue authority.

# Repository authority

This repository owns the production NaviMuse application, Tauri shell, frontend,
BFF, playback, queue, Journey integration, packaging, and release work.

The sibling `navimuse-sonic-atlas-lab` repository owns concept validation and
evidence. Its integrated blueprint remains authoritative for map, route, renderer,
and AudioMuse architecture:

- `plans/NAVIMUSE_SONIC_ATLAS_INTEGRATED_BLUEPRINT_2026-08-17.md`

Apply these rules when the programs interact:

1. Do not weaken or bypass a Sonic Atlas evidence gate to accelerate this app.
2. Do not block daily-player or Tauri foundation work on unfinished Atlas research.
3. Promote only accepted contracts and independently tested implementation, not lab
   demo shells or synthetic fixture assumptions.
4. Record a new ADR before changing either repository's product contract.

# Pinned starting state

Planning audit performed on 2026-08-21:

- NaviMuse package: `0.2.0-preview.1`.
- Starting production head: `e7ed4bd`.
- Runtime: React 19/Vite PWA with a Node BFF; no Tauri or Rust application layer.
- `src/main.jsx` exceeded 5,200 lines at the audited head.
- `server.mjs` was 2,567 lines at the audited head.
- Verification: 348 tests passed and `vite build` completed at the audited head.
- Sonic Atlas lab baseline reviewed: `2c18b16`.

These pins describe the audit rather than evergreen truth. Every branch must record
the exact heads, services, dependencies, OS, and hardware it actually verifies.

# Product contract

NaviMuse is one coherent music application with five primary surfaces:

1. **Home** resumes listening and presents relevant library and Journey entry points.
2. **Sonic Atlas** discovers music and hosts destination or exploratory Journeys.
3. **Library** provides efficient album, artist, song, playlist, and collection work.
4. **Search** searches the playable library first and sonic capabilities second.
5. **Settings** manages services, playback, appearance, storage, privacy, and health.

The player persists across every surface. Ordinary Navidrome playback remains fully
usable when AudioMuse, Atlas data, the renderer, or the network is unavailable.

The first native release must feel designed for macOS rather than like a phone frame
inside a desktop window. It must support pointer and keyboard use, window resizing,
native media controls, sleep/wake, output-device changes, reduced motion, and clear
degraded states.

# Target architecture

```text
NaviMuse Tauri client
  React application UI
  playback, queue, and Journey domain
  Web Audio engine
  Tauri capabilities: window, keychain, updater, deep links, media integration
                    |
                    | authenticated HTTPS
                    v
NaviMuse BFF
  identity and sessions
  Navidrome normalization and media proxy
  AudioMuse proxy and item resolution
  settings and service health
  future Journey persistence and Atlas contracts
                    |
                    v
Navidrome + AudioMuse
```

The Node BFF remains the service and credential boundary during the first Tauri
migration. Do not port it wholesale to Rust or embed it as a sidecar without a later
ADR backed by a measured need. The initial native client must not receive long-lived
Navidrome or AudioMuse service credentials.

Use Tauri v2, but pin exact Tauri CLI, JavaScript packages, Rust toolchain, macOS
SDK, and deployment target in the implementation spike rather than guessing here.

# State ownership

NaviMuse has one playback authority:

- The audio queue and current queue position are the source of playback truth.
- Journey intent, route history, and future route metadata extend that authority;
  they do not replace it.
- Sonic Atlas reads current, played, and upcoming stops from the same transitions
  used by audio playback.
- Route planning may maintain a bounded playback runway, but the UI must not claim
  that unplanned future stops already exist.
- Renderer or route failure may degrade Atlas, never stop unrelated audio.

Do not add another player store, Atlas-only queue, or renderer-owned route state.

# Delivery program

## M0 - Program contracts

- accept the macOS-first Tauri ADR;
- pin supported hardware, macOS version, SDK, and deployment target;
- record the client/BFF trust boundary;
- define application information architecture and Journey vocabulary;
- publish ownership for playback, queue, Journey, services, renderer, persistence;
- define contract-first branch and pull-request boundaries.

Exit evidence: accepted ADRs and contracts linked from this repository.

## M1 - Modularize without redesign

- extract app shell, navigation, player, Home, Library, Search, Sonic, and Settings;
- place HTTP behavior behind typed service adapters;
- extract playback, queue, and Journey domain boundaries;
- introduce deterministic navigation and deep-linkable view state;
- divide CSS by owned surface/component boundaries;
- retain the current PWA and service-worker path;
- preserve or improve the full test and production-build baseline.

Exit evidence: no major feature requires editing the monolithic app component, and
existing daily-player behavior passes unchanged.

## M2 - Thin Tauri proof

- create a minimal Tauri v2 shell for `aarch64-apple-darwin`;
- connect to the deployed BFF without exposing service credentials;
- prove sign-in/session recovery and secure local secret storage;
- play, pause, seek, skip, and stream a real library track;
- verify sleep/wake, network loss/recovery, and output-device changes;
- prove native media keys and now-playing metadata;
- define signed development and release packaging paths;
- capture battery, memory, crash, and log behavior on the MacBook Air.

This spike is not authorization to migrate Atlas or rewrite the BFF.

Exit evidence: a packaged development `.app` completes a real listening session and
recovers from the listed lifecycle events on the pinned MacBook Air environment.

## M3 - Daily-player product pass

- replace phone-frame desktop composition with a native desktop shell;
- keep now playing and queue persistent and immediately reachable;
- rationalize duplicate track and Journey actions;
- make Home useful for continuation rather than decorative inventory;
- make Library and Search efficient for pointer and keyboard workflows;
- preserve responsive PWA behavior as a distinct presentation mode;
- add visual regression coverage across compact and wide Mac windows;
- test complete playback with AudioMuse disabled.

Exit evidence: the native app is suitable for daily listening without Sonic Atlas.

## M4 - Complete Sonic Atlas Gate 0 — Complete 2026-08-27

The lab followed the required gate order and merged its final decision records.
M4 selects **bounded Branch B** for initial macOS Sonic Atlas and is complete.

Accepted lab decisions:

- Gate 0A: current UMAP geometry fails as literal directional navigation;
- Gate 0B: current AudioMuse ordering is suitable only for bounded ordered-waypoint
  Journeys with caller-directed length and `path_fix_size=false`;
- Gate 0C: bounded `regl@2.1.0`/WebGL2 with exact-point spatial delivery passes
  restricted real 92,610-point packaged WKWebView functional and 30-minute sustained
  evidence on the target MacBook Air;
- ADR-002: initial product uses Branch B, while uncapped/distance-derived routes,
  measured streets, and alternate graph paths remain future AudioMuse route-v2 work.

Authoritative records live in sibling `navimuse-sonic-atlas-lab` at final M4 merge
`390d302e56387c098763364b7464eda5fe612a36` and Gate 0C report merge
`6cbb7dbc99ffba32ba98d5729c5134e9db3a22a1`.

The phone/PWA Atlas hold remains: no Atlas enablement there until separately pinned
oldest-supported-phone evidence passes. M5 production contracts and foundation are
now unblocked; lab code is not promoted wholesale.

The original M4 requirements were:

The lab must follow the existing gate order and record decisions, not merely output:

1. route geometry truth;
2. long-route listening truth;
3. sustained-device rendering and recovery.

For the macOS-first Atlas release, sustained rendering must include the target
MacBook Air in a 30-minute follow-mode run with exact hardware, OS, WebView, power,
thermal, frame-time, memory, and candidate identities. The existing phone target
remains required before Atlas is enabled in the phone/PWA experience.

Gate 0 must choose Branch A, B, or C from the lab blueprint. A desktop demo,
synthetic fixture, or short FPS result cannot substitute for that decision.

## M5 - Atlas contracts and foundation — Complete 2026-08-28

M5 landed shared `sonic-atlas/v1` contracts, authenticated credential-free map and
bounded Journey BFF boundaries, identity-keyed client cache, renderer-neutral
failure isolation, complete non-map fallback, and queue-owned atomic frozen Journey
persistence. Cross-boundary contract tests prove BFF, client, renderer, fallback,
and degraded ordinary-playback behavior on the same head.

Evidence: [`../sonic-atlas-m5-foundation.md`](../sonic-atlas-m5-foundation.md).
M6 product integration is unblocked after this completion PR merges.

After Gate 0 authorizes a branch:

- freeze versioned projection, tile, route, stop-resolution, and Journey contracts;
- isolate the selected renderer behind a renderer-neutral interface;
- add fail-closed projection identity and cache invalidation;
- add a complete non-map list/player fallback before WebGL integration;
- bind current, played, and upcoming stops to the queue authority;
- persist route intent, resolved stops, position, versions, and reroute history;
- expose observable errors without leaking credentials or private library metadata.

Exit evidence: contract tests pass independently in the BFF, client, and renderer.

## M6 - Sonic Atlas product integration

- integrate Atlas as the primary Sonic surface;
- implement Follow, Overview, and Explore camera modes;
- preserve current track, route, and destination through every LOD;
- make route preview, start, skip, dislike, destination change, and reroute truthful;
- provide a complete ordered Journey alternative for keyboard and screen readers;
- save, resume, revalidate, and visibly repair Journeys;
- maintain playback through renderer loss and AudioMuse degradation.

Exit evidence: an authenticated Journey can be planned, played, explored, rerouted,
saved, resumed, and completed without map/audio divergence.

## M7 - macOS release hardening

M7 establishes the native hardening baseline and evidence scaffold. The 2026-08-30
product decision accepts M7 as a hardening/planning gate because larger product
and design gaps remain before public macOS distribution.

- Developer ID signing prerequisites and prior notarization proof are recorded;
- update-channel and rollback rehearsal are recorded for private preview;
- prior long-session evidence is accepted by the product owner;
- WebGL recovery trigger and sticky evidence result are implemented;
- automated accessibility, privacy/security, migration, and diagnostics coverage
  are recorded with release-readiness follow-up moved to M8.

Exit evidence: M7 hardening/planning checklist is accepted with final Apple
notarization, stapling, Gatekeeper, release-channel, rollback, diagnostics, and
packaged WebGL proof carried by M8 release-readiness.

Evidence scaffold: [`../macos-m7-release-hardening.md`](../macos-m7-release-hardening.md).

## M8 - Cohesive product redesign

After M7 establishes a release-hardened behavioral baseline, apply the selected
Midnight Broadcast + Chromatic Minimalism visual direction across the complete app.
M8 is a functional-preservation redesign: shell, Home, Discover, Library, Playlists,
Search, player, queue, Sonic Atlas, Journeys, Settings, authentication, loading,
empty, error, offline, and accessibility states are included.

- add brief first-run onboarding, returning-user silent restoration, and a rotating,
  revocable trusted-device session so recognized Macs remain signed in without
  exposing provider or service credentials to the client;
- support a Pocket-ID-independent local mode with username/password, discoverable
  WebAuthn passkeys, controlled recovery, and explicit local/OIDC/hybrid deployment
  policy, all resolving to one immutable NaviMuse account and session contract;
- make one Pocket ID sign-in automatically resolve an approved Navidrome external-auth
  identity and BFF-authorized AudioMuse service access, with no second user login and
  no Pocket ID token forwarded to an upstream that cannot validate its audience;
- implement a restrained album-art-derived palette with contrast-safe stable chrome;
- establish native-density components, typography, layout, icon, motion, progress,
  skeleton, and degraded-state systems;
- preserve every daily-player, playlist, search, discovery, settings, and Journey
  action under one playback and queue authority;
- render the complete real 92K–96K Atlas topology with density-aware point treatment,
  exact selection, progressive LOD, bounded animated overlays, and no invented map or
  branching-route semantics;
- retain renderer isolation and send renderer contract changes through the lab's
  evidence and versioned-contract gates before production implementation;
- carry final Apple notarization, stapling, Gatekeeper, release-channel, rollback,
  diagnostics, and packaged WebGL proof as M8 release-readiness work because M7
  passed as a hardening/planning gate;
- prove the redesign on compact/wide macOS windows and the operational PWA with
  keyboard, VoiceOver, contrast, reduced-motion, reduced-transparency, service-loss,
  context-loss, long-session, battery, memory, and thermal evidence.

Detailed scope, delivery order, and acceptance criteria:
[`NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md`](NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md).

Playback continuity, gapless album behavior, Journey transitions, continuous play,
ReplayGain, and engine evidence:
[`NAVIMUSE_M8_PLAYBACK_EXPERIENCE_PLAN_2026-08-30.md`](NAVIMUSE_M8_PLAYBACK_EXPERIENCE_PLAN_2026-08-30.md).

### Required tab passes and QA gates (accepted 2026-09-06)

Complete the owner-approved [tab-by-tab delivery and QA plan](NAVIMUSE_M8_TAB_PASSES_2026-09-06.md)
as part of M8. The delivery order is Home, shared player/queue, Search, Library
completion, Sonic, Settings, access/onboarding, then integrated release QA. Keep
Home, Library, Search, Sonic, and Settings as the five primary destinations.

Each tab pass must preserve its real user workflows, follow the approved Cinematic
Focus references and accepted Library baseline, and include populated, loading,
empty, error, offline/reconnect, and expired-session behavior. Acceptance requires
rendered visual comparison, wide/compact macOS and phone/PWA checks, keyboard and
VoiceOver validation, relevant accessibility preferences, authenticated real-data
flows, and regression/build evidence. Shared playback and queue state must survive
navigation and service failures. Native checks must run in the actual Tauri app.

Track each pass with its exact commit, QA evidence, deployment status, owner design
review, and unresolved findings. Deployed or visually approved does not mean
QA-complete; fixture screenshots, CSS/bounds tests, and healthy API responses cannot
replace the corresponding live user-flow evidence. Library's deployed album pass
remains the visual baseline, with its outstanding authenticated/native QA retained.

These passes are additional delivery and acceptance goals, not a reduction of the
account/session, playback, full-library Atlas, or native release requirements above.

Exit evidence: every required pass is accepted, and the complete functional coverage
matrix and visual-quality gates pass on one pinned commit using real services and
the real full-library Atlas dataset.

## M9 - iOS application

After M8, pursue an iPhone application only through a superseding mobile-platform
ADR and on-device architecture gate. Select Tauri v2 mobile, a native Swift shell, or
another boundary from measured background-playback, lifecycle, energy, accessibility,
and maintainability evidence rather than assumed frontend reuse.

- adapt the M8 product and visual system to a purpose-built mobile experience;
- retain local accounts, passkeys, optional Pocket ID, persistent trusted devices,
  automatic downstream access, and the BFF credential boundary;
- implement native iOS background audio, lock-screen/Control Center commands,
  interruptions, route changes, Bluetooth/AirPlay, and one queue authority;
- deliver complete library, search, playlist, discovery, player, queue, Settings,
  offline/download, and non-map Journey workflows;
- keep Sonic Atlas disabled until the lab accepts real full-library sustained evidence
  on both the oldest-supported and primary iPhone targets;
- complete signing, privacy, TestFlight, App Store, migration, support, and rollback
  evidence on the exact release commit.

Detailed plan:
[`NAVIMUSE_M9_IOS_APP_PLAN_2026-08-29.md`](NAVIMUSE_M9_IOS_APP_PLAN_2026-08-29.md).

Exit evidence: a signed iPhone build completes real background and offline listening
sessions without queue divergence and satisfies the pinned device, accessibility,
privacy, energy, lifecycle, and distribution gates.

## M10 - Android application

After M9 establishes explicit shared-mobile contracts, pursue an Android phone
application through a separate Android ADR and device gate. Reuse contracts, not iOS
assumptions; native playback, lifecycle, storage, passkeys, and renderer behavior are
independently implemented and verified.

- adapt the M8 system to Android phone navigation, insets, density, and accessibility;
- retain all authentication modes, trusted devices, downstream identity, and BFF
  credential boundaries;
- implement native Media3 background playback in a media service with notification,
  headset/Bluetooth, audio-focus, process-recreation, and one-queue behavior;
- deliver complete daily-player, offline/download, and non-map Journey workflows;
- verify Doze, battery saver, storage pressure, network handoff, process death, and
  aggressive OEM background management across the pinned device tiers;
- keep Sonic Atlas disabled until independent full-library Android evidence passes;
- complete signed AAB, Play testing/declarations, staged rollout, migration, support,
  and rollback evidence on the exact release commit.

Detailed plan:
[`NAVIMUSE_M10_ANDROID_APP_PLAN_2026-08-29.md`](NAVIMUSE_M10_ANDROID_APP_PLAN_2026-08-29.md).

Exit evidence: a signed Android build completes real background and offline listening
sessions without queue divergence across the pinned device matrix and passes privacy,
accessibility, lifecycle, energy, storage, and distribution gates.

# Parallel-agent policy

- Use one topic branch and worktree per bounded change.
- Assign one owner to each contract or state boundary.
- Land contract changes before dependent implementation branches.
- Rebase or merge the accepted contract head before final verification.
- Do not let agents independently redefine queue, Journey, projection, route, tile,
  authentication, or persistence shapes.
- Keep renderer and live-service experiments in the lab until promotion criteria pass.
- Require tests and evidence on the exact head proposed for merge.

# Explicitly premature work

Until its prerequisite milestone is complete, do not:

- rewrite the Node BFF in Rust;
- add an embedded Node sidecar to Tauri;
- make Tauri mobile part of the first release;
- select the production Atlas renderer from demo aesthetics alone;
- copy the lab demo shell wholesale into production NaviMuse;
- claim decorative edges are similarity streets;
- infer route distance, duration, or ETA from unvalidated data;
- create a second playback or Journey queue;
- remove the PWA before native replacement and migration are proven;
- promise a flagship delivery date before Gate 0 chooses the route architecture.

# Promotion rule

Lab work enters NaviMuse only when all of the following exist:

1. an accepted lab decision authorizing the selected architecture;
2. a versioned contract owned by the correct repository;
3. evidence pinned to exact data, service, device, and code identities;
4. failure and accessibility behavior defined before integration;
5. a NaviMuse implementation branch with independent tests;
6. a human-controlled pull request and merge.
