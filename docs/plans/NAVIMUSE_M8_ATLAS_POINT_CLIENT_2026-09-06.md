# Atlas point inspection client adapter

Baseline: main `4506508770db3bb54027a80b303c5d3416c9555d`, with the
point inspection v1 contract merged in PR #281. The endpoint in PR #282
remains held: its latest Code Bot run failed to produce parseable review JSON.
That is a reviewer failure, not an independent approval of the endpoint.

The new service adapter sends only opaque point and projection identity through
the existing authenticated BFF transport. It disables response caching, correlates
the request header and body, validates successful responses against the complete
request identity, and returns immutable parsed metadata. Cancellation rejects
promptly even when transport ignores the abort signal; a late response cannot
fulfill the canceled inspection. Only correlated, validated public Atlas errors
are exposed as recovery details; arbitrary upstream text stays out of UI errors.

Validation at the initial adapter commit: five focused tests and all 700 repository tests passed, zero failures
or skips. The production build passed with its existing large-chunk advisory.
The test harness also reported an occupied HMR port 24678; no test failed.
Logs: `/tmp/navimuse-atlas-point-client-tests.log` and
`/tmp/navimuse-atlas-point-client-build.log`.

## Selection lifecycle controller

The controller snapshots a validated tile point's coordinates and requires an
explicit account/library scope before selection. Every replacement increments a
local revision and aborts the old inspection. Scope changes, clear and disposal
discard pending and ready metadata. Only the current revision may publish a result,
and its response must match both the request identity and exact selected coordinate.
Correlated public errors retain fixed messages and retry behavior; arbitrary
upstream exceptions do not reach the inspector.

Six additional behavioral tests exercise out-of-order responses, transports that
ignore cancellation, account/library changes, clearing, disposal, coordinate
mismatch, projection replacement, safe failures and coordinate snapshots. All
706 repository tests passed with zero failures/skips; production build passed.
The existing HMR-port and large-chunk advisories remain. Logs:
`/tmp/navimuse-atlas-selection-tests.log` and
`/tmp/navimuse-atlas-selection-build.log`.

PR #283's initial adapter head `c725826787888c5d2624e8fda5e59bc545ff4240`
received Code Bot success with an advisory cancellation claim. The service checks
`throwIfAborted()` after awaiting the race and before synchronous validation, with
no asynchronous gap; the canceled-transport test asserts rejection even when the
transport later resolves. The new controller additionally gates publication by
revision. The controller update requires fresh review on its own commit.

The adapter and controller have no UI caller yet. Point picking, click-versus-drag handling,
inspector rendering, keyboard equivalents, queue actions, and lifecycle wiring
remain open. The consumer must wire scope changes, projection invalidation and
unmount disposal to this controller; no account scoping is inferred by this helper.
Live endpoint integration awaits PR #282's review and merge. Full real-population
and native QA remain M8 acceptance requirements.
