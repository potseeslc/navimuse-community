# M8 queue recovery — September 5 working status

Base: main `644dcd5f9760fe6f84c1a39d72fa35096f08ec23`.
Worktree: `codex/m8-queue-recovery` (separate from library PR #262).

Implemented locally: ordinary restored queues are checked after authentication,
with four concurrent metadata requests. Only confirmed HTTP 404 / Subsonic code 70
removes a track. Connection, authorization and malformed-response errors retain the
saved queue. Duplicate occurrences and surviving order are preserved; shuffle and
history indexes are remapped. A missing current item selects the next surviving
item (or the last preceding survivor), at position zero, without playing. Empty
repair clears the media source. Internet-radio URLs and atomic Atlas transactions
remain under their existing recovery paths.

The shared queue hook owns the commit. Queue revision, control reference and
playback request checks prevent stale repair from overwriting a user action.
Metadata resolution owns no separate player or mutable queue authority.

Evidence: 659 tests passed and Vite build passed on the local working changes.
Tests include actual App restoration and a delayed repair superseded by playback,
queue-hook edit/control races, duplicate preservation, missing current/all items,
auth/network failures, cancellation, and HTTP Subsonic missing-vs-denied responses.
No packaged real-track recording or independent PR review has been claimed yet.

Still required for full M8 persistence:
- Identity-scoped local storage and explicit legacy migration; current fixed key
  is not sufficient for multiple server/account identities.
- Server restore/save, local fallback and explicit timestamp/revision precedence.
- Account-safe upstream integration: current BFF uses configured shared Navidrome
  credentials, so blindly using that account's play queue for all OIDC users would
  conflate users. Resolve the immutable account/server namespace and approved
  external-auth mapping before enabling shared upstream queue persistence.
- Preserve the atomic Journey transaction and paused restoration across that
  namespace/precedence work, and verify exact-candidate real-service lifecycle.

The master plan's local account, passkey, trusted-device and deployment-policy
requirements remain in scope. This repair work does not close M8.

## Identity-scoped local persistence implementation

The session endpoint now returns an authenticated opaque HMAC namespace keyed to
this deployment, the current principal (local admin or OIDC issuer/subject), and
Navidrome origin/username. Password rotation leaves the namespace stable. This is
storage isolation for the existing authentication model, not completion of M8's
future immutable local-account/passkey mapping.

App now binds queue persistence only after that namespace is verified. Ordinary
and atomic Atlas snapshots use the same scoped storage adapter. A namespace change
unmounts the prior player; detached audio elements explicitly pause, clear their
sources and disconnect from the Web Audio graph. Same-namespace session refreshes
retain the current player. Late session responses are ignored, and service changes
refresh the namespace. This requires the corresponding BFF update; older BFFs that
omit queueScope do not enable persistent queue storage.

Legacy queues are retained under their original keys. An authenticated migration
screen asks whether to import the legacy queue or start empty. Import copies only
the authoritative newest ordinary/Atlas snapshot in one storage write and stays
paused. It never silently attributes old shared-device data to a newly signed-in
account. The original remains available if a copy fails.

Additional tests cover separate storage scopes, authenticated server namespaces,
upstream-account changes versus password rotation, explicit legacy import, and
an actual App identity switch stopping the old audio and isolating the new queue.
Migration visual/keyboard checks and server-backed queue restore/save remain open.
The earlier fixed-key limitation is addressed locally by these new changes; it is
not evidence that the broader persistence or M8 acceptance gate is complete.

## Integration into the shared player pass — 2026-09-06

Reapplied the earlier `eda5544` change onto merged Home baseline `f51a15e`. The server-test merge retained both Library scope coverage and the queue recovery tests. Updated the master-plan assertion to require the expanded tab-pass acceptance wording. All 671 tests and the Vite build pass on this integration. This is local integration evidence, not independent review or deployment.

Full production App browser QA with isolated synthetic services on port 5201: selected Daydream as album track three, paused at 15.99 seconds, reloaded, and observed Daydream restored at 15 seconds with both audio elements paused and unloaded. Opening the queue retained two played tracks and the seven upcoming tracks. The synthetic session supplies an opaque QA namespace; this is not a live account-switch or native check.

Next: verify migration from the existing unscoped QA queue, browser missing-track recovery, and account changes; then refine the expanded player against `m8-full-player-lyrics.png`. The current desktop inspector overlays half of the player, clips its header, and makes the underlying player content inert. The accepted reference calls for a deliberate artwork/player column beside optional queue or lyrics, with shared bottom controls. Keep phone modal behavior while correcting desktop layout and keyboard access.

## Desktop player composition and browser QA — 2026-09-06

The expanded desktop player now uses an independently scrollable artwork/control column and a queue or lyrics column. The inspector is a nonmodal region at widths of at least 900px; the underlying player remains keyboard-accessible. Smaller layouts retain dialog semantics, an inert player background and trapped focus. Covered Home/Library content is inert while the expanded player is open; selecting a primary tab closes the player without changing playback authority. Shared bottom playback controls remain visible.

Browser checks used the production App and the isolated QA server, with synthetic authentication, metadata, original sample lyrics and silent WAV audio. At 1280×720 and 1440×900 the inspector no longer overlaps the header. At 390×844 lyrics retain modal semantics and the background is inert. Imported the previously saved unscoped QA queue through Restore saved queue: Dive returned at 11 seconds with both audio sources unloaded and paused. With desktop lyrics open, resumed audio, selected the third lyrics line and observed the media position at 30.26 seconds; Pause worked and Home navigation closed the player. These observations do not prove native or live authenticated playback.

Focused tests exercise the compact Tab trap, desktop Tab escape, desktop region semantics, shared-queue preservation on navigation, and disabled covered surfaces. The visual fixture tests predate the new player stylesheet; browser observations above cover the new composition. Still required: real missing-track and account-switch browser scenarios, all queue edits and lyrics states on the combined app, short/compact windows, native keyboard/VoiceOver and lifecycle checks, independent review, deployment, and owner design acceptance.

## Recovery and queue-edit follow-up — 2026-09-06

The loopback QA server now accepts `NAVIMUSE_QA_SONG_STATUS=503` for unavailable metadata and `NAVIMUSE_QA_MISSING_SONG=<song-id>` for a confirmed missing track. These switches only affect synthetic song-metadata responses. Stop the QA server and restart it with the desired environment before reloading the same QA origin.

Full-App browser observations: with metadata 503, the saved 10-track queue retained Dive at 30 seconds, showed “Queue kept as saved. Track availability could not be checked.” and kept both decks paused. With only `5-3` missing, reloading repaired to 9 tracks and selected Coastal Brake at position zero without autoplay. In the restored queue, moved Melanine ahead of Ascension, removed Ascension, undid the removal, cleared upcoming tracks, undid that clear, and cleared played history. The final queue had Coastal Brake followed by five upcoming tracks; current selection remained unchanged and both decks stayed paused throughout. These are synthetic upstream checks, not live deletion tests.

Review follow-up: the BFF derives queueScope from the authenticated signed-session principal, issuer and configured upstream account using its deployment key; it is a storage namespace, not an authorization credential. The client uses it only for authenticated session responses. `sessionRequestRef` increases monotonically, and response application checks both the current request and mounted instance. A rendered App regression now explicitly resolves an older account response after a newer account is active and checks that the old queue cannot return; an unauthenticated response containing a former scope also cannot restore its queue. The repair path already calls `validatePersistedQueue`, including schema version validation, both before resolving metadata and before committing. An explicit unsupported-schema regression verifies no song resolver is invoked. The automated review's descriptions of an unvalidated schema and a decrementing session counter do not match the implementation.

At 920×600, the queue header actions and shared bottom transport remain inside the window, with the artwork column and queue independently scrollable. Full regression suite after the review additions: 672 tests pass. Production code is unchanged from the preceding built player candidate; the follow-up adds regression coverage, synthetic failure switches and evidence.

## Lyrics error-state and session HTTP verification — 2026-09-06

Fixed a real lyrics failure state found while exercising the fixture: an active request whose response omits or mismatches songId previously returned without leaving loading state. It now becomes unavailable; requests canceled by a track change still cannot alter the current lyrics. The whole-App regression verifies malformed current lyrics become unavailable while audio remains playing, then resolves old malformed lyrics after newer valid lyrics and verifies the newer ready state survives. Full suite: 672 passing tests; production build passes.

The repeated review's sessionStatus authentication allegation was checked at the HTTP boundary: a forged cookie with an injected queueScope query/header receives authenticated false and no namespace; a revoked previously valid signed session also receives no namespace. These additions pass with the existing implementation. Run the focused server regression with `NODE_ENV=test node --test --test-name-pattern='session queue scope' test/server.test.mjs`. The test environment flag is required; a direct run without it failed during test initialization and is not an application failure. No new authorization condition was added based on the review's contradictory description.

## Explicit session boundary

Namespace construction now lives inside sessionStatus immediately after verifiedSession succeeds. Removed the helper accepting a session object so there is no separate entry point that could be mistaken for accepting an unverified identity. Login-response authenticatedOverride still cannot supply a principal or namespace. Namespace inputs and output format remain unchanged, preserving existing scoped storage. The forged/revoked-cookie HTTP check and all 672 tests pass after the refactor. This clarifies the verified-session boundary; it does not claim the prior implementation accepted forged sessions.

## Native build and launch checkpoint — 2026-09-06

Built code revision `ff9a46f26c2b03bd8c691915b12e87fde083360e` with
`CARGO_BUILD_JOBS=1 VITE_NAVIMUSE_BFF_ORIGIN=https://navimuse.example.com npm run tauri:build`.
The initial parallel build failed with ENOSPC; compiler temporary files were
released on exit, and the single-job retry succeeded without deleting user files.

Hardware: MacBook Air Mac14,2, Apple M2, 8 GB RAM; macOS 26.6.2 (25G83), AC power,
100% battery at start. Rust 1.88.0; Tauri 2.11.5. Built arm64 release app:
`src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NaviMuse.app`.
Executable SHA-256:
`187ea7d34b185aa8f3e563462bb6e3b45054ecba37d15c51026a2baa8409918b`.

CUA launched that exact bundle; process-path inspection confirmed the running
executable. The native window rendered the Welcome back / Continue with Pocket ID
screen and “NaviMuse found”. Its accessibility content reported the deployed
`navimuse.example.com/?view=home` URL. This proves packaging and native launch to the
first-party access screen, not authenticated playback of the bundled player code.
No sign-in or passkey presence was completed. Codesign reports ad-hoc/linker
signing, no team identity and no sealed resources; this is not the signed,
notarized/stapled release candidate required by M8.

Code Bot's format failure was retried by reopening PR #266 at the same head.
The resulting blocker claims a forged queue namespace can authenticate a session,
but its own verification says sessionStatus validates through verifiedSession.
The exact regression `NODE_ENV=test node --test --test-name-pattern='session queue
scope is opaque' test/server.test.mjs` passed again, including forged-cookie plus
injected namespace and revoked-cookie cases. The PR description records this
conflict. The independent merge gate remains closed.

Library edit PR #269 initially failed because Code Bot could not resolve its
stacked base branch. Retargeting it to main and reopening it yielded a successful
review at `dadf549f68a0d4e7e3518bf32d4eaf874ba13135`. Search #267 and Library playback
#268 also have passing reviews; their release remains behind the player pass.

### Genuine signed-cookie tampering regression

Extended the existing HTTP session-namespace test to alter a real cookie produced
by the isolated server while retaining its original signature. Three cases inject
a valid queue scope, another subject, or both; each also supplies the valid scope
through the query and header. All return unauthenticated with no namespace, and
each protected music bootstrap request returns 401. This addresses the reported
forged-payload scenario beyond the earlier malformed-cookie test. The focused
session-namespace regression passes. No production authentication logic changed.


## Integration with deployed tabs — 2026-09-06

Merged main `b74c0fb49647b277fb16b3197a852bcec9f456c7` into the player branch.
This preserves the deployed Home/Sonic, Settings, and unwired account-v1 contract.
The active legacy session namespace stays queue-scope-v1 until account-v1 server
implementation and migration land. No client-supplied namespace is an identity.

Review evidence to inspect together:

- `server.mjs`: `sessionStatus` obtains its principal exclusively from
  `verifiedSession`, which verifies the cookie signature and applicable OIDC subject.
  Query/header queue scopes are not read by this path. The HTTP test named
  “session queue scope is opaque, authenticated, stable across refreshes and isolated
  by deployment” alters a genuine cookie payload while retaining its original
  signature; identity and queue-scope injection fail authentication, omit the scope,
  and receive 401 from a protected music route.
- `src/main.jsx`: asynchronous repair checks abort, playback request and playing
  state immediately before commit. `commitRestorationRepair` in
  `src/playerQueueState.js` validates the candidate, rejects attached Journeys, and
  compares captured revision and controls against current refs before mutation.
  `test/appQueueRestore.test.mjs` resolves delayed repair after a new track choice
  and verifies that the new choice survives.
- Legacy queues have no trustworthy account provenance. The migration screen
  therefore asks for explicit ownership confirmation and offers an empty queue;
  it never silently imports the old cache or uses it to authenticate.

These checks do not close the outstanding real-service/native acceptance gates.
The failed review remains a merge gate until the integrated head passes review.

Integrated validation: 679 tests passed with no failures or skips; production build
passed. Logs: `/tmp/navimuse-player-current-main-tests.log` and
`/tmp/navimuse-player-current-main-build.log`.
