# Sonic Atlas Client Foundation

M5.3 establishes client-side identity, cache, renderer, and fallback boundaries before
any production WebGL renderer or Journey planning UI is integrated.

## Projection service and store

`atlasService` fetches only authenticated BFF contracts and parses every manifest and
tile before returning it.

`createAtlasProjectionStore` provides:

- one accepted projection/manifest identity at a time;
- identity-derived tile request/cache keys;
- bounded LRU tile cache;
- deduplicated in-flight tile requests;
- abort and rejection of stale manifest/tile completions;
- cache clearing and generation bump when projection identity changes;
- explicit invalidation and disposal;
- immutable observable snapshots.

A tile racing a manifest refresh must match the current manifest object, generation,
and namespace before insertion. Abort is advisory; a late adapter completion still
fails the identity checks.

## Renderer-neutral interface

`atlasRendererContract` defines the only client-to-renderer frame input:

- validated projection manifest;
- tiles validated against that manifest and unique by address;
- exact in-bounds pins with explicit roles;
- optional frozen Journey whose projection identity matches the manifest.

A renderer implements only:

```text
mount
render
setReducedMotion
suspend
resume
dispose
```

The host catches failures from every lifecycle method, disposes exactly once, marks
the renderer failed, and reports through a callback. It does not own queue, Journey,
persistence, service, or playback state.

No actual regl/WebGL code is promoted in this PR.

## Complete non-map fallback

`atlasJourneyFallbackModel` returns the complete ordered Journey and Previous,
Play/Pause, Next, and Queue controls without requiring a renderer.

- Queue attachment requires exact queue instance, order, IDs, and length.
- Current state comes only from the authoritative queue index.
- Played state comes only from authoritative queue play history.
- Detached/reordered/partial queues expose unknown state rather than inferred
  progress.
- Actions identify `authority: navimuse-queue` and never mutate a second cursor.

## Deferred

This foundation intentionally does not add:

- map UI or canvas;
- production regl adapter;
- route planning or stop resolution;
- queue replacement;
- Journey save/resume wiring;
- artwork/labels/semantic zoom.

Those later M5/M6 changes import these boundaries and must preserve complete fallback
and ordinary playback when the renderer or AudioMuse is unavailable.
