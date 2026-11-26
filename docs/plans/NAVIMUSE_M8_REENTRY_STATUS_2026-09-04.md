# M8 re-entry status — 2026-09-04

M8 is in implementation and verification, not release acceptance. The reassessment
started from `b94c6664b7702355202a1f17d85b130193a8f8a7`. This ledger supplements the
master plan and the historical coverage matrix; it does not waive their gates.

## Prepared corrections

These are review-branch changes, not claims that protected main or the deployed BFF
already contains them.

| Work | Evidence and state |
| --- | --- |
| Continuation-disabled Smart/Crossfade boundary | Actual App test: no prepared advance; changing the preference cancels an existing prepared deck. PR #259. |
| Shuffle/explicit additions/history | Prepared transitions and Next reserve/commit one queue decision; natural/manual boundary and exactly-once history tests. PR #259. |
| Retry position and media controls | Error at 42 seconds resumes at 42; media-key retry preserves 51; redundant Play does not initialize active audio again. PR #259. |
| Album request races | Latest album/track intent wins even when an older network response arrives last. PR #259. |
| Completed Journey recovery | Final actions remain visible; failed extension keeps the queue; retry appends a validated suffix and reopens the frozen destination. PR #259. |
| Clean-checkout test failures | Case-correct player import and signing-argument validation independent of bundle existence. PR #259. |
| PWA shell and updates | Build-derived asset manifest/cache identity, complete installation, offline navigation, dynamic chunks, failed-update isolation, API exclusion. PR #260. |
| Album track-three workflow | Album cards open track details; a selected track starts within the full source-labeled album queue; opening details does not start playback. Daily-player branch. |
| Application screen recovery | Surface boundaries retain App queue ownership and both audio nodes during failure/retry. Daily-player branch. |
| Atlas recovery | Retry map rebuilds the existing versioned renderer/projection store; queue and audio nodes remain in place. No renderer or route contract changes. Daily-player branch. |
| Compact native window | Minimum width permits the required 744-pixel desktop layout; packaged validation still required. Daily-player branch. |

The combined playback/PWA source passed 650 tests with no skips and built
successfully. The daily-player changes add rendered album/screen/renderer recovery
coverage and were visually inspected in a synthetic local fixture at desktop,
744-pixel compact, and 390-pixel phone widths. This is not a real-library or
packaged-app acceptance recording.

## Remaining implementation and scope decisions

1. Local-plus-server ordinary queue recovery: define the identity namespace and
   precedence, save mutations/checkpoints, restore paused, and repair missing tracks
   without overwriting a newer listening intent. Existing endpoints alone are not
   an implemented workflow.
2. Artist and genre browsing still needs an actionable, library-scoped detail flow.
3. Arbitrary Atlas point selection still needs an application interaction flow
   consistent with the lab-owned exact-point and renderer contracts. Current route
   stop overlays are not full background-point selection.
4. Atlas playback reporting is not proven equivalent to ordinary Navidrome reporting.
   Resolve ownership through the existing BFF/playback contract before enabling it.
5. Runtime artwork palette extraction/validation remains distinct from token-only
   tests. Audit malformed BFF payload recovery and the remaining component-state
   matrix before calling the global recovery work complete.
6. Reconcile outdated coverage rows with accepted decisions. Full-population Atlas,
   track queue actions, queue descriptors, continuation settings and lyrics have
   substantial landed implementation. Configurable transitions are accepted by the
   playback adapter decision; ReplayGain/exclusive/bit-perfect claims remain gated.
   Gated identity/passkey/trusted-device work requires an explicit accepted scope
   decision, not an inferred completion checkmark.

## Release acceptance still open

- #216: exact-candidate playback/lifecycle measurements and accepted limitations;
  preserve ADR-002's WebView decision and avoid codec-wide gapless claims.
- #217: live AudioMuse/real-track Journey lifecycle, final-stop recovery, pointer,
  keyboard and VoiceOver recording.
- #218: exact-head packaged task matrix, compact/standard/wide/PWA comparisons,
  text zoom and accessibility preferences, sleep/wake/network recovery, long
  listening/Atlas sessions, visual reference comparison and rollback proof.
- #258: the explicit login-keychain `notarytool history` preflight on September 4 still reports the NaviMuse profile missing. Restore a durable profile, followed by notarization, stapling, Gatekeeper,
  strict signing checks and release artifact checksums on the final candidate.
- Human-reviewed merges and a successful independent review on the chosen head.
  The initial review runs encountered contradictory verification output, then a
  reviewer JSON-format failure; the stacked-base review also failed to fetch its
  base. Those are recorded as review failures, not green review evidence.

Next release work should use one merged candidate for all packaged measurements.
Do not combine screenshots, signatures or recordings from different heads into an
M8 completion claim.

## September 5 continuation — library details in progress

PR #261 is merged into main at `644dcd5f9760fe6f84c1a39d72fa35096f08ec23`;
its Code Bot Review passed. Earlier failed review attempts above are historical.
The new `codex/m8-library-details` worktree starts from that merge.

Artist and genre rows now open album collections using the shared album-detail
flow. Artist results intersect upstream artist membership with folder-scoped album
pages because `getArtist` does not honor a selected music folder. Empty intermediate
pages retain the continuation cursor; genre details use scoped `byGenre` pages.
The Library surface stays mounted behind album details to preserve the collection
and keyboard opener. No playback starts merely by opening a collection.

Current local evidence: all 658 tests passed, including real-component retry,
empty-page continuation, album choice and back focus plus HTTP folder filtering.
Vite build passed. Rendered production components with synthetic data were checked
at 1280×900, 744×800 and 390×844; compact/phone document width equals viewport width,
with two-column phone and three-column compact collections. These are working-tree
checks, not packaged real-service release evidence. Independent review and merge
remain pending. The scoped genre overview now checks album membership with bounded
four-request concurrency and omits global counts rather than presenting them as
folder-local counts. It fails visibly if any required membership lookup fails.

The master plan explicitly includes local accounts, discoverable passkeys, trusted
devices and deployment policy. Historical gated coverage labels do not remove those
requirements from M8; implementation or an explicit accepted product decision is
still needed. M8 remains incomplete.
