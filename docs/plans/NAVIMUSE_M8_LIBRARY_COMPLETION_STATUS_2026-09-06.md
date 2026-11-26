# M8 Library completion progress

Status: implementing; not accepted or deployed.

Base: main `f51a15e9e2377f90962aa9b314722a11c309333b`.
Branch: `codex/m8-library-completion`.

## Selected playlist occurrence playback

Playlist detail titles now expose named native buttons to start that row. The
shared playback plan retains every playable entry in original order, selects the
clicked occurrence by position (including repeated song IDs), and retains the
playlist source ID and label. Invalid entries before the selection are excluded
without shifting selection to a different song. Header Play and Shuffle retain
their existing behavior. Rows without playable IDs are disabled.

Validation on this change:
- `npm test`: 661 passed, zero failed. The full App test browses fetched playlists,
  opens detail, clicks the second occurrence of a repeated song, and checks the
  full ordered queue, index, playlist source, and selected stream URL. Pure helper
  coverage also checks invalid preceding entries and invalid selected indexes.
- `npm run build`: passed; existing large-chunk warning remains.
- Production App browser flow on loopback port 5203, synthetic services and silent
  WAV media, 1280×720: click Library / Playlists / Loved, Not Recent / track three
  Daydream. Active audio URL was `/api/navidrome/stream/0-2`; the second deck stayed
  paused with no source. Home navigation preserved the URL and advancing position
  (13.17 seconds observed). Bottom transport Pause stopped it at 21.08 seconds.
  Rendered playlist rows and transport were inspected. This does not establish
  audible playback, upstream integration, complete visual approval, or native QA.

## Remaining Library pass requirements

Complete approved-reference visual checks at wide, compact, phone and short
windows, long/missing metadata, keyboard/focus and VoiceOver. Verify authenticated
album/artist/genre browsing, pagination, folder scope, and playlist create, rename,
add, reorder, remove and delete with disposable playlists. Exercise stale edits,
service failure, retry, cancellation and session expiry. Repeat core playback in
Tauri on the actual MacBook Air. Keep all tab-plan acceptance gates open until their
corresponding evidence exists.

The player PR #266 currently has a reviewer-format failure (invalid verification
JSON), so its merge gate is closed. Search PR #267 has a successful review at
`b108deff91134a5bef15d1258dbf08ddfc1e2393`; release remains ordered behind player.

## Stale playlist removal follow-up

Branch `codex/m8-playlist-edit-safety`, based on playback PR #268 commit
`ca4162b22d2df71aa157c64dab19d3536b215ce5` (Code Bot review passed).

The removal preflight now compares the complete ordered song-ID sequence, including
length and duplicate occurrences. Previously, checking only the target position
could miss an external reorder when a repeated song retained that position. A
mismatch refreshes the detail and requires another explicit removal attempt.

Validation: 662 tests and the production build pass. The full App test simulates
an external reorder with the same duplicate song still at the selected position;
it observes no PATCH, refreshed rows and the conflict message. Retrying removes
only index two, while the active four-item listening queue remains unchanged.
Helper tests cover append, removal, missing IDs and metadata-only changes.

This remains a best-effort preflight: Navidrome's API does not provide an atomic
conditional playlist update, so an external writer can still race after the read.
No claim of complete cross-client concurrency protection or live mutation QA.

## Keyboard detail navigation follow-up

Branch `codex/m8-playlist-keyboard`, based on `dadf549` (PR #269). Playlist detail
now moves focus to Back when opened. Returning to the list focuses the newly
rendered summary for the original playlist, falling back to the create-name field
if that playlist no longer exists. This uses current element refs because the
original summary DOM node is unmounted while detail is displayed. Canceling delete
confirmation restores focus to Delete; Escape also cancels while no mutation is
running.

Validation: the six focused App/playlist-wiring tests pass and the production
build passes. The full App regression asserts detail entry focus, Escape behavior,
and focus on the recreated summary rather than the detached original node.
Browser QA on the production App with loopback synthetic services (port 5204)
used Enter to open Loved, Not Recent, observed Back focused, used Tab to reach
Delete, Enter to open confirmation, Escape to cancel, and Enter on Back to return.
DOM observations confirmed Delete focus after cancellation and summary focus on
return. No delete request was submitted. VoiceOver and native authenticated
keyboard testing remain unperformed; this is not acceptance of the Library pass.


## Integration with deployed tabs — 2026-09-06

The keyboard branch now includes deployed main
`b74c0fb49647b277fb16b3197a852bcec9f456c7`, retaining the playlist playback and
stale-edit prerequisites (#268/#269). This does not bypass their release ordering
or the shared player and Search prerequisites.

Advisory checks against source:

- `main.jsx` imports `shuffled` from `discoveryPlayback.js`; the third argument to
  `playlistPlaybackPlan` is that function, not a boolean prop.
- Playlist summary callback refs repopulate the ID map when the list remounts. The
  mounted App test verifies focus reaches the recreated button and that it differs
  from the original unmounted button. Delete-confirmation cancellation separately
  returns focus to Delete while detail stays open.
- The same App test checks duplicate-occurrence playback, rejects stale removal
  without a PATCH, retries against refreshed order, and preserves the playing queue.

These are fixture-based regressions. Real-service playlist mutation, authenticated
listening and native VoiceOver remain acceptance work.

Integrated validation: 669 tests passed without failures or skips; production build
passed. Logs: `/tmp/navimuse-library-current-main-tests.log` and
`/tmp/navimuse-library-current-main-build.log`.

## Integrated refresh correction — 2026-09-07

Integration with account/player/Search candidate 24dfcb3 exposed a detail-lifecycle
bug: playlist summary invalidation unmounted the manager during loading, losing
its edited detail. Keep the manager mounted for same-scope refresh and key it by
library scope; suppress initial empty messaging while loading. The regression
holds the summary response open and checks the edited detail remains visible.

All 896 tests passed on the integrated application fix; the final strengthened
App regression and production build also passed. On this PR branch all 14 focused
playlist/App checks and production build passed. Logs:
/tmp/navimuse-playlist-keyboard-refresh-focused.log and
/tmp/navimuse-playlist-keyboard-refresh-build.log.
Exact integrated implementation: 026a81c. Required review reruns on this PR's new
head; prior-head green checks do not authorize merge. Live/native playlist QA and
the ordered prerequisites remain open.

Live track-removal QA found BODY focus after removing the final row. This update
restores focus to the next surviving Remove control, preceding tail, or Back when
empty, after busy state clears. Mounted regression covers each target and preserves
the listening queue. It passes on this branch and all 896 tests/build pass on the
combined Library candidate. Fresh required review and live verification remain.
The prior investigation confirmed the earlier Back/Escape blockers were incorrect;
its advisory success does not substitute for the required Code Bot Review.
