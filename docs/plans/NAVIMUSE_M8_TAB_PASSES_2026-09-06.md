# M8 tab-by-tab delivery and QA plan

Status: owner-approved M8 execution goals, 2026-09-06.

Date: 2026-09-06. Planning baseline: deployed main `c058b4202e08c32c340fd348911271e52590ca58`.

This execution plan supplements the [macOS master plan](NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md), [M8 product plan](NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md), and [playback plan](NAVIMUSE_M8_PLAYBACK_EXPERIENCE_PLAN_2026-08-30.md). It does not replace their acceptance requirements. Keep five destinations: Home, Library, Search, Sonic, Settings. Playlists stay under Library; discovery and Journeys stay under Sonic.

## Baseline and tracking

The owner accepted the Library's visual direction after the real deployment of PRs #262 and #263. Library album selection, fetched tracks, selected-index playback, queue callbacks, and responsive styling are implemented. At that checkpoint 659 tests passed, the production image built, and real upstream album/artwork/FLAC and scoped-browsing checks passed. Authenticated browser playback and native validation were not completed; Pocket ID sign-in remained outstanding. Upstream stream bytes are not evidence of audible playback.

| Order | Pass | Outcome | Status |
| --- | --- | --- | --- |
| 1 | Home | A useful, artwork-led starting point for listening | Deployed f51a15e; QA open |
| 2 | Shared player and queue | Stable playback controls and a clean expanded-player/lyrics split | In progress |
| 3 | Search | Fast, predictable finding and playing of music | Consolidated into #266; live/native acceptance remains open |
| 4 | Library completion | Consistent artists, genres, playlists, and large-library workflows | Album workspace deployed; remaining QA open |
| 5 | Sonic | Clear discovery and Journey modes with truthful Atlas behavior | Discovery merged in PR #272; deployment and Atlas/lab gates open |
| 6 | Settings | Readable listener preferences and separate owner administration | API #309 and personal Settings #310 merged; browser/native fixture QA recorded; real-library acceptance and administration open |
| 7 | Access and onboarding | Working local/OIDC/hybrid account and trusted-device flows | Local runtime/BFF merged; combined access/player #308 merged after required review; OIDC/hybrid/passkey and acceptance open |
| 8 | Integrated release QA | One verified macOS candidate and working PWA | Planned |

Implement one bounded pass at a time. Shared contract work may be split into prerequisite PRs; land those before dependent UI changes. Do not call a deployed pass QA-complete while required evidence is missing. Track each pass as planned, implementing, QA, deployed/QA-open, or accepted, with exact commit, findings, evidence, and unresolved items.

## Current integration checkpoint — 2026-09-07 evening

Verified against integration `8cd0031bceaf7973112d68cb2d14ae865f70167e`; main remains `f7f2cbd1791aec0a797ddeba3c40f247fb7da0de`. Earlier checkpoints below are historical. This is not final M8 acceptance.

- There are three open PRs: #266 (integration, mergeable, exact-head Code Bot Review running), #280 (artwork palette draft, conflicts with main), and #285 (Atlas draft, conflicts with main). Superseded Search #267 is closed; its work is consolidated in #266.
- Owner administration now includes account overview, approved music assignment, recovery, role/enablement changes and reviewed local-listener creation. Native evidence covers access reads, last-owner protection, enable/disable, role changes, recent-authentication expiry/recovery, self-demotion, and creation. Separate active-session/device revocation was checked through the server store after native self-demotion. See [owner access](../evidence/m8/owner-access-ui/README.md) and [account creation](../evidence/m8/owner-account-creation-ui/README.md).
- The current isolated QA server is source `657360b`, schema 10, with a copied volume and preserved prior image/database pair. These changes are not production-deployed. Native creation produced a disposable unassigned Listener; the fixture was disabled after verification. New-listener native sign-in plus music assignment remains an end-to-end scenario to complete.
- Local username/password, recovery, passkey storage/verification and opt-in username-first compatibility have implementation evidence. Physical authenticators/canonical native HTTPS, local/OIDC/hybrid identity reconciliation, explicit issuer/subject linking and controlled legacy migration remain open. `openLocalAccountRuntime` still composes local mode; these other requirements cannot be inferred complete from local tests.
- Full suite last passed 955 tests at the creation server increment; the following creation UI has focused mounted/client tests, build and desktop/phone/native evidence. This is not a claim that the latest integration head has run the full suite.
- A fresh local diagnostics bundle was inspected at this exact integration head. It contains the declared repository/toolchain/configuration fields and no prohibited runtime data. It reports no release app bundle in this worktree and a null base CSP. The signed release candidate must be built and assessed independently; this bundle is not release proof.

Next execution priorities: finish the newly created listener's native access path; implement the missing OIDC/hybrid/linking contract adapters; reconcile palette and Atlas drafts against their accepted contracts; complete all tab/accessibility/lifecycle/performance and privacy acceptance; produce the signed/notarized release candidate. Required exact-head review and owner audible acceptance remain merge/release gates. The complete original M8 scope stays intact.

## Native listener access follow-up — 2026-09-07

Integration `53e9f85` passed all 957 tests. On the isolated creation runtime `657360b`, the newly created listener signed in through the native app, encountered the unassigned-library gate, then reached a populated real Library after an owner reviewed and saved an approved music assignment. Listener Settings excluded owner Services and did not inherit the owner's player queue. Cleanup removed the assignment and disabled the fixture; owner paused playback restored at 0:21. See [native listener evidence](../evidence/m8/owner-account-creation-ui/README.md). This supersedes the pending new-listener access and latest-full-suite items in the historical checkpoint above.

Next: implement the missing local/OIDC/hybrid identity and linking adapters, then continue the palette/Atlas and full native release gates already listed. Native audible playback acceptance remains open.

## Account and Settings checkpoint

- Preference API #309 merged as `e31fda05dfa58186840a9c97d2e768eb1d3ef1ec`
  after a successful required review. Its branch passed 821 tests, including
  schema-six backup/restore and session invalidation.
- Account/player #308 at `b9c074f8e160c0afcab56aa151a103f8ed481170` passed
  required Code Bot Review and merged as `f8edae716cce22f762e9a6ac72d43cd553230bc6`.
  Its branch passed 830 tests and built. It is not deployed. The superseded access
  PR #307 is closed without a separate merge.
- Settings #310 merged as `cdd74a5680b0ce099d0a279b30595650bb0b8664`
  after successful required Code Bot Review at `eb7aa3240c63c8203c5d3e9cd51d5f39e8798577`.
  The unchanged application code passed 832 tests and built. It is not deployed.
- [Live QA evidence](../evidence/m8/account-settings/live-2026-09-07/README.md)
  records Chrome save/reload, two-tab revision conflict and draft-preserving refresh,
  three responsive sizes, and actual native sign-in, save, quit/relaunch restoration
  and logout. These checks use real account/SQLite routes with empty music fixtures.
- QA found a stale save-success message after a failed refresh, corrected in the
  merged fix #311. Cross-tab fix #312 subsequently passed required review and
  merged as `134cbaeb044bd9da5860960b2a7c20b18eea9fcf`. Actual Chrome QA
  verifies both logout removal/focus and login restoration without manual refresh.
  See [cross-tab evidence](../evidence/m8/account-settings/cross-tab-live-2026-09-07/README.md).
- Real-library sign-in, native audible playback, VoiceOver, owner administration,
  visual acceptance and release-candidate checks remain open. Fixture evidence
  does not close those gates.
- Owner-approved repository access is now applied: Codex has write access to
  `example-user-projects/code-bot` (the repository moved from `example-user/code-bot`).
  Reviewer repair PR #86 at `e5aef5753c3a723795910fca4c2bda8e37b22275`
  passes 302 tests, Python compilation checks, and the required Code Bot Review.
  It preserves source diff in blocker verification as well as repair context.
  Owner subsequently approved merge and deployment. PR #86 merged as
  `4de8f097a68cb4ff97e4337e450f1ece425da683`; its two changed files are
  deployed, hash-verified, and pass all 302 tests on the Mac mini. Service health
  passed after restart. Review overrides remain unauthorized.
- Account/player #308 received a focused investigation request against its exact
  current head after 28 relevant behavioral tests passed again. The request
  identifies the server scope guard, storage catches, transport error handling
  and authenticated render gate for independent inspection. Investigation #4795
  found no defects. After reviewer deployment and a bounded timeout adjustment,
  the required review requested in #4804 passed on the exact head, permitting
  merge. Earlier failed reviews remain historical evidence, not current status.
- Local Settings integration `2f43427` adds a passing production-entry check that
  saves Compact list, signs out and back in, fetches preferences again, and shows
  List selected in Library with exactly two audio decks. This remains controlled
  DOM evidence; native relaunch and audible acceptance are still open.

Land the live-QA fixes through required review, then complete real-library and
remaining native acceptance checks. Preserve the remaining tab,
account, Atlas, playback and release requirements; this checkpoint does not narrow M8.

## Cross-tab account reconciliation follow-up

The live Settings finding now has a bounded implementation: successful validated
login/logout responses send an identity-free BroadcastChannel notice scoped to the
configured BFF. Mounted account gates read the current server session without
attempting renewal. A confirmed signed-out response unmounts the workspace; failed
reads preserve the existing retry state. Generation checks reject stale responses.
The channel is a recheck hint, never an authorization source or credential store.

Validation: 835 full-suite tests passed before the final additional login-notice
test; all five final cross-tab/UI tests pass, and the production build passes.
Tests cover logout failures, cross-tab logout, stale results, server isolation,
malformed notices, login validation, channel cleanup, and sign-in focus restoration.
Required review passed on `17c606cb83c827f1934154baeb9d0d0897415608`; #312 is
merged. Actual Chrome two-tab logout/login propagation passed. Native cross-window
and active-audio teardown acceptance remain open. Unsupported
BroadcastChannel environments retain explicit session checks; notices do not cover
server-side revocation from a different device or separate browser cookie store.

## Repeatable pass workflow

1. Inspect the approved reference image and the current production screen side by side. Record concrete composition differences and inventory existing actions before editing.
2. Define the listener task and acceptance scenarios for that pass. Map every visible control to an actual action and service capability. Generated labels, filters, or imagined map geometry do not add scope.
3. Implement in production components with real services and the existing playback/queue authority. Use isolated fixtures only for reproducible states; label them clearly.
4. Run targeted behavioral tests for changed logic, the relevant regression suite, and the production build. Fix failures before review. Run the full suite for shared behavior or release integration; test counts alone never establish acceptance.
5. Inspect rendered production components at wide desktop (1440×900), compact desktop (744×900), and phone/PWA (390×844), including a short window and long metadata. Compare hierarchy, spacing, density, artwork, and panel proportions against the references. Bounds tests supplement visual inspection.
6. Exercise the actual app with an authenticated real library. Capture screenshots and record the actions and observed results. Include the native Tauri WebView on macOS; browser-only evidence cannot close native acceptance.
7. Resolve Code Bot findings against code and tests, merge through the required review gate, and deploy with a rollback point. Smoke-test the deployed revision and public assets. Present a concise before/after and remaining issues for owner design review.

## QA required for every tab

- Populated, initial loading, empty, partial/missing data, unavailable service, retry, offline/reconnect, and session-expired states. Define expected behavior per state; do not substitute a generic empty screen for a failure.
- Keyboard-only navigation, logical focus order, visible focus, Escape/close behavior, and focus restoration after details or menus. Check VoiceOver names, grouping, announcements, and reading order in the real macOS app.
- Contrast, long titles, missing artwork, reduced motion, reduced transparency, and applicable text scaling. Resolve measured accessibility failures rather than approving by appearance.
- Navigate through every primary tab while a real track plays: no restart, duplicate audio, cursor change, lost queue, or stale transport metadata. Verify pause, resume, next, seek, and volume remain synchronized.
- On compact and phone layouts, drawers and menus stay reachable, the final row can scroll above the transport, and inspectors consume space only when useful. Honor existing platform capability boundaries.
- Pass evidence records exact app SHA, service versions where relevant, viewport, OS/WebView, hardware, and test results. Mark unperformed checks explicitly. A fixture screenshot, CSS regex, or healthy API is not a substitute for the corresponding user flow.

## Pass 1 — Home

**Listener outcome:** open the app, understand what is available, and start or resume listening without searching through oversized chrome.

Reference: `design/finalists/c-cinematic-focus/home.png`; use the deployed Library's quiet typography and chrome as the shared baseline.

Work: restore artwork-led shelf composition and useful density; establish clear priority among existing recent/new/recommended content; reduce oversized headings, redundant cards, and generic feature panels. Preserve collection scope and existing actions. Use real artwork with intentional missing-art treatment. Show only content supported by actual service data. Resume is explicit and must not autoplay on launch.

QA scenarios:
- Start a real album from a shelf; verify its queue source, track order, artwork, and transport.
- Return Home during playback without changing the queue; reopen an album and retain useful browse context.
- Check a new account, no listening history, a small library, missing artwork, and long album/artist names.
- Fail AudioMuse while Navidrome works: ordinary shelves and playback remain usable. Retry a failed shelf without duplicating results or resetting unrelated content.

Exit: Home is a useful listening entry point with accepted desktop/compact/phone composition and all displayed shelf actions proven.

## Pass 2 — Shared player and queue

**Listener outcome:** understand what is playing and what comes next, and manage playback without losing context.

References: `m8-full-player-lyrics.png`, `m8-library-editable-queue.png`, and `m8-compact-playlist.png` in the same reference directory.

Work: unify bottom transport styling across tabs; correct the expanded-player and optional lyrics split; refine queue hierarchy and action placement; retain source identity and the single queue. Display delivered quality and capabilities truthfully. Evaluate the existing queue-recovery branch against current main before integrating it; its prior work is not assumed shipped or accepted.

QA scenarios:
- Start at track three of a real album and verify the full ordered queue, selected index, and next-track behavior.
- Play next/add/reorder/remove/clear/undo, including duplicate songs, current track, history, last track, and active Journey restrictions.
- Navigate, open/close the player and queue, use media keys, and pause/resume without duplicate audio or lost position.
- Lyrics: synchronized, unsynchronized, absent, loading, failure, manual scroll and return to follow; none may interrupt audio.
- Restore paused after relaunch; test missing tracks, reconnect, stale requests, account changes, and storage migration using isolated test profiles.
- Verify transition and quality claims against the recorded engine evidence. Do not claim seamless/gapless playback merely because DOM events or controls look correct.

Exit: both player sizes and all queue presentations agree with the same playback state; failures remain recoverable and truthful.

## Pass 3 — Search

**Listener outcome:** find the intended artist, album, or track quickly and know exactly what each action will play.

Use the Library's spacing, rows, artwork, and action grammar; establish a reviewable composition where no approved Search-specific image exists instead of inventing an unrelated style.

Work: clear grouped result hierarchy, compact query controls, useful empty/no-match states, consistent album detail and track actions, preserved query and selected-library context.

QA scenarios:
- Artist/album/song matches, punctuation, Unicode, blank queries, no matches, large results, and long metadata.
- Rapid typing and delayed responses: an old response cannot replace the latest query. Exercise cancellation and retry.
- Apply library scope; open and return from details without losing the query. Use keyboard focus throughout.
- Play a chosen result; verify documented queue membership and source. Play next/add must preserve the currently playing track.

Exit: finding and starting a track works end to end, stale results never win, and all result types share predictable actions.

## Pass 4 — Library completion

**Listener outcome:** browse and organize the real collection with the same quality as the approved album workspace.

References: `m8-library-editable-queue.png`, `playlists.png`, `m8-compact-playlist.png`.

Work: carry the accepted composition into artist/genre details and playlist management; retain actual sorting, incremental browsing, and scope. Complete album-workspace live QA. Avoid rewriting the approved album layout without evidence of a problem.

QA scenarios:
- Browse beyond the first 100 rendered albums and subsequent upstream pages; select a late album, play a chosen track, close, and restore focus/context.
- Artists spanning multiple folders; genre membership; empty matching pages with a valid next cursor; failed pagination and retry.
- Playlist create/rename/add/reorder/remove/delete using explicitly disposable QA playlists. Exercise duplicate entries, stale edits, failure, cancellation, and focus restoration. Never delete a personal playlist as a test.
- Grid/covers/list, sort and folder switches, empty collections, missing art, and long/multi-disc albums.
- Confirm the original authenticated playback check on the deployed Library and repeat in native Tauri.

Exit: Library-owned workflows are consistent and live-verified, not just the album screenshot.

## Pass 5 — Sonic

**Listener outcome:** clearly distinguish discovery, radio, a planned Journey, and free exploration while music continues reliably.

References: `discover.png`, `journeys.png`, `sonic-atlas-production-topology.png`, `sonic-atlas-stop-selected.png`, and the three `m8-sonic-journey-*` images. The accepted lab blueprint and versioned production contracts govern topology and renderer changes.

Work: simplify discovery entry points, prioritize the map over headings/diagnostics, clarify Explore/Follow states and selected-stop information, and retain queue ownership and state-driven transitions. Diagnostic detail is secondary. No invented topology, fake route branches, or unsupported phone Atlas.

QA scenarios:
- Real full-library topology (approximately 92K–96K points, record actual count), exact selection, pan/zoom, labels, and long-session memory/performance.
- Start a Journey, select a stop, advance, pause/resume, Explore while playing, return to Follow, finish, continue, and detach where supported.
- Journey sequence and active stop must agree with the shared queue; late route responses cannot overwrite a newer intent.
- AudioMuse failure, partial analysis, renderer/context loss and recovery: ordinary playback survives.
- Validate compact native windows, reduced motion, and the intentional PWA capability fallback.

Exit: accepted lab contracts, full real topology, reliable selection and recovery, and clear discovery/Journey behavior. A screenshot of a small fixture cannot close this pass.

## Pass 6 — Settings

**Listener outcome:** change listening preferences confidently and understand service status without wading through owner setup.

References: `settings.png`, `m8-settings-playback.png`.

Work: organize listener preferences into readable groups, separate owner administration, use precise labels/help, show save/error state, and expose capabilities according to actual support. Wire every toggle. Apply the approved artwork-derived, contrast-safe palette through shared components once its runtime behavior is ready. Deferred EQ/download/output capabilities must not appear as working controls.

QA scenarios:
- Change a supported preference, verify observable behavior, reload/relaunch, and verify persistence. Test failed save and restoration of the actual saved value.
- Streaming/network-protection controls report what the engine actually does; no full-offline or bit-perfect claims without the required implementation/evidence.
- Missing/unreachable services, partial health, reconnect, expired sessions, and owner/listener permission differences.
- Keep credentials out of responses, screenshots, console output, and artifacts. Use isolated service profiles for destructive connection tests; preserve the owner's configuration.
- Preference changes and health failures must not unexpectedly stop ordinary playback or discard the queue.

Exit: every displayed setting has verified behavior and persistence; service administration and capability limitations are understandable.

## Pass 7 — Access and onboarding

This is a security implementation gate as well as a visual pass. Reference `onboarding-and-login.png` and `local-login-passkey.png`.

Shared prerequisite: [account and session v1](../contracts/NAVIMUSE_ACCOUNT_V1.md). Its public parser and proposed server requirements require independent review and merge before consumers are wired. This prerequisite does not close account, credential, device-session, or live sign-in acceptance.

Carry the master-plan requirements: local username/password, discoverable passkeys, controlled recovery, explicit local/OIDC/hybrid policy, one immutable account identity, rotating/revocable trusted-device sessions, and approved automatic upstream identity mapping. Pocket ID tokens must not be forwarded to an upstream that cannot validate their audience.

QA: first run, returning session, expiry, revocation, logout, account switch, recovery, denied upstream mapping, canceled passkey/OIDC flows, offline state, and storage/queue separation. Verify server authorization and credential handling with security-focused tests before calling the screens complete. Live Pocket ID sign-in still requires the owner's participation where passkey presence is needed.

## Pass 8 — Integrated release acceptance

Pin one final candidate after all passes. Repeat the core listening journey across all tabs and test native/PWA lifecycle, network loss/reconnect, sleep/wake, long playback, keyboard/VoiceOver, performance, battery/thermal behavior, and renderer isolation on the actual MacBook Air.

Close final signed/notarized/stapled artifact, Gatekeeper, updater, rollback, diagnostics, and packaged WebGL evidence on that candidate. Preserve the full M8 acceptance matrix, including security and real full-library Atlas requirements. Record remaining defects explicitly; do not equate visual approval or deployed tabs with M8 completion.

## Immediate next work

Home is deployed at f51a15e with live/native acceptance still open. Continue with the shared player and queue: evaluate the earlier recovery work on current main, then verify the expanded player, optional lyrics split and editable queue against the approved references. Carry the deployed Library's missing authenticated/native QA into the shared-player and Library gates rather than silently closing it.

## Native Library pagination checkpoint — 2026-09-07

[Real-library native evidence](../evidence/m8/library/native-pagination-2026-09-07/README.md)
records expansion beyond 100 albums, track-three playback with the complete album
queue, focus restoration on close, a second upstream page (600 of 1000 fetched
albums shown), and populated detail from that page. The tested candidate is
3a07cdc, including main 2028996 (reviewed packaging fix #313). This is partial
Library acceptance: VoiceOver, pagination failures/retry, other Library modes,
playlist work, visual acceptance, and full native/audio requirements remain open.

The retained Queue panel also exposed a stale live-region promise after pause
after current completed. The follow-up derives that promise from the active
transport control instead of retaining it as a queue-edit message. Controlled
rendered checks cover both Queue layouts; native revalidation of that message
change remains open.

### Access checkpoint — 2026-09-07

Passkey verifier, durable ceremonies, credential storage, composed service and HTTP
boundary have merged through PR #318 (`36e9667`). The `codex/m8-passkey-access`
candidate adds discoverable browser sign-in and Settings credential add/rename/remove,
with recent-auth/ownership/revision checks and last-recovery-method protection.
See `../contracts/NAVIMUSE_ACCOUNT_PASSKEY_ACCESS_V1.md` and
`../evidence/m8/account-passkey-access/README.md` for exact evidence and limits.
This is an implementation checkpoint: real authenticator/native redirect acceptance,
username-first compatibility, recovery and OIDC/hybrid/linking remain open. It does
not close the access pass or any other M8 tab, playback, Atlas or release gate.

### Self-hosted privacy release requirement

The owner clarified that NaviMuse is a client connecting to a self-hosted server. Include a public privacy policy distinguishing developer collection from device/server processing. The release target excludes advertising, behavioral tracking, developer-operated analytics and automatic music/account/listening-data uploads to the developer. Disclose configured providers and the current external password-breach check. Verify retention/removal behavior, logs, diagnostics and outbound destinations before publication; do not advertise “no data collected” as an absolute.

Deliverables: [privacy-policy draft](../privacy/PRIVACY_POLICY_DRAFT.md) and [release verification record](../privacy/M8_PRIVACY_VERIFICATION.md). These are additional M8 requirements; final privacy acceptance remains open.

## OIDC integration inspection — 2026-09-07

Source inspection at `6cd991c` confirms that only legacy/local startup modes are accepted. The legacy OIDC callback issues its old signed session directly from provider claims; the local runtime explicitly excludes these routes. Do not enable hybrid by merely changing the mode allowlist.

Required dependency order for the account adapter:

1. Durable exact issuer/subject links, unique across all writers; link changes bound to a fresh authenticated account and verified provider ceremony. Accounts currently require a non-null username and password on insertion, so OIDC-only provisioning requires an explicit schema/insertion change rather than a fabricated local password.
2. Atomic one-use provider transactions (maximum five minutes) binding PKCE/state/nonce, intended login/link purpose and account generation. The legacy signed-cookie transaction is ten minutes and is not the new contract.
3. Session issuance through the existing account store, rechecking the linked identity and enabled account inside the write transaction. Preserve optional trusted-device policy and private queue scope.
4. Explicit mode-aware runtime/routes/client entry points; outage must not enable password fallback. Unlink must preserve a usable recovery method, with provider-only setup and controlled legacy migration verified separately.
5. Real Pocket ID plus native HTTPS acceptance, cross-writer linking races, failed/replayed callbacks, disabled/revoked accounts, account switching and upstream isolation.

During inspection, fixed raw legacy callback exception logging; HTTP provider-rejection regression proves a fixed diagnostic and generic user error. This is privacy hardening, not completion of the OIDC adapter.
