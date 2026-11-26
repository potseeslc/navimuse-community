# M8 Search pass — September 6

Status: source reviewed at `1f20e6c`; native QA partially complete, not deployed or accepted. Shared-player PR #266 remains a release prerequisite. The original Home baseline was `f51a15e`; later integration and native checkpoints below pin their actual candidates.

Listener outcome: find the intended artist, album or track quickly, with predictable playback and queue actions. Retain selected-library scope and search context. Match the accepted Library typography, artwork and compact controls; no Search-specific approved image is assumed.

Request-state corrections: pending work starts at query change (including debounce), stale success/failure/finally callbacks cannot replace current state, library changes cancel old work, and malformed/service responses show an explicit Retry state instead of no matches. Queries shorter than two characters clear pending state. Query ownership moves to the App so leaving and returning to Search preserves the text.

Rendered component regression exercises a late failed old query after a successful new one, old-library results arriving after a scope change, retry after 503, clear while pending, quick-search callbacks, chosen song with result queue and album selection. Whole-App regression checks query preservation across Search → Home → Search. Full suite: 661 tests pass on this separate branch; production build passes. The pending player branch changes are not included in that count. A pre-existing exact-wording master-plan test on the main baseline was updated to require the expanded tab-pass acceptance wording, matching the pending player branch.

Still required: quiet visual composition and grouped result density; honest quick-search labels; artist-result drilldown; full-app selection/detail return/focus restoration; empty/no-match, long metadata, missing artwork and keyboard-only checks; responsive wide/compact/phone inspection; actual authenticated music playback and native VoiceOver/lifecycle QA. Preserve the M8 security, full-library Atlas and release gates.

## Artist and visual pass

Artist results with IDs now open real folder-scoped album collections through the existing library endpoint. Back to Search preserves the query/results and restores focus to the artist opener; album detail returns to the artist collection. An ID-less artist retains the explicit Search name fallback. Replaced the misleading Lossless shortcut (which only searched the word flac) with Acoustic, and show suggestions only before a query.

Added `src/searchWorkspace.css`: quiet Library-scale typography and chrome, compact artist entries, artwork-led album grid, song rows with shared queue actions, and responsive two-cover phone layout. A legacy three-column group rule initially compressed results; the Search stylesheet now explicitly stacks the groups. Phone atmosphere is neutral to match Home/Library.

Browser QA on the actual App with synthetic services at `NAVIMUSE_QA_PORT=5202 node scripts/home-app-qa-server.mjs`: inspected 1280×720 populated search, artist collection and album detail; verified Search → artist → album → artist → Search preserves Tycho and restores focus. Inspected 390×844 results and explicit 503 error/Retry state (query `error` triggers the fixture failure). This is not real authenticated or native playback evidence. The rendered regression additionally checks artistId/musicFolderId forwarding, album selection and focus restoration. All 661 branch tests pass; production build passes.

Still open: complete keyboard shortcuts across artist/album overlays, compact/short windows, missing art and long metadata, selected-result real playback and queue action QA, actual authentication/native accessibility, review/deployment and owner design acceptance. The shared-player PR remains a separate unmerged dependency for release ordering.

## Shortcut and playback follow-up

Search shortcuts are disabled while album detail or the expanded player covers the surface. In artist collections, `/` returns to results and schedules focus on the search field after the collection closes. Modified/default-prevented shortcuts are not intercepted. The rendered test exercises artist return, disabled shortcuts and modifier handling.

Actual-App synthetic playback QA: searched Tycho, selected Hours (second result), navigated Home → Search, and observed the unchanged query and source `0-1` still playing at 15.55 seconds. Opening the queue showed Search results, 20 tracks, Hours current and one played track. Pause worked. This uses the fixture's silent WAV streams; it is not live authenticated audible music or native evidence. All 661 tests and the production build pass after the shortcut change.


## Integration with deployed tabs — 2026-09-06

Merged deployed main `b74c0fb49647b277fb16b3197a852bcec9f456c7`. Search preserves
the query when switching library scope and reruns it against that scope; clearing
the listener's query is not the accepted behavior. Every new request clears the
previous results before debounce/network work, so a failed request cannot leave old
songs actionable. The mounted regression now explicitly checks the preserved input,
cleared old results during scope loading, and absence of song actions after failure.

Validation: 668 tests passed with no failures or skips and production build passed.
This integrates deployed Home/Sonic and Settings only; shared-player PR #266 remains
a release prerequisite. Live/native and owner acceptance gates remain open.


## Native real-library checkpoint — September 7

Source fix `1f20e6c` passed the required Code Bot Review. It repairs pointer-based album focus restoration by forwarding the actual clicked opener instead of assuming the WebView focuses clicked buttons. Its branch passes 668 tests and the production build.

The isolated candidate `7ae5a7f` combines this Search work with player `85271f1`; 851 tests and the build pass. Actual native checks now cover real grouped results, artist/album return paths and focus, selected-result queue membership and playback, query preservation across tabs, Play next/Add, exact Unicode, no matches, library-scope switching, and a compact presentation checkpoint. See [native evidence](../evidence/m8/search/native-real-library-2026-09-07/README.md).

This is partial acceptance. After unlocking, compact keyboard artist/album return, Queue Escape focus restoration, song/Queue/Now Playing layout, punctuation search and an actual automatic Search-queue transition passed the observed checks. An artist Retry recovered a transient failure but left focus on the document; the follow-up restores focus to the collection heading before retry begins, with a rendered regression that fails before and passes after. Native re-verification of that fix remains open. VoiceOver, phone/PWA, remaining error/session cases, owner design review and release integration remain open. Search remains behind shared-player PR266 for merge/deployment ordering, and full M8 requirements are unchanged.

Retry focus follow-up validation: all 668 Search-branch tests pass, with no failures or skips, and the production build passes. The native candidate remains 7ae5a7f until a new integrated build is tested.

## Controlled native recovery follow-up

Artist Retry focus is verified on native candidate 0e8d877 after a controlled QA-only upstream outage. Search query failure also removes stale results and recovers, but its Retry lost focus; the follow-up now focuses the query before retrying. The rendered regression fails before and passes after. All 668 Search tests and 851 integrated tests pass; both builds pass. See ../evidence/m8/search/native-retry-2026-09-07/README.md. Native query Retry re-verification remains open.

## Phone-width real-library follow-up

At 390×844 in the desktop in-app browser, real artist/album navigation, selected-track playback, album queue membership and focus/query return passed the observed checks. The pass found and fixed outer-frame scrolling that clipped the expanded player after Pause; Search now uses the same phone overflow:clip containment as Home/Library. Before/after evidence is in ../evidence/m8/search/phone-width-real-library-2026-09-07/. Both builds pass. Physical-phone/PWA and mobile accessibility/lifecycle acceptance remain open.
