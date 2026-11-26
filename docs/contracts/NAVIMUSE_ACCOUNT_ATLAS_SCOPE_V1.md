# Account-scoped Atlas access v1

Baseline: NaviMuse `23cefe74d819dc73b54706b7c0cd1a7bdd1c4b60`.
Lab authority: `390d302`, accepted ADR-002 bounded Branch B. This changes private BFF
access/lifecycle only; point-cloud and bounded Journey payloads and renderer are unchanged.

`openLocalAccountRuntime` now exposes `withAtlasRequest(req, operation)` alongside
`withUpstreamRequest`. Both use the canonical origin boundary and the short session
cookie. Atlas first runs the existing atomic session/binding authorization. Account
IDs, queue scopes, point IDs and dataset IDs supplied by a browser never authorize it.
The private upstream callback now includes the verified binding's serverId and exact
username; these are not added to the public session response.

A trusted startup `atlasDatasets` grant has exactly these fields:

- `serverId`: the approved Navidrome logical UUID.
- `username`: the exact approved upstream username, including case.
- `datasetId`: a stable operator-assigned UUID for the authorized projection source.
- `revision`: a positive integer; increment when changing the dataset grant or source.
- `grantFullProjection`: explicitly true, authorizing this identity to see the entire
  configured projection. This is an operator policy grant, not an inferred claim that
  Navidrome independently verified every point. Do not use it for a restricted subset.
- `fetchMap`, `planSegment`, `findSimilar`: private server functions captured against
  that dataset's immutable service configuration. No browser URL/token fields, no
  mutable global configuration resolvers, and no cross-dataset fallback.

There may be at most 256 grants, with one per exact server/username pair. Empty grants
are the default: valid music access returns ATLAS_UNASSIGNED for Atlas without affecting
ordinary music. The runtime accepts trusted function adapters; deployment file loading
for these AudioMuse adapters remains integration work. Nothing auto-grants the legacy
service's global map. A subset account needs an independently authorized subset dataset
and its own grant before Atlas is enabled; this implementation does not filter a global
map by guessing membership or checking only the selected song.

Each cache is keyed by the verified queue scope, binding revision, dataset UUID and
dataset revision. Separate HMAC domains derive point aliases, Journey aliases and
AES-GCM track-reference keys from the persistent server secret. Different accounts
cannot resolve each other's aliases or decrypt references even if they share a dataset.
A credential/binding revision invalidates the prior spatial namespace. Dataset content
changes still use the existing projection digest and TTL machinery. Restart with the
same account, binding, dataset revision and persistent secret preserves identity.

The cache pool holds at most four scopes by default (`atlasMaxScopes`, 1–16). Idle
entries are evicted in least-recently-used order. Active operations cannot be evicted;
if all slots are active, a new scope receives ATLAS_BUSY. Errors release active slots
and return ATLAS_UNAVAILABLE without private service details. Every new operation must
reauthorize, even on a warm cache. An already authorized operation uses its captured
snapshot; revocation cannot retract data already dispatched. Grant changes require a
runtime restart and revision bump; these are startup configuration, not live mutation.

The callback receives private map/Journey services and a copy-producing trackRefKey
function. These objects and keys must never be serialized to HTTP. Route handlers must
select allowlisted operations and catch/format detailed Journey errors inside the
callback where needed. Journey stop metadata is resolved using the approved account's
captured Navidrome client, with an 8-second transport deadline, 1 MiB body limit, fatal
UTF-8 validation and exact returned song-ID matching.

## Evidence and remaining integration

Real SQLite-worker tests prove account isolation for the same dataset, different
approved datasets, cross-account point/ref rejection, no grant from account IDs or
music approval alone, binding revocation, bounded busy/idle cache handling, and failure
recovery. A scoped Journey uses the actual Journey service and approved client callback;
oversized metadata and mismatched song IDs fail. The assembled-runtime HTTP regression
covers real Argon2 login, upstream approval, map access, origin rejection, and stable
projection identity after restart.

This is not mounted in server.mjs yet. Production mode selection must route every Atlas
operation through this boundary, supply authorized dataset adapters and eliminate the
legacy global Atlas fallback for account mode. It must also preserve existing response
contracts and ordinary playback when Atlas is unavailable. Real full-library/native
Atlas acceptance, migrations, account UI, and all tab/release QA remain open M8 gates.

Validation on Node v26.7.0/macOS 26.6.2: all 807 tests pass with zero failures/skips;
production build passes with the existing bundle-size warning. The full run includes
re-approval after revocation rejecting old references. Logs:
`/tmp/navimuse-atlas-account-all.log`, `/tmp/navimuse-atlas-account-build.log`.
