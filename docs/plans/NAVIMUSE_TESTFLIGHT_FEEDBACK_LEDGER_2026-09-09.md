# TestFlight feedback ledger and repair plan

Updated September 9, 2026. Owner requested all TestFlight feedback, including older
outstanding reports, be consolidated and tackled before the next release.

## Audit boundary

Fresh App Store Connect review completed after the Mac was unlocked: the screenshot
list was read from the latest September 9 reports through the oldest Build 2
entries. Crash Feedback currently says **No Crash Feedback**. New screenshots for
radio feedback, shelf loading, the header, remote indicator and AirPlay were
visually inspected. Historical screenshots are backed by earlier review records;
not every older image was reopened in this pass.
Build 9 is the latest known distributed native shell. It loads the live web UI;
a deployed frontend fix does not imply a new TestFlight binary exists.

Keep individual report IDs, submitted dates, build/device, screenshot evidence,
resolution commit, verification and owner acceptance when adding reports. Group
duplicates under one defect, but retain their references. Earlier reports remain
open unless later evidence specifically resolves them.

## Delivery plan

1. **Audit and stability.** Read every screenshot/crash report, reconcile with this
   ledger, and prioritize reproducible failures. Recheck startup, session recovery,
   and WiiM transfer against the deployed build. Capture cause before changing the
   audio engine. Preserve other services during deployment.
2. **Output selection and feedback.** Repair AirPlay tap handling, show the active
   WiiM output in mini/full player, and verify discovered leaders/followers and
   explicit return to local playback. Test native picker and browser fallback
   separately. Simplify the player toolbar as requested.
3. **Playback integration.** Investigate clipped AirPlay introductions with exact
   track, transition type and route evidence. Assess supported iOS hardware-volume
   integration for WiiM Direct separately from system AirPlay volume. Do not map
   arbitrary system-volume changes to household speaker volume without a proven
   ownership/lifecycle design.
4. **Regression and release.** Run relevant automated suites and production build;
   inspect portrait/landscape, keyboard and real native behavior; let Code Bot
   review the exact PR head. Deploy web fixes after review. Build/upload a new
   native version only for native changes and verify Apple distribution. Provide
   the owner a short QA checklist tied to the shipped revision. M8 stays open.

## New and outstanding items

| ID | Feedback / evidence | Status and next action | Pass condition |
|---|---|---|---|
| TF-01 | Build 9 AirPlay button does nothing. Report `AM0eZv3oKFTOx2ABAFGTFO8`, Sep 9 10:42 PM shown by App Store Connect; iPhone 17 Pro / iOS 26.6.1. | Local repair: inline AirPlay text was a non-clickable span. Make it a real button using the existing native presentation command, preserve the direct native icon, and show errors. The label opens the existing intermediate native sheet; eliminating that extra step for the label remains native work. Screenshot confirms local output was selected and the AirPlay row was present. | Icon opens system routes on device; label provides a functioning accessible path; browser picker/fallback works; active WiiM must be explicitly released first. |
| TF-02 | Build 9 cast icon should be accented during WiiM playback in full and mini-player. | Local repair: pass explicit remote-session state to both controls, use existing accent. Do not infer AirPlay route from a WiiM session or playback rate. | Both icons remain accented while remotely playing or paused; return local removes accent; tap still opens outputs. |
| TF-03 | Build 9 Now Playing header off center; owner permits removing redundant title. | Local repair: remove Now Playing/NaviMuse text and use a two-column toolbar. | Queue, lyrics, cast and close remain reachable without collision in portrait, landscape and desktop. |
| TF-04 | Phone hardware volume buttons do not control WiiM Direct. | Open native investigation. In-app remote-volume path exists; system output volume and server-owned speaker volume are distinct. | Supported behavior verified on device across foreground/background, output change and min/max; no unintended phone or other speaker volume changes. |
| TF-05 | Clipped song beginnings, clarified by owner as AirPlay (Build 6 report). | Open; need a physical trace distinguishing manual start from natural transition and first-route startup. Native session already uses long-form audio policy. | Repeated affected album transitions include the beginning, with no duplicate start, silence injection or regressions on Bluetooth/local playback. |
| TF-06 | White/failed startup on cellular; later Build 9 failed-load/Retry screenshots. | Recovery UI shipped. Latest outage coincided with unresponsive Docker; all 32 prior containers restored and critical service checks passed. Underlying failure cause remains unconfirmed. Crash Feedback previously empty; recheck new reports. | Cold/warm startup and retry on Wi-Fi/cellular; correct offline/server-down handling; no recurring unexplained failure during sustained use. |
| TF-07 | WiiM transfer “Load failed” / “NaviMuse request failed.” | Lost-response reconciliation and host transport shipped; owner reports playback works after service recovery. Remains regression QA, not proven universal resolution. | Transfer, pause/resume, skip, reconnect and local return preserve one playback owner; lost response never starts simultaneous audio. |
| TF-08 | Only bedroom appears; expected network discovery. | Host LAN discovery and bridge shipped. Two advertising speakers found (bedroom and living room); other expected devices not yet verified. | Available network speakers discovered without restart, followers clearly labeled, offline entries truthful, changing IP retains identity/pin. |
| TF-09 | WiiM AirPlay artwork absent despite lock-screen art. | Still unverified for AirPlay. Owner confirmed artwork for **WiiM Direct** audition only. | Artwork on receiver updates across tracks using AirPlay, separately from phone and direct playback. |
| TF-10 | Output dialog too large / inconsistent design; extra AirPlay page. | Compact sheet and cast icon shipped; native icon embedded in Build 9. TF-01 reopens interaction acceptance. | Compact app-matching sheet plus working device selection on installed app and web. |

| TF-11 | Build 9 “Loading shelves not working,” screenshot 10:52 PM; recent shelf loading, newest shelf Retry. | Reopened. Live container probes at offset 18 returned 18 albums for both recent (137 ms) and newest (1,668 ms). Logs contain 502/504 but do not identify which endpoint; cannot attribute them conclusively to shelves. Need authenticated reproduction and bounded request diagnostics. | Both shelves append multiple pages, retry failures, and recover without duplicate/stale albums. |
| TF-12 | Build 9 “Radio feedback and all feedback should syncs to the server.” Report `AMcsHi7TV2GeW1M-inr19yg`, 10:57 PM, uptime 29 minutes. Screenshot confirms local-only radio feedback notice. | Implemented candidate: account-scoped persistent station favorites/ratings in the BFF, load on sign-in, sync new edits with rollback and account isolation. Existing local-only ratings are retained locally but are not bulk-migrated; edit them once to save them on the server. Ordinary song feedback already uses Navidrome. Do not place all users’ ratings in global settings. | Favorite/rating persists across fresh browser and native sessions; failed writes show rollback; one account cannot read another’s feedback. |
| TF-13 | Build 9 transient visual error on initial screen load, later self-corrects. Report `ACEKltw0LX_R9IRa3h8Um18`, Sep 9 10:26 PM. Screenshot reopened: owner circles the AirPlay row spacing in the output sheet. | Prior PR 339 bounded the native route slot; current portrait fixture has a compact row. Native cold-load and rotation acceptance remains open. Keep separate from server outage and native crash claims. | No transient overflow or overlay collision at cold load, after fonts/art resolve and after rotation. |
| TF-14 | Build 7 landscape layout “degraded,” annotated desired artwork/player regions. | Reopened owner acceptance despite earlier synthetic QA. Compare screenshot in real native safe-area viewport; do not close based on desktop rotation alone. | Native landscape maximizes artwork left and controls right without clipping or desktop mini-player intrusion. |
| TF-15 | Build 5 request for more streaming formats and actual delivered format instead of source/request confusion. | Open delivered-signal evidence work; source metadata and requested encoding are not proof of bytes delivered. | Supported upstream formats exposed and delivered metadata verified or explicitly unavailable. |
| TF-16 | Build 3 scrubbing works but blue focus box remains. | Keep touch focus styling distinct from keyboard-visible focus; verify latest ProgressRail. | Touch scrubbing has no persistent artifact; keyboard users retain visible focus. |

## Earlier reports and resolution evidence

“Shipped; QA open” is not owner acceptance. Refer to the linked evidence for the
original implementation scope and test limits.

| Feedback | Latest known disposition | Remaining check |
|---|---|---|
| Lock-screen ten-second controls / car track buttons | Native audio integration shipped; owner explicitly confirmed track buttons work well. | Keep next/previous in release regression matrix. |
| In-app pause not stopping audio despite lock-screen pause working | Build 6 native toggle uses native playback truth; automated stale-state checks pass. | Recheck mini/full controls on latest shell, including remote output. |
| Locked/background playback and glitchy stop/start | Owner confirmed improvement before native pilot; subsequent native changes require regression. | Locked play/pause, app switching, phone speaker, AirPods, Tesla Bluetooth, AirPlay. |
| Player top overlaps status bar | Native safe-area fix shipped. | All tabs and landscape on latest shell. |
| Excess bottom player space | Responsive player spacing shipped. | Current compact/tall phone and landscape visuals. |
| Album track list frozen / cannot scroll | Earlier library repair; do not drop from regression. | Long real album scrolls and selects tracks. |
| Timeline tap works but drag does not | Pointer scrubbing shipped with gesture/keyboard tests. | Device scrub and cancel in full/mini-player. |
| Artwork falls back when advancing within same album | Earlier artwork repair; receiver artwork remains separate. | Consecutive album tracks, foreground and locked, retain correct art. |
| Lyrics missing | Navidrome source integration subsequently enabled with owner authorization. Earlier “awaiting provider choice” records are historical. | Synced and plain/missing lyrics have correct behavior. |
| Lyrics neither highlight nor follow, but tap seeks | Follow repair subsequently shipped; owner responded “boom.” | Highlight/scroll continue after seek and native track advance; manual scroll escape works. |
| Radio stations fail to play | Bounded PLS/M3U resolution shipped in Build 6; live audio-byte probes passed. | Actual saved station plays and fails/retries clearly. |
| Radio needs full-screen station browser | Responsive sheet shipped with scroll/focus checks. | Phone search/add/dismiss and keyboard navigation. |
| Radio title/art metadata absent | Source-provided ICY metadata and source artwork handling shipped. | Compare stations that publish metadata versus legitimate fallback; no invented artwork. |
| Home/Library fixed page counts | Incremental loading and retry shipped. | Real long lists continue loading; folder change cancels stale requests. |
| Landscape player composition | Two-column layout and rotation behavior shipped. | Rotation during local and WiiM playback, short landscape viewport. |
| Previous on first song | Restart behavior shipped, including native command. | First-track restart rather than inert button. |
| Artist Journey picker overlap | Dedicated responsive rows shipped. | Long artist names and action buttons on phone. |
| Track/artist Journeys | Controller feedback and seed/related-track tests shipped. | Owner sustained Journey continuation still needs confirmation. |
| Favorites synchronization chatter | Removed; rollback/error feedback retained. | Failed favorite edit still visible. |
| Continue Listening / service chatter on Home | Removed in earlier pass; service diagnostics kept in Settings. | No unwanted home status blocks. |
| Album title focus outline on touch | Touch/programmatic outline suppressed; keyboard focus retained. | Keyboard indicator remains visible. |
| Wi-Fi/cellular stream quality | Native network class and local preferences shipped in Build 5. | Change network, start new track, confirm requested quality persists. |
| App icon unexpectedly changed | Build 9 approved radio-tower icon; generation made mandatory in build command. | Verify icon in every subsequent IPA before upload. |

## Evidence and current candidate

Candidate branch: `codex/testflight-feedback-ledger`, based on `6cd9341` (PR 339).
Candidate changes; **not yet deployed or accepted on device**.

- 67 focused tests passed, including actual React AirPlay label interaction,
  native-command failure messaging, remote ownership protection, WiiM lost-response
  reconciliation and player integration.
- Production Vite build passed. Existing large-chunk advisory remains.
- Fresh feedback-list audit complete; portrait fixture visually checked at 402×874. Native on-device interaction remains owner QA.
- AirPlay label fallback intentionally uses the already-shipped native sheet;
  this is not proof that the embedded native icon works on hardware.

Historical evidence: [Build 2 feedback](../evidence/m8/ios-feedback/README.md),
[Build 5](../evidence/m8/ios-feedback-build5/README.md),
[Build 6](../evidence/m8/feedback-foursteps/README.md),
[WiiM / Builds 7–9](../evidence/m8/wiim-release/README.md).

Apple API references for native follow-up:
[AVRoutePickerView](https://developer.apple.com/documentation/avkit/avroutepickerview)
is the public route selection control;
[outputVolume](https://developer.apple.com/documentation/avfaudio/avaudiosession/outputvolume)
and [MPVolumeView](https://developer.apple.com/documentation/mediaplayer/mpvolumeview)
describe system output volume, not the BFF-owned WiiM Direct session.

### Candidate verification update

Fresh feedback list and Crash Feedback were checked after unlock. Full test run:
1,026 tests, 1,023 passed, three failed. Failures were an outdated three-column
header fixture, a source assertion requiring the old local-only radio behavior,
and a new HTTP test that incorrectly assumed the existing custom-header CSRF
boundary rejected an Origin header. The fixture/assertions were corrected; all
three affected tests passed. The HTTP test now proves writes without the required
custom header fail. Final focused run: 66 passed; production build passed.
Portrait full player and mini-player were visually inspected at 402×874. Native
AirPlay presentation still needs physical QA. No household audio was started.

Radio feedback persistence is per verified account/upstream binding under
`/data/radio-feedback`, with atomic mode-0600 files and a 500-station cap per scope.
Only existing Navidrome stations may be edited. Ordinary track feedback remains
in Navidrome. New station edits sync across future sessions; bulk migration of
previously local-only radio feedback and live cross-device refresh remain follow-up.

For shelf recurrence, ordinary server failures now identify the fixed category
`album-page`, `library-bootstrap` or `station-feedback` where applicable. Query
strings, song identifiers, credentials and exception text remain excluded. This
improves diagnosis and is not claimed to fix an unreproduced shelf failure.

Final full regression: **1,027 passed, zero failed or skipped** at `cf154e1`.
The production image built successfully. Initial independent review failed its
JSON output contract; no app defect was established by that result. A fresh
review is required before deployment.

## September 11 update — 79 reports

Eight new reports were retrieved after the 71-report audit. Opus display was
explicitly accepted (#387 closed). The remaining seven are mapped to #345, #109,
#118, #389, #390, #391 and #392 in the
[Build 15 change and verification record](../evidence/m8/testflight-build15/README.md).
That record distinguishes implemented repairs, device acceptance and additional
DJ modes that remain open. Master tracking issue: #343.
