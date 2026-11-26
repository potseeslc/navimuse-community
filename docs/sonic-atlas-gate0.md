# Sonic Atlas Gate 0 Completion

M4 completed on 2026-08-27 in the sibling `navimuse-sonic-atlas-lab` repository.
This document records the production-facing consequences; detailed private evidence
and lab implementation remain in that repository.

## Final architecture: bounded Branch B

Initial Sonic Atlas may use current AudioMuse ordering only for bounded,
ordered-waypoint Journeys:

- at least two playable ordered waypoints;
- caller-directed target length per segment;
- initial default near 25 tracks;
- ordinary initial envelope approximately 10–50 tracks per segment;
- `path_fix_size=false`;
- exact endpoint and every-stop validation through the BFF;
- shorter result accepted only when both exact endpoints and all playable stops
  remain;
- fully resolved order frozen into NaviMuse's existing authoritative queue;
- exact save/resume replay without silent regeneration;
- explicit extension by appending a new segment.

The current AudioMuse route is embedding interpolation plus nearby-track resolution,
not persisted graph search. Identical inputs are not promised a different route.

## Truthful visual contract

The current UMAP projection is a similarity landscape, not directional geography.
Production Atlas must:

- preserve the fine point-cloud silhouette, negative space, islands, bridges, and
  tendrils;
- use exact-coordinate, spatially stratified real-point LOD;
- retain current, destination, waypoint, selection/focus, and accessibility pins;
- show a thin ordered-sequence trail only;
- provide a complete ordered list/player fallback;
- never claim literal streets, graph edges, geographic distance, ETA, shortest path,
  optimal route, or monotonic destination progress.

Visible aggregate centroids, coordinate snapping, decorative hard territories, and
polyline distortion are not authorized.

## Selected macOS renderer

Gate 0C selects bounded `regl@2.1.0`/WebGL2 in packaged Tauri/WKWebView.

Restricted real-payload evidence used a privacy-safe coordinate-only capture of the
live 92,610-point AudioMuse projection. It passed:

- normal/context/fallback packaged functional evidence;
- median 16.6667 ms, p95/p99 18/18 ms, 0.0528% frames over 33.4 ms;
- 30 minutes unplugged in foreground follow mode;
- final-ten-minute median 16.6667 ms, p95/p99 19/19 ms, 0% over 33.4 ms;
- maximum post-warm-up owned RSS 158.8 MB;
- thermal nominal throughout;
- no crashes, reset loops, or process survivors.

Battery remained at the integer-reported 100%; that is a pass under the
preregistered percentage-point metric with an explicit quantization caveat, not a
claim of zero energy use.

## Ownership boundaries

- AudioMuse owns embeddings, IVF lookup, current path interpolation, and any future
  route-v2 graph capability.
- NaviMuse BFF owns authentication, credential isolation, translation, stop
  resolution, concatenation, redaction, and service-version contracts.
- NaviMuse client owns waypoint interaction, preview, persistence UI, accessibility,
  and truthful rendering.
- The existing NaviMuse playback queue remains the sole playback/Journey authority.
- Ordinary playback must survive AudioMuse, map, renderer, and network failures.
- No AGPL AudioMuse implementation code is copied into NaviMuse.

## Deferred to future AudioMuse route-v2

A new evidence-backed ADR is required before offering:

- uncapped or sonic-distance-derived route length;
- measured graph streets and per-edge diagnostics;
- true alternate routes for identical endpoints;
- route seeds or recent-route exclusions;
- Direct/Scenic/Deep graph planning;
- literal directional navigation.

## Remaining holds

- Atlas remains disabled in the phone/PWA experience until oldest-supported-phone
  evidence passes.
- Production visual-topology thresholds must be preregistered and passed against the
  restricted real projection before visual promotion.
- Signing/notarization and release hardening remain M7.

## Lab provenance

Accepted records in `navimuse-sonic-atlas-lab`:

- `decisions/ADR-002-SONIC-ATLAS-BOUNDED-BRANCH-B.md`
- `decisions/GATE_0A_ROUTE_GEOMETRY_DECISION_2026-08-22.md`
- `decisions/GATE_0C_RENDERER_DECISION_2026-08-27.md`
- `long-route-listening/GATE_0B_BOUNDED_LISTENING_CONCLUSION_2026-08-23.md`
- `contracts/BOUNDED_ORDERED_WAYPOINT_JOURNEY_CONTRACT.md`
- `contracts/ATLAS_POINT_CLOUD_VISUAL_CONTRACT.md`
- `renderer-bench/GATE_0C_FINAL_RENDERER_DECISION_2026-08-27.md`

Final Branch B ADR merge: `390d302e56387c098763364b7464eda5fe612a36`.
