# ListenBrainz web integration

Status: web implementation complete; release verification in progress. Branch codex/listenbrainz-web, base Build 41 source 6fb6491.
Owner request September 13, 2026: charts/graphs from existing scrobbles and a
ListenBrainz-driven discovery experience separate from AudioMuse/Sonic.

## Product shape

A dedicated ListenBrainz area with two views:

- Your listening: recent history, top artists/albums/tracks and an activity chart.
  Start with this week, this month, this year and all time; label API calendar
  ranges precisely, not as rolling 7/30/365 days. Provide accessible data lists.
- Discover: Weekly Exploration and Weekly Jams cards, generation dates, playlist
  previews, library match counts, Play available and Add available to queue.
  Keep unavailable recordings visible with an external ListenBrainz link.

A Home entry can open the area without expanding the crowded mobile tab bar.
Keep ListenBrainz branding/source labels visible. Never silently fill a sparse
ListenBrainz mix with AudioMuse results or enable Sonic/Autoplay generation because
this source was selected. Reuse existing playback and queue authority for matched
Navidrome tracks; respect remote-output ownership.

## Connection and boundaries

The provided public profile is https://listenbrainz.org/user/example-listener/recommendations/.
Use an account-scoped username preference, not a deployment-wide hardcoded account.
Public statistics/recommendation reads are the first release; no token was needed
for the owner's verified calls. An entered public username is not proof of account
ownership. Any future authenticated writes/private data require a proper link flow.
Keep the existing Navidrome scrobble submission path: no second ListenBrainz writer.

## Verified live data

On September 14 UTC (September 13 Mountain), public API calls returned fresh
Weekly Exploration and Weekly Jams playlists dated September 14, plus an older
Exploration playlist. Current Exploration contains 50 recordings. Top-artist and
listening-activity statistics are available. Keep exact user payloads in local QA
artifacts, not repository fixtures.

Recommendation list responses intentionally omit tracks; fetch playlist detail.
Select current playlists by source_patch and date, retaining older lists only as
history. Handle expires_at and stale/missing playlists explicitly.
Listening activity can include both previous and current periods: filter/chart
using the requested calendar range and returned timestamps rather than summing
all returned rows under a current-month heading. Show last_updated per dataset.

## Implementation sequence

1. Read-only client foundation implemented in server/listenbrainz/client.mjs.
   Five mocked tests pass: fixed host, no credentials, no-data versus zero,
   input validation, and serialized calls respecting rate-limit cooldown headers.
   Instantiate one shared client per BFF process. Multi-process deployments need
   shared request coordination. Add bounded per-user/range cache and in-flight
   deduplication before exposing UI requests. No retry loops on rate limiting.
2. Add authenticated BFF routes and account-scoped profile preferences, clear client
   state on account changes, and schema-normalize upstream data. Return independent
   section states so unavailable recommendations cannot hide working statistics.
3. Build the listening view using existing design tokens, lightweight SVG/CSS
   charts, keyboard-accessible data and responsive compact/expanded layouts.
4. Resolve playlist recordings within the authenticated library. Prefer exact
   MusicBrainz recording IDs when the server exposes them; inspect actual library
   metadata first. Conservative artist/title/album/duration matching is a fallback,
   never an unconditional fuzzy first hit. Disambiguate live/remix/remaster versions.
   Return matched, ambiguous and unavailable separately. No bulk whole-library
   export to ListenBrainz, downloads or external audio sources.
5. Enable explicit play/enqueue using ordinary existing transport paths. Preserve
   ListenBrainz order, suppress duplicate library IDs, skip unavailable with counts,
   and never autoplay on fetch/refresh. Verify direct speakers and local queue.
6. Validate real profile data, partial failures, account switching, cache staleness,
   no-data state, local-library match quality, reduced motion and narrow/wide UI;
   merge/release through normal PR workflow. Web first; no TestFlight upload needed.

## API references checked

- https://listenbrainz.readthedocs.io/en/latest/users/api/statistics.html
- https://listenbrainz.readthedocs.io/en/latest/users/api/core.html
- https://listenbrainz.readthedocs.io/en/latest/users/api/playlist.html
- https://listenbrainz.readthedocs.io/en/latest/users/api/index.html
- https://listenbrainz.readthedocs.io/en/latest/users/api/recommendation.html

Use generated public playlists first; the raw collaborative-filtering API is
experimental. API policy requires at most one call per second per application,
rate-limit headers, and a descriptive contact-bearing User-Agent. Stats generation
can lag; missing/generated-later data must never render as zero listening.


## Implemented web release

Settings → Integrations → ListenBrainz and the Home listening link open the new
surface. Each verified account/music binding stores its own username and revision
in a private atomic file. Public profile association does not assert ListenBrainz
ownership or enable writes. Disconnect invalidates cached and in-flight results.

The dashboard includes UTC calendar activity, top artists/tracks/albums and recent
listens. Sections load independently; missing statistics and request errors are
explicit. Discovery shows the latest supported playlist per algorithm, generation
and expiry dates, and bounded library matching. A unique recording MBID or exact
artist/title/album with close duration is required to enable playback. Missing,
ambiguous, duplicate and failed matches remain visible. Explicit play/enqueue uses
the existing local and remote queue, with ListenBrainz provenance suppressing
AudioMuse refill on a ListenBrainz playback queue. Adding to an existing queue
preserves that queue's source/settings.

Verification: live public profile/statistics and playlist API reads passed. Focused
client/service/UI tests cover account isolation, stale responses, private cache
keys, rates/cooldowns, origin restrictions, recording ambiguity, UTC activity and
remote source preservation. Full regression run: 1,250 tests, 1,249 passed, one
outdated expected source-kind list; expectation updated and rerun separately.
Browser fixture verified desktop and 402×874 layouts, no horizontal overflow,
discovery previews and enqueue feedback. Fixture playback used callbacks, not real
speaker audio. Physical playback remains owner acceptance.
