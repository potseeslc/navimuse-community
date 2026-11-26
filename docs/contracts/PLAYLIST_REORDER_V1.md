# Playlist reorder v1

Status: API merged in PR #271. Library UI implemented in PR #321, held for ordered prerequisite acceptance and remaining native QA.

M8 Library requires saved-playlist reordering. The existing PATCH route accepts a
new exclusive operation:

```http
PATCH /api/navidrome/playlists/{playlistId}
Content-Type: application/json
X-Requested-With: NaviMuse
Cookie: <existing authenticated session>
```

```json
{
  "reorder": {
    "version": 1,
    "expectedSongIds": ["a", "b", "a"],
    "order": [2, 0, 1]
  }
}
```

`order` is a permutation of the original zero-based occurrence indexes, not song
IDs. The example moves the second `a` first and yields `["a", "a", "b"]`.
No occurrence is added, lost, or deduplicated. Up to 10,000 entries are accepted,
subject to the playlist PATCH JSON body limit of 1,000,000 characters. Other
JSON endpoints retain the existing 100,000-character limit. IDs must be nonempty
strings, at most 512 characters, without control characters.

The BFF authenticates and checks the write-origin header before parsing. It
validates the permutation and checks that the upstream advertises `formPost` v1.
It fetches the current playlist and compares the complete ordered IDs with
`expectedSongIds`. An identity permutation returns the fetched playlist without a
write. Otherwise it makes one form POST to `createPlaylist` with `playlistId` and
one repeated `songId` per occurrence. It never clears and then appends entries,
and never submits metadata fields such as name, public visibility, or comment.
Authentication and API parameters go in the form body rather than a long URL.
The response must confirm the same playlist ID and requested entry order.

Success: `{ "ok": true, "playlist": <normalized upstream playlist> }` after a
write; a no-op returns `{ "playlist": ... }`, matching existing detail reads.
The client should use the returned detail, preserve focus on the moved occurrence,
and leave the listening queue untouched. Do not retry a mutation automatically.

Failures:
- 400: invalid version, shape, IDs or permutation; mixed operations also rejected.
- 401/403: existing session and write-origin protections.
- 409: current entries differ from the expected list. Refresh and ask the listener
  to review before another explicit attempt.
- 413: request body exceeds its bound.
- 501: upstream does not advertise form POST support.
- 502/504: upstream failure or timeout; an unconfirmed resulting order returns 502
  with instructions to refresh. A timeout may occur after the upstream committed.

This is a best-effort stale-read guard, not an atomic conditional update. Navidrome
exposes no such write primitive; another writer can race between the read and
replacement. Live disposable-playlist checks, upstream metadata preservation,
concurrent-client behavior, UI state/focus, and native QA remain acceptance work.

Protocol sources:
- https://opensubsonic.netlify.app/docs/endpoints/createplaylist/
- https://opensubsonic.netlify.app/docs/extensions/formpost/

Validation includes a real HTTP BFF and isolated upstream stub: session and header
rejection, malformed permutations, missing form support, stale lists, repeated
IDs, metadata retained in the response, one form replacement, a 3,000-track list
crossing the old JSON/header limits, and upstream write failure.

On the implementation branch based on main `f51a15e`, all 661 tests and
`npm run build` pass. This count excludes the separate unmerged player and Library
branches; combined-release regressions are still required after integration.

## Current account-boundary integration — 2026-09-07

Integrated main b14fea1. Reorder now uses the request-captured private Navidrome
client for both extension discovery and form POST. The client admits extension
discovery and an explicit boolean formPost option only for createPlaylist; custom
headers are prohibited on that path. Authentication parameters move into the form
body, duplicate songId fields remain repeated, redirects remain manual, cancellation
and sanitized transport errors remain intact. Existing GET/media behavior remains.

109 focused HTTP/private-client checks pass, including captured credentials across
configuration mutation and rejecting form POST on other endpoints. All 883 tests
on this main-based prerequisite branch and the production build pass. Logs:
/tmp/navimuse-reorder-current-focused.log, /tmp/navimuse-reorder-current-full.log,
/tmp/navimuse-reorder-current-build.log. Combined Library integration is separate.
The prior review-scope hold requires a fresh exact-head review of these changes.
