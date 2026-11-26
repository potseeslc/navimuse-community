# NaviMuse output selection: direct WiiM and AirPlay

Status: proposed implementation plan; repository audit only, no device validation or deployment.
Date: 2026-09-09.

## Outcome

Select a WiiM or existing WiiM group in NaviMuse, play a Navidrome album with title,
artist and artwork, close the phone application, and have the album continue in
order. Reopening the application attaches to the actual remote session. NaviMuse's
existing Docker backend controls playback and serves media; WiiM performs native
group synchronization. No Music Assistant, Snapcast, Sendspin or Pi is required.

Owner scope update: include AirPlay in the same output-selection surface. Configure
multi-room membership in WiiM Home; NaviMuse discovers and uses those configurations
without providing group creation, join/leave or speaker-setup controls.

## Output selection and AirPlay

The shared “Play on…” surface presents:

- This iPhone / This Mac (appropriate local-device label).
- AirPlay… (system device picker, with current route name when available).
- Direct WiiM players and existing groups, labeled “WiiM Direct”.

Use Apple's supported `AVRoutePickerView` in the installed iOS app so users can see
and choose nearby AirPlay receivers. The bounded first version places an AirPlay
entry alongside direct WiiM rows; it opens Apple's list of individual AirPlay
devices. Do not promise enumeration or arbitrary selection of all AirPlay routes
inside a custom React list. If a single native list containing both protocols is
desired later, evaluate AVRouting's third-party discovery extension, entitlement
and OS requirements separately. This is not required for the first version.

For the PWA, feature-detect the browser's supported AirPlay picker on the active
media element; provide an honest system-controls fallback where unavailable.
For packaged macOS, validate its native route-picker/player binding independently.
Do not advertise unavailable discovery as an empty list of devices.

AirPlay remains client-owned playback through the existing local/native engine;
it is not an AirPlay sender running in Docker. Closing the app does not carry the
direct-WiiM app-independent queue guarantee. Publish title/artwork through existing
native Now Playing or browser Media Session support and observe route changes.
Keep AirPlay and direct-WiiM paths visibly distinct when the same physical speaker
is reachable through both. Never run both playback paths for the same session.

When opening AirPlay from active direct playback, retain the remote session until
a route is selected and transfer is explicitly committed. Picker cancellation must
leave remote playback untouched. Use the transfer contract below to stop/release
the direct session before starting client audio; test whether route selection on
the same WiiM causes an external-source change and reconcile it without double play.
Switching to direct WiiM pauses client audio, including its AirPlay stream. Returning
to “This iPhone” while AirPlay is selected uses the system route-selection mechanism;
changing a UI label alone does not route audio back to the handset.

WiiM Home owns room membership and stereo pairing. NaviMuse reflects group leader,
members and availability, targets the leader, and refreshes after external changes.
Show followers as group members rather than selectable independent outputs that
would require ungrouping. Transport and validated target-volume control remain in
scope; per-room mixer controls and membership editing are outside this feature.

## Repository position and evidence

Fetched `gitea-ssh` from `example-user-projects/navimuse` on 2026-09-09.

- Audited main: `3f436f3647c73bec6ca742d7f1db56962aab8633`, merge #332 artwork palettes.
  Merge #266 (shared player, Search, Library and owner Settings) is also present.
- Audited iOS pilot: `codex/ios-native-playback` at
  `feeff43f1c69820c571822e12b3c348f0beabef1`; contains native AVPlayer, Now Playing
  artwork, TestFlight build 4 records, and startup fix `6933029`. This branch is
  not merged into the audited main. Its startup-fix evidence says device retest
  pending. Deployment records were read; live deployment was not independently checked.
- Original checkout is `feature/m6-atlas-journey-actions` at `a0156b2`, with
  unrelated uncommitted milestone/design work. This plan uses a separate worktree
  and branch, `codex/wiim-integration-plan`, based on current main.
- M8 has substantial merged implementation, but merged PRs do not establish the
  final integrated/native release gate. Several status documents describe earlier
  snapshots and must not be treated as current inventories of missing code.
- Main's platform plan still describes M9 as gated; the pilot branch separately
  carries ADR-003 and ADR-004 authorizing bounded iOS work. Reconcile those records
  when integrating the pilot. Do not use this feature to redefine mobile release scope.

| Existing seam | What it means for this feature |
| --- | --- |
| `src/playerQueueState.js` | React hook owns queue, revisions, shuffle/history, edits and persistence. Extract reusable transition logic; do not create a divergent WiiM queue implementation. |
| `src/queueStore.js`, `src/queueMutations.js`, `src/queueRestore.js` | Reuse occurrence identity, mutation and recovery semantics. Local persistence is not a continuously running server player. |
| `src/main.jsx`, `src/useAudioEngine.js` | Track start/end, local audio decks and continuation remain client-driven. Remote mode must stop these from advancing or playing. |
| `src/atlasQueueTransaction.js`, `src/atlasJourneyQueue.js` | Journey attachment and queue identity must survive any later supported transfer atomically. |
| `src/playbackReports.js`, `src/mediaSession.js` | Reporting and OS controls need an explicit active-output owner. |
| Pilot `src/nativeAudio.js` and ADR-004 | Native playback presents a deck-like interface; remote playback needs a session adapter, not another simulated audio element. |
| `server.mjs`, `server/navidromeClient.mjs`, `server/navidromeRequestContext.mjs` | Media proxy and upstream access exist. Account access is request-scoped; background scheduling requires an explicit authorized principal resolver. |
| `src/AccountApplication.jsx`, `src/services/accountMusicTransport.js`, `shared/accountSession.js` | Preserve account-v1 scoped access and legacy deployment support. Queue scope is not an authorization token. |
| `deploy/docker-compose.yml`, `Dockerfile` | Existing Node container, `/data`, published 8099, and Docker service network are reusable. Docker-only service names cannot be handed to LAN speakers. |

Search of main's `src`, `server`, `shared` and `test` found no WiiM/SSDP/
SetAVTransportURI integration or Subsonic save/get-play-queue implementation.
No tests were run for this documentation-only audit; historical test results are
not asserted as current verification.

## Architecture decision to record before implementation

Add a proposed ADR for remote playback sessions without superseding the retained
WebView M8 engine or the pilot's native local engine.

```text
NaviMuse web / macOS / iOS UI
      | authenticated commands and state
      v
NaviMuse Node backend
  remote session coordinator + durable queue + WiiM adapter
      | UPnP/HTTP control                 ^ audio/artwork GET
      v                                    |
  WiiM leader -----------------------------+
      | native WiiM synchronization
  WiiM members

Backend media proxy <--- authorized Navidrome audio and cover art
```

Use Node modules inside the existing service initially. Read maintained protocol
implementations as references; do not introduce another player service by default.
Pin dependencies and inspect their licenses before adopting implementation code.

### One authority per active session

- Local/AirPlay output: existing client queue owner and local audio implementation.
- WiiM output: backend owns queue mutations, advancement, position observations
  and reporting. Client state is a read-only projection plus command dispatch.
- A session carries deployment/account/upstream identity, session ID, revision,
  generation, queue occurrence IDs, current item/position, transport status,
  shuffle/history/repeat, pause-after-current, and target leader/member identities.
- Mutations include command ID and expected revision. Serialize per session;
  reject stale edits and deduplicate retries. A physical WiiM belongs to at most
  one active NaviMuse session, including overlapping groups.
- Initial release permits one active remote session per account. Independent
  multi-zone queues and cross-account shared queue collaboration are later scope.
- Do not advance merely because a status response says stopped. Match current
  generation/URI, prior state and progress; distinguish completion, user stop,
  source takeover and network failure. Ambiguous observations suspend advancement.
- Save state atomically under `/data`. On backend restart, reconcile the observed
  device stream before resuming control; never replay a stale start command blindly.
  Lost control is not a reason to start music on the phone.

### Transfer and lifecycle contract

For local-to-WiiM transfer, validate target and media first, snapshot queue and
position, freeze local mutations and pause local audio, then start the remote
session. Commit the UI to remote mode only after playback is observed. On failure,
retain the local snapshot paused with a retry action. Accept a short handoff gap;
seamless simultaneous playback is not a v1 claim.

For WiiM-to-local transfer, obtain the latest remote snapshot, stop/release the
remote session, then restore locally paused or start through an explicit user
gesture. If stopping the device cannot be established, do not automatically start
local audio. Returning to a remotely playing session must not load the browser or
native audio deck.

App closure and browser session expiry do not terminate authorized remote playback.
Explicit logout stops/releases the originating account's remote session in v1.
Account disablement or upstream-binding revocation invalidates media grants and
stops playback where reachable. Account switch never displays the former queue.
A track/source takeover through WiiM Home or hardware input marks the session
externally controlled and stops NaviMuse scheduling; do not fight the new source.
A membership-only change in WiiM Home refreshes topology and reconciles the leader
while retaining the session where its stream identity remains established. If that
identity is lost, suspend advancement and offer reconnect; do not rebuild the group.

## Media and artwork contract

The existing cookie-authenticated stream/cover endpoints cannot be passed unchanged
to a speaker. Add dedicated read-only grants bound to account, upstream binding,
session and exact resource. Persist opaque grant records and expiry/revocation state;
use short URLs, redact grants from access logs and do not expose upstream credentials.
Allow repeat GETs and byte-range requests: single-use grants would break seeking.
Lifetime must cover track duration, pauses and prefetch; refresh before new loads.

Proposed routes (names provisional):

- Authenticated `/api/playback/outputs`, `/api/playback/sessions` and revisioned
  `/api/playback/sessions/:id/commands`.
- Authenticated state subscription, with snapshot refresh after reconnect and
  bounded polling fallback. Reuse account/native request transport.
- `/media/wiim/:grant/audio` and `/media/wiim/:grant/art.jpg` accept only a valid
  resource grant, not arbitrary upstream URLs. Route them through a distinct grant
  validator before normal cookie auth; never weaken existing media-route auth.

Resolve the account's current approved Navidrome binding for background operations;
do not capture an expired HTTP request context or fall back to global credentials.
Check authorization on grant requests and before scheduled track changes. Specify
legacy-mode identity separately so legacy and account-v1 libraries never mix.

Use an explicit LAN-reachable advertised base URL. Keep Docker service DNS for
backend-to-Navidrome traffic. Proxy audio with bounded memory, cancellation on
disconnect, correct MIME/content length, HEAD and Range/206/416 behavior. Prefer
original audio where supported; define device-specific transcoding separately from
the phone's cellular preferences. ReplayGain and local Web Audio blending do not
automatically apply to WiiM; expose only validated capabilities.

Start tracks using UPnP metadata including title, artist, album, duration and
`upnp:albumArtURI`, alongside the audio resource. Verify the selected WiiM action
accepts this on real firmware. Serve appropriately sized JPEG art with correct
content type and safe fallback; refresh per queue occurrence, including repeated
tracks. Art failure never prevents audio. Test WiiM Home, any device screen, next
track and group changes. A basic HTTP play URL is not sufficient evidence of full
metadata support.

## Device and Docker networking

Start with owner-configured device addresses and read-only capability probes.
Then add SSDP discovery with UUID-based identity, expiry and rediscovery after IP
changes. Limit device control to approved LAN devices; discovered descriptions,
callback payloads and redirects are untrusted. Parse XML without external entities
and bound response sizes. Retain normal TLS validation globally; any required
device-specific certificate handling must be constrained and tested in the spike.

Keep the current Docker network initially. Verify outbound unicast control and
inbound media through published 8099 first. UPnP event subscriptions require a
speaker-reachable callback URL; include that in the deployment contract. SSDP
multicast may not cross the existing bridge. Manual addresses plus polling provide
a useful initial fallback; choose any multicast relay or host-network profile only
after testing the actual host. Do not blindly replace compose networking, which
would also affect existing Navidrome/AudioMuse DNS access.

## Delivery sequence and acceptance gates

### Coordination with ongoing work

Track this as a separate future feature, not an additional M8 release requirement.
The planning PR changes only this document. Accepting the plan does not start
implementation or authorize deployment, and other PRs must not depend on it.

At the 2026-09-09 Gitea check, PR #285 (Atlas point UI) is open; issues #218,
#217 and #216 track M8 release/Journey/engine work, and #330 and #258 track
authentication/signing problems. Keep their scope and priorities unchanged.
The iOS pilot branch remains a separate integration dependency to reconcile.

Use one tracking issue for this feature. Add child implementation issues only
when a stage is scheduled, so speculative tasks do not crowd the active backlog.
Start W0 as isolated tooling/device evidence without edits to production playback,
account routes, main.jsx or the native bridge. Schedule W1–W4 after the current
shared-player/account and iOS changes have an agreed integration baseline.
W0 does not require completion of every unrelated M8 task.

For each implementation stage, create a fresh worktree from then-current main.
Document overlapping files and prerequisites in its PR. One owner at a time edits
the queue authority, main.jsx playback wiring, account/media routing or native
bridge. Freeze shared contracts before their consumers. Keep device-specific code
in new modules where practical, and enable production routing only behind the
feature flag after integration tests. Do not merge, rebase or repurpose another
contributor's active branch. Revalidate status when scheduling; this inventory is
a dated snapshot, not a permanent blocker list.

Each row is a bounded implementation PR or small PR stack. Land the shared contract
before its consumers. Rebase against current main and reconcile the iOS pilot at
the time of implementation; do not cherry-pick its entire divergent history blindly.

| Stage | Deliverable | Required evidence |
| --- | --- | --- |
| W0: device spike | Model/firmware inventory, read status, real audio URL, metadata/art, existing group leader, event-vs-poll assessment; native AirPlay picker probe | One track audibly plays from the Docker network; artwork observed; HTTP `OK` alone does not pass. Verify AirPlay list/route reporting on pilot iOS. Record certificate, codec and network behavior. |
| W1: contracts | Remote-output ADR, shared transitions, session/revision/lease/capability types, local adapter boundary | Existing local queue/Atlas behavior remains unchanged; duplicate occurrences and stale events handled. Coordinate with pilot native bridge. |
| W2: media grants | Scoped stream and artwork routes, background account resolver, persistent grants | Real seeking and art fetch; account isolation, expiry/revocation, malformed requests, Range and upstream failure tests. |
| W3: remote runtime | Durable session, WiiM transport/status adapter, serialized commands and reporting | Full album advances with all clients closed; pause/seek/skip/repeat/shuffle/pause-after-current work; restart and source takeover reconcile safely. |
| W4: first usable UI | Shared Play-on surface with local, AirPlay picker and direct WiiM rows; saved devices, remote state, queue commands and explicit transfer | Direct sessions keep local/native decks stopped; AirPlay routes through client engine. Verify route names, cancellation, both transfer directions, correct artwork/progress, and platform fallbacks. |
| W5: existing multi-room configurations | Discover and play groups configured in WiiM Home; display members, target leader and validated volume | Two or more real WiiMs; leader changes, first-group restart behavior, unavailable members and regrouping in WiiM Home tested. No group-configuration commands or synchronization engine in NaviMuse. |
| W6: release | Docker deployment guide, diagnostics, feature flag, migration/rollback and supported-device matrix | Sustained playback and lifecycle matrix on the release commit; local playback unaffected when feature is disabled. |

W0 answers the external uncertainties before the larger W1–W4 work. A successful
single-song prototype is not a finished integration. Estimate implementation only
after W0 and the main/pilot integration boundary are known; W3 is the largest change.

## Scope boundaries

First usable release includes ordinary Navidrome album/playlist queues, artwork,
transport/volume, app-independent advancement, reattachment and existing WiiM groups.
The app-independent guarantee applies to direct WiiM. AirPlay selection is included
through the client/platform picker. Group configuration stays in WiiM Home by owner
preference; group editing is removed from the delivery scope, including W5.

Defer mixed-vendor synchronization, arbitrary LinkPlay device support, EQ/setup
replacement, independent simultaneous zones, sample-accurate gapless and crossfade
claims. Keep local playback and AirPlay available through their existing output path.

For v1, disable transfer of an actively attached Atlas Journey or generated radio
session with a clear explanation; never silently flatten its metadata. A follow-up
must move continuation/refill and Journey events to the authoritative server session,
preserving existing contracts and degradation behavior. Ordinary selected tracks
from discovery may play remotely without claiming an attached Journey. Local-only
downloads and unsupported sources similarly cannot be handed to a remote speaker.

## Verification and rollback

Automated tests should exercise real boundaries: stale/double ended observations,
two-client command races, duplicate songs, queue mutation during next-track prepare,
ownership conflicts, account revocation and switch, expired grants during seeks,
art failure with healthy audio, upstream loss and recovery, persisted-state restart,
and failed handoff without simultaneous local/remote playback. Reuse existing queue,
account, media, Atlas and pilot startup regressions. Run full tests/build once on
the integrated candidate, plus focused tests during implementation.

Hardware acceptance: exact WiiM models/firmware, Docker host/network, Navidrome and
NaviMuse versions, iPhone/OS/build. Play a multi-track album with phone locked and
then app closed; verify at least two automatic transitions and a two-hour session.
Test WiiM Home artwork and screen artwork where present, different formats/sample
rates, seek/pause/skip, group changes, Wi-Fi loss, device restart, backend restart,
account logout and return to local output. Also test AirPlay selection/cancellation,
route loss, local/AirPlay/direct transitions (including the same physical WiiM),
current route labeling, metadata/artwork and supported-platform fallbacks. Validate
multi-room membership changes made in WiiM Home without NaviMuse issuing membership
commands. Observe actual audio as well as APIs.

Feature defaults off until configured. Disabling it stops scheduling, attempts to
stop owned streams and revokes grants; record any unreachable speaker. Durable
state uses versioned storage separate from current local snapshots. Rollback does
not migrate remote stale state over local queues or leave a second scheduler alive.

## References and remaining inputs

- [Apple AirPlay integration](https://developer.apple.com/documentation/avfoundation/supporting-airplay-in-your-app): system route picker, audio session and Now Playing integration.
- [AVRoutePickerView](https://developer.apple.com/documentation/avkit/avroutepickerview): user selection of nearby receivers.
- [AVRouting](https://developer.apple.com/documentation/avrouting): possible later unified system picker with third-party devices; separate extension/entitlement evaluation required.
- [WiiM HTTP API v1.2](https://www.wiimhome.com/pdf/HTTP%20API%20for%20WiiM%20Products.pdf): URL/playlist playback, status, seek and volume; documents unconditional OK for URL playback.
- [WiiM developer downloads](https://www.wiimhome.com/support): HTTP and UPnP interfaces.
- [Music Assistant WiiM implementation notes](https://www.music-assistant.io/player-support/wiim/): useful interoperability evidence for first-group track restart and long artwork URLs; not a runtime dependency.
- [pywiim reference implementation](https://github.com/mjcumming/pywiim): inspect pinned code and license if used as protocol reference.
- Existing ADR-001, ADR-002, master plan and pilot ADR-003/ADR-004 remain applicable.

Before W0, obtain exact WiiM models, firmware, device addresses and intended test
group; identify the actual Docker host and advertised LAN address. These are test
inputs, not reasons to block planning. No speakers were controlled in this audit.
