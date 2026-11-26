# M8 Settings pass

Status: implementation / review candidate; not deployed or accepted.
Base: `f51a15e9e2377f90962aa9b314722a11c309333b`.
Initial tested product revision: `cbd0530c2f01e970ebeb5e89bffa7053a9fa70c2`.
Refresh follow-up: `99af14d156b6c5ca8ea08ddd47d3fd584c79fc03`.

## Scope

Settings previously left preferences editable during a save, although the incoming
saved preferences replace the draft. This allowed an edit made during the request
to disappear. The pass protects the submitted draft with a synchronous save guard,
disabled preference controls and disabled Settings section navigation during the
request. Primary app navigation remains available.

Save is enabled only for an unsaved draft. Saving, unsaved and clean states are
explicit. A false or rejected save keeps the draft and permits retry; Discard
changes restores the saved values. Editing, saving or discarding clears stale
server messages. If disabling Save lost focus, completion returns it to the
visible section heading without stealing it from another control.

The approved `m8-settings-playback.png` and Library baseline informed restrained
headings and row typography, stable dark chrome, readable phone fields and 44px
save/select controls. Existing account/service authorization and supported playback
capabilities remain unchanged. Listening preferences and account/administration are
labeled separately; this does not implement new listener-specific permission rules.

## Evidence

- 661 automated tests pass with no failures, skips or cancellations. Production
  build passes; the existing large-chunk warning remains. The old master-plan
  exact-text assertion was updated to the already-approved tab acceptance wording.
- Mounted Settings regression covers clean/dirty state, pending-control protection,
  failed save retaining the draft, discard restoring saved values, successful
  acknowledgement, rejected-request recovery and clearing stale messages.
- Production App with synthetic loopback services at port 5207 in Codex's in-app
  browser on the owner's MacBook Air. The QA service deliberately delays saves by
  1.5 seconds and rejects the first one. It stores subsequent preferences in memory
  for reload verification; this is not a real BFF persistence or authentication test.
- 1440×900: inspected full Settings composition; unchecking Continue through queue
  and saving displayed Saving and disabled all preference inputs during the request.
- Deliberate 503: the draft remained unchecked and the error allowed retry/discard.
  Discard restored the checked saved value. A second edit/save succeeded; reloading
  Settings fetched the unchecked value from the QA service with no unsaved changes.
- 744×900: inspected compact playback/streaming rows and horizontal section navigation.
- 390×844: inspected pending save, then successful completion restored focus to the
  Playback heading. Library preferences stayed readable with full-width selects.
  No horizontal document overflow was observed. Temporary viewport overrides reset.

## Refresh and active-playback follow-up

The mounted regression reproduced an additional draft-loss path: incoming saved
preferences replaced locally edited fields even when the refresh concerned an
unrelated field. Reconciliation now retains edited fields while adopting saved
changes to untouched fields. During a pending save, refresh reconciliation waits;
a failed save preserves the draft and adopts refreshed untouched fields before
retry. A successful save returns and applies canonical normalized preferences from
the parent, so server normalization cannot leave an artificial unsaved state.

At `99af14d`, the mounted test verifies an artwork-size refresh while a playback
field is dirty, a bitrate refresh during a pending save that fails, retry retaining
that refreshed bitrate, and a successful canonical blend-window correction. The
regression fails against the prior implementation. Full suite: 661 pass; production
build passes with the existing chunk warning.

Production App browser QA on port 5207: start Loved, Not Recent at A Walk, return to
Settings, change Blend window from 4 to 6 seconds and save. The active stream
`/api/navidrome/stream/0-0` remains playing from 23.738 to 39.920 seconds; the second
deck remains paused with no source. After completion, the value is 6, status is No
unsaved changes, and focus returns to Playback. Pause then stops the QA track.
This is synthetic-service media-state evidence, not real-library audible proof.

## Native integration focus follow-up

`56344df` corrects Discard focus after native integration QA showed that disabling
its button left focus on the page. A mounted regression now asserts heading focus.
The correction was verified in the actual Tauri shell with combined source
`75d281b3b8c9397f6613a11ddd112b50e3809552`: edit Continue through queue, discard,
observe the restored saved value and Playback heading focus. The isolated service
uses synthetic data; native successful persistence remains unproven. Combined
suite: 677 pass and build passes; standalone Settings suite: 661 pass and build
passes. Full integration evidence is recorded on the local integration branch in
`NAVIMUSE_M8_PASS_INTEGRATION_QA_2026-09-06.md`.

## Remaining acceptance

Native Tauri/VoiceOver and real authenticated service persistence still need proof
at this revision. Real-library playback continuity while saving, per-setting observable effects,
service credential operations and failure states, account/permission differences,
live service-refresh flows while a dirty draft exists, accessibility preferences and
measured contrast remain open. Artwork-derived appearance is still an M8 requirement,
not delivered by this typography/save-state pass. Full release QA remains open.
