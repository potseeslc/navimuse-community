# Sonic Atlas Projection BFF Boundary

M5.2 exposes the first production Atlas service boundary without adding client UI,
renderer integration, route planning, or queue mutation.

## Authenticated endpoints

```text
GET|HEAD /api/atlas/projection
GET|HEAD /api/atlas/tiles/:lod/:tileX/:tileY
```

Both routes use the existing NaviMuse app-session boundary. AudioMuse credentials,
internal URLs, provider IDs, titles, artists, moods, embeddings, and upstream bodies
never cross into these responses.

## Projection snapshot

The BFF fetches AudioMuse's complete `/api/map?percent=100` response with:

- configured/allow-listed AudioMuse origin;
- bearer token kept server-side;
- redirects disabled;
- 20-second timeout;
- streaming 64 MiB decompressed-body ceiling;
- strict point count, raw ID length, unique ID, and numeric-coordinate validation.

Raw provider IDs become stable keyed HMAC aliases using a settings-derived subkey.
Only `pointId`, `x`, and `y` enter the shared `sonic-atlas/v1` contracts.

Snapshot construction runs in a worker thread so a full projection cannot block
playback, authentication, or other BFF requests. One refresh is shared across
concurrent callers. Settings changes increment a generation and supersede any old
in-flight refresh; an old AudioMuse account/server can never publish after
invalidation.

## LOD and tiles

The initial deterministic contract uses:

| LOD | Grid | Per-tile selection |
|---:|---:|---:|
| 0 | 8×8 | first 128 aliases in deterministic HMAC order |
| 1 | 16×16 | first 512 aliases |
| 2 | 32×32 | complete exact-point population |

The manifest owns every tile address, exact point count, and SHA-256 digest. Tiles
must match contract/projection/manifest identity, requested address, digest, count,
and deterministic bounds. Full-detail union equals the complete projection; lower
LODs are exact-coordinate subsets.

This is a data contract, not the final renderer's production visual tuning. M5 visual
topology thresholds and renderer-interface work remain separate.

## Cache identity

Responses include content ETags derived from shared contract digests. Conditional
GET/HEAD supports exact, weak, listed, and wildcard `If-None-Match` values.

The in-memory snapshot TTL is five minutes. Identity and settings invalidation are
fail-closed; no session, credential, user, raw provider, or transport field enters
cache keys or payloads.

## Safe errors

All failures use the shared `atlas-resolution-error` envelope with fixed catalog
messages, stable codes, retryability, index-free map errors, and opaque incident IDs.
Upstream messages, stack traces, URLs, redirect targets, response bodies, and secrets
are not serialized.

## Deferred

This PR intentionally does not add:

- AudioMuse route planning;
- Navidrome stop resolution;
- client fetch/cache state;
- renderer integration;
- map labels or artwork;
- queue/Journey persistence mutations.

Those later M5 PRs import the same shared contracts and must pass independent BFF,
client, and renderer tests before M5 exit.
