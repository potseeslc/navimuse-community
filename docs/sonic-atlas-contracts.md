# Sonic Atlas v1 Shared Contracts

M5 production contracts live in `shared/sonic-atlas/` and are dependency-free ESM
modules imported by the Node BFF, browser/Tauri client, and renderer integration.
They implement the accepted bounded Branch B decision without performing any network,
queue, persistence, or rendering side effect.

## Contract version and bounds

- Contract: `sonic-atlas/v1`
- Ordered waypoints: 2–20
- Target tracks per segment: 10–50 inclusive
- Builder default: 25
- `pathFixSize`: required literal `false`
- Maximum frozen stops: 1,000
- Maximum points per tile: 50,000

These are initial product constraints, not distance, ETA, shortest-path, graph-route,
or alternate-route semantics.

## Public contracts

- Projection manifest with immutable projection and manifest SHA-256 identities
- Coordinate-only exact-point LOD tiles
- Bounded ordered-waypoint plan request
- Safe structured resolution error
- Fully resolved/frozen Journey response
- Journey-to-authoritative-queue bindings
- Persisted frozen Journey state and append-only extension history
- Explicit tile and manifest cache identities

## Security and privacy

Parsers are strict and reject unknown fields. Public contracts cannot contain
credentials, cookies, authorization headers, service/internal URLs, stream URLs,
filesystem paths, raw Navidrome/AudioMuse IDs, embeddings, upstream bodies, stack
traces, or causes.

Identifiers crossing the BFF boundary are opaque aliases. Tiles contain only
`pointId`, `x`, and `y`. Safe error messages come from a fixed BFF-owned catalog and
expose only stable codes, retryability, optional indices, and opaque incident IDs.

## Queue authority

A resolved Journey freezes route intent and ordered stop bindings. It is not another
queue or playback cursor.

- Starting a Journey atomically maps frozen stops into the existing NaviMuse queue.
- Current, played, and upcoming state derive from queue transitions.
- Journey persistence stores no second `currentStopIndex` or playback seconds.
- Resume validates frozen data and queue binding; it does not plan automatically.
- Queue mismatch is detached/stale and requires explicit repair.

## Projection identity and cache invalidation

Tiles must match the accepted manifest's contract version, projection ID/version/
digest, manifest digest, LOD, and requested tile address. Cache namespaces include
those fields explicitly. A changed identity creates a new namespace; contradictory
content under the same identity fails closed.

Tile coordinates remain exact across all LODs. Full-detail tile union must equal the
manifest population and lower-detail point sets must be subsets of it. Aggregate or
centroid fields are rejected.

## Parser convention

- `parseX(value)` returns a new, deeply frozen normalized object or throws
  `AtlasContractValidationError`.
- Parsers never coerce strings to numbers or truthy values to booleans.
- Input objects are not returned or frozen in place.
- Public resolution errors must be constructed with `createPublicResolutionError`;
  arbitrary upstream messages are rejected.

## Independent validation

`test/contracts/` exercises identity, projection/tile, Journey planning/resolution,
persistence/queue binding, safe errors, and privacy boundaries. Later M5 PRs must
import these exact modules and add component-specific contract tests in the BFF,
client, and renderer before M5 exit.
