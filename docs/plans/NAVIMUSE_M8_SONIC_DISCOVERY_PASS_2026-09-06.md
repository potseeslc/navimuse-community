# M8 Sonic discovery pass

Status: implementing / review candidate; not deployed or accepted.
Base: `f51a15e9e2377f90962aa9b314722a11c309333b`.
Tested product code: `65ae00d977040134b4babcab9ad50dfff714ef31`.

## Finding and change

The previous Sonic page placed a large hero and four static feature descriptions
before its working controls. Long Builds, Quiet Intros and High Energy all called
`audiomuseClapStats`; they did not produce music selections. The new layout removes
that redundant introduction and presents one explicitly labeled AudioMuse status
action. Lyrics search, smart playlists, radio/Journey seeds and the existing
non-map planner retain their actual service-backed actions. No map, route, queue,
or authentication contract changed.

The approved Cinematic Focus `discover.png` and the deployed Library pass informed
restrained headings, row density, borders and action hierarchy. This is the discovery
tools portion of Sonic; it does not claim to deliver the reference's music shelves
or accepted full-library Atlas composition. Actual recommendations and the map
remain separate unfinished work, rather than being represented by invented cards.

Discovery failures now have retry actions. Back/Escape cancels the request and
restores focus to its entry point. Retry restores focus when its loading state
removes the focused button, without stealing focus from the player or planner.
Artist Journey and Artist DJ remain distinct, with readable compact/phone actions.

## Verification

- Full suite: 661 tests pass, no failures/skips/cancellations. Production build passes
  with the existing large-chunk warning. Four old source assertions were adapted to
  the changed markup; the master-plan assertion now recognizes the already-approved
  tab acceptance wording. Its obsolete exact phrase also failed on the starting main.
- New mounted React behavioral coverage proves status-only semantics, request retry,
  Back/Escape focus restoration, cancellation and suppression of late results.
- Production App with synthetic loopback QA services on port 5206, Codex in-app
  browser on the owner's MacBook Air. Visual inspection at 1440×900, 744×900 and
  390×844. Compact artist action wrapping found during QA was corrected and checked
  again. Phone keyboard traversal reaches Artist DJ with visible focus; no horizontal
  document overflow was observed. Temporary viewport overrides were reset.
- Loved, Not Recent starts its ten-track playlist at A Walk. AudioMuse's intentional
  503 exposes an error and Try again while the same media element continues at
  7.57 seconds; the other deck is paused with no source. Retry does not reset it.
  The playlist subsequently advances to Hours. Fixture audio is a silent WAV;
  this proves media state, not audible output or real authentication.
- Back/Escape restores the AudioMuse status entry; artist results render with
  separately labeled Journey and Artist DJ actions. The phone retry flow restores
  Back to discovery focus and keeps the error controls reachable above transport.

## Home consistency follow-up

Product revision `6538b3f40bcb20531994fa734cdd845edfc3f6a2` applies the same truthful
status action to Home's separately rendered AudioMuse section. Home no longer
advertises Long Builds, Quiet Intros or High Energy as music picks. It preserves
the Home AudioMuse visibility preference and adds retry, cancellation and Back/
Escape focus restoration through the shared result component.

The mounted Home regression checks successful status output, no playback callback,
503/retry, canceled late response suppression, focus restoration and preference
visibility. Full branch suite: 661 pass; production build passes with the existing
chunk warning. Browser QA at port 5206 shows Hours continuing at 27.98 seconds
through a status failure/retry with the second deck paused and empty. At 390×844,
error/Back/retry controls remain visible above transport, with no horizontal
page overflow; the playlist has advanced normally to Daydream. Escape closes the
panel and restores the status button; the temporary viewport override is reset.

Native Tauri fixture check uses local combined source
`dce7192c257becc299102a0692279fee13af072e`, loaded from port 5205 by the isolated
NaviMuse M8 Integration QA shell. Home displays one status action. The deliberate
503 focuses Back, retry retains that focus, and Escape restores Check AudioMuse
status. Dive stays paused at 0:54 throughout. This reuses the previously recorded
ad-hoc shell; it is not a final packaged-assets or authenticated real-service test.

## Open acceptance

Native Tauri and VoiceOver checks for this revision, authenticated real-service
workflows, measured contrast and accessibility preferences, real full-library Atlas
selection/rendering/Journey lifecycle, sustained device evidence and owner visual
acceptance remain open. This branch is independent of the held player/reorder PRs;
release order and those review gates still apply. No deployment or main merge is
implied by this evidence.
