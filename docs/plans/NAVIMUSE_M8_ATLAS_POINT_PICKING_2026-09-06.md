# Exact Atlas point picking

This application helper indexes the full-detail tile population using the existing
accepted exact-coordinate contract. It does not change the renderer interface,
projection coordinates, LOD semantics, route geometry or playback authority.

Construction validates tiles against their manifest, rejects duplicate addresses
and point identities, and requires every populated highest-detail tile plus the
complete declared point count. Empty tiles may be omitted. The immutable index
sorts by X for bounded stripe lookup, then selects the nearest point within a
circular CSS-pixel radius. It uses the same orthographic camera transform as the
renderer, including the world-to-screen Y inversion. Framebuffer DPR does not
change pointer coordinates or radius. Offscreen points cannot be selected.
Equal-distance overlapping points resolve deterministically by opaque point ID.

The returned identity, point ID and original exact coordinate feed the merged
selection controller from PR #283 (main `2383aeb71afc3170457ec0c6c8c95bd105a6487a`).
The picker contains no metadata, upstream IDs or queue mutation. It is not yet
wired into AtlasOverview; pointer gesture handling, visible inspector, keyboard
equivalent, projection/session lifecycle and live endpoint integration remain open.
PR #282 remains held by a Code Bot output-format failure.

Five focused tests cover camera transforms, CSS-pixel selection, offscreen and
radius boundaries, nearest/tied points, stale/incomplete/duplicate/sampled data,
and all 96,000 individually selectable points in a synthetic full population.
The radius-edge test initially caught inverse-transform floating-point rounding;
the broad-phase interval now includes a roundoff allowance while the final
screen-distance check retains the requested radius.

Synthetic selection tests are not real-library renderer/native performance proof.
Full real-population selection, overlap usability, keyboard/VoiceOver, DPR and
30-minute native measurements remain required by M8.

After updating this branch to merged PR #283, all 711 repository tests passed
with zero failures/skips and the production build passed. Existing HMR-port
collision and large-chunk advisories remain. Logs:
`/tmp/navimuse-atlas-picking-integrated-tests.log` and
`/tmp/navimuse-atlas-picking-integrated-build.log`.
