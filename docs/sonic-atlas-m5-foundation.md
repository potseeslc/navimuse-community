# Sonic Atlas M5 Contracts and Foundation Evidence

M5 completed through bounded PRs after Gate 0 selected bounded Branch B.

## Delivered boundaries

### M5.1 — Shared v1 contracts

- Dependency-free ESM contracts imported by BFF and client
- Strict, deeply frozen parsing with no coercion
- Projection and manifest identities
- Manifest-owned exact-point tile address/digest/count index
- Complete LOD population/address/subset/coordinate validation
- Bounded ordered-waypoint requests (2–20; 10–50; default 25;
  `pathFixSize=false`)
- Safe fixed-catalog errors
- Fully resolved/frozen Journey
- Queue binding and append-only persisted Journey
- Bounded, cycle/accessor-safe privacy validation

### M5.2 — Authenticated projection BFF

- `GET|HEAD /api/atlas/projection`
- `GET|HEAD /api/atlas/tiles/:lod/:x/:y`
- BFF-only AudioMuse bearer access
- No redirects, 20-second timeout, streaming 64 MiB ceiling
- Settings-derived HMAC point aliases
- Coordinate-only public payloads
- Worker-thread snapshot construction
- Generation-safe invalidation and deduplicated TTL refresh
- ETag/conditional GET and safe error envelopes

### M5.3 — Client and renderer-neutral foundation

- Contract-parsing Atlas service adapter
- Identity-keyed, bounded, abortable LRU projection store
- Stale manifest/tile completion rejection
- Strict renderer-neutral frame and lifecycle host
- Failure isolation and dispose-once behavior
- Complete non-map ordered Journey/list/player fallback
- Exact authoritative queue attachment/history semantics

### M5.4 — Bounded Journey BFF

- Authenticated/CSRF-protected planning endpoint
- One immutable projection lease per Journey
- Exact private waypoint/raw-ID resolution
- AudioMuse segment calls with `max_steps`, `path_fix_size=false`, and audio space
- No redirects; bounded body, segment timeout, and 45-second overall abort
- Exact endpoint/count/projection/playability validation
- Bounded-concurrency deduplicated Navidrome resolution
- Frozen shared Journey response with no raw IDs/upstream metadata
- Persistable AES-GCM opaque track references
- Authenticated Atlas stream boundary proven with Range-capable media proxy

### M5.5 — Existing queue authority and persistence

- Reachable application `AtlasJourneyContext`
- Preview planning never mutates playback
- One queue-owned localStorage transaction contains complete queue navigation state
  and validated Journey binding
- Write-before-publish crash consistency
- Playback index, position, controls, history, and shuffle updates rewrite the same
  transaction
- Newest valid Atlas/ordinary snapshot restore priority
- Malformed or unavailable storage fails safely
- Restore never replans
- Append requires attached queue and exact immutable prefix/identity/chronology
- Atlas streams resolve through configured native BFF origin
- Explicit Atlas ownership prevents invalid Navidrome scrobbles

## Independent cross-boundary evidence

`test/atlasContractBoundaries.test.mjs` runs one fixture through:

1. BFF projection snapshot and complete exact-point tile set;
2. bounded AudioMuse-style Journey resolution and opaque track reference;
3. client manifest/tile store;
4. renderer-neutral validated frame and exact pin;
5. queue-bound ordered fallback.

It verifies no raw provider metadata crosses the contract. Separate degraded tests
prove planning, renderer, projection/cache, and storage failures do not mutate an
ordinary queue and still leave the complete fallback available.

## Degraded behavior

- AudioMuse unavailable: plan fails safely; ordinary queue untouched.
- Projection identity changes: tile cache invalidates; frozen Journey/list remains.
- Renderer mount/render/lifecycle failure: renderer disposes and fallback remains.
- WebGL absent: complete ordered list/player controls remain.
- Navidrome stop missing: structured failure; no queue replacement.
- Persistence unavailable: queue transaction is not published.
- Queue detached/reordered: Journey reports detached/unknown progress; no guessed
  current stop.
- Network/BFF session failure: ordinary playback continues from the existing queue.

## Verification

On the M5.6 branch:

- shared/BFF/client/renderer boundary test: 3 passing;
- full `npm test`: recorded in the completion PR;
- `npm run build`: recorded in the completion PR.

## M5 exit

M5 exit evidence is satisfied when the completion PR merges: the same shared
contracts pass independently and across BFF, client, queue/persistence, renderer
boundary, and fallback. M6 product integration is then unblocked.

M5 intentionally does not add the flagship map/Journey UI or production regl adapter;
those belong to M6 and remain constrained by Gate 0 visual truth and phone/PWA holds.
