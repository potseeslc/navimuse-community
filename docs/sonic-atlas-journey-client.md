# Sonic Atlas Journey Client and Queue Authority

M5.5 wires bounded Journey planning into the real application domain without adding
the final M6 waypoint/map experience.

## Application boundary

`AtlasJourneyContext` provides reachable application-level operations:

- plan a bounded Journey preview;
- atomically start the current preview;
- append a fully resolved revision;
- detach the active Journey;
- observe validated Journey state.

The context is mounted in `main.jsx`. No visible planning controls are added in M5;
M6 surfaces consume the context.

## Queue-owned transaction

The existing `usePlayerQueueState` remains the sole queue authority. Atlas start and
extension call its single `commitAtlasTransaction` operation.

One localStorage commit record contains:

- complete queue items and index;
- shuffle pool and play history;
- controls;
- playback position;
- queue instance ID;
- validated persisted frozen Journey and exact stop/queue bindings;
- commit timestamp.

The record is validated and written before React queue state publishes. If storage
fails, no in-memory queue changes. On reload, the newest valid Atlas transaction or
ordinary queue snapshot restores; malformed Atlas state is cleared and ignored.

During ordinary next/previous playback, the Atlas transaction is rewritten with
current index, position, controls, history, and shuffle state. It is retained only
while queue instance and exact ordered IDs match. Any ordinary/reordered replacement
clears it.

Atlas commit disables shuffle before building/persisting the transaction so Journey
order cannot restore with contradictory controls.

## Controller invariants

- Starting a new plan clears the old preview; pending/failed replans cannot start it.
- Restore cancels pending planning and never replans or replaces the queue.
- Start requires the latest completed generation.
- Append requires the persisted Journey to remain attached to the authoritative
  queue.
- Append preserves request ID, projection/resolver/planner identity, prior
  waypoints, segments, stops, and chronology exactly.
- New segments form a contiguous suffix beginning at the old final stop.
- Current queue item and actual playback position survive extension when still
  present.

## Playback references

Frozen stops map to existing queue entry shape with explicit `atlasOwned: true` and
an authenticated `/api/atlas/tracks/:trackRef/stream` URL resolved through the
configured BFF origin. The raw Navidrome ID never enters client state.

Atlas-owned tracks are excluded from ordinary Navidrome now-playing/scrobble reports,
which cannot consume queue aliases. A future dedicated reporting contract may be
added separately.

## Non-map fallback

The renderer-independent fallback remains complete and queue-authoritative. Current
state comes from queue index, played state from queue history, and detached queues
show unknown state rather than inferred progress.

## Deferred to M6

- waypoint picker and route preview UI;
- visible Atlas map/canvas;
- renderer adapter;
- semantic zoom, labels, artwork, and Journey interactions.
