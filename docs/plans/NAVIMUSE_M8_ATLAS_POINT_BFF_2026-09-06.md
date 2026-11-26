# Atlas point inspection BFF implementation

POST /api/atlas/points/inspect implements the merged v1 inspection contract.
It is behind the existing application-session gate and required custom request
header. If Origin is supplied, it must equal the effective request origin or one
of the exact supported Tauri origins. Missing Origin remains compatible with the
existing authenticated server-client convention. Effective scheme uses the server's
existing TRUST_PROXY configuration; this does not replace the held account HTTP
boundary or add multi-account authorization.

The service obtains one immutable map lease, checks projection identity, resolves
the point from its private mapping, then asks the configured authorized Navidrome
binding for that exact track. Missing points and denied/missing tracks return fixed
public errors. A mismatched song ID or invalid required metadata is rejected.
The success response includes exact lease coordinates and the existing encrypted
signed Atlas transport reference; raw upstream IDs, paths and credentials are
excluded. HTTP responses carry no-store. Artwork references remain optional and
are not manufactured from private provider paths.

The route supplies a 15-second abort signal and cancels on client disconnection.
Service waits race the signal even if an upstream ignores cancellation; this bounds
map/song resolution and prevents a late result from being returned. The shared
request-body parser retains its existing size and server-level timeout behavior;
the inspection timer does not redefine that parser's body-read policy.

Validation includes service tests for lease identity, absent points, denied tracks,
wrong upstream track IDs, reference decoding and ignored-signal timeout. HTTP tests
exercise the authenticated endpoint, safe fields, no-store, cross-origin rejection,
unauthenticated access, stale projection, unknown point, request-ID mismatch and
method restrictions. Initial HTTP testing caught that the existing helper named
requireWriteOrigin only checks X-Requested-With; inspection now checks Origin
explicitly as described above.

This is the current single-tenant appliance boundary. Future local/OIDC/hybrid
accounts must scope projection membership and upstream access to immutable account
and library identity. Map picking, selected-point UI, artwork integration, live
full-library/native acceptance and final M8 release QA remain open.

Validation result: all 699 tests passed with no failures/skips. Production build
passed (existing large-chunk advisory). Logs: /tmp/navimuse-atlas-point-bff-tests.log,
/tmp/navimuse-atlas-point-bff-focused.log, /tmp/navimuse-atlas-point-bff-build.log.

## Client/controller HTTP integration

Merged reviewed main `2383aeb71afc3170457ec0c6c8c95bd105a6487a` (PR #283)
into this branch and extended the real HTTP fixture to call the production client
through the selection controller. Only the Navidrome and AudioMuse upstreams are
synthetic. The test verifies ready metadata, exact coordinates, no raw upstream ID,
coordinate-mismatch rejection, a correlated stale-projection failure and clearing
on session-scope removal. This is not authenticated real-library or native UI QA.

The integrated branch passes all 710 tests with zero failures/skips and the
production build. The existing HMR-port and large-chunk advisories remain.
Logs: `/tmp/navimuse-atlas-inspection-http-integration.log`,
`/tmp/navimuse-atlas-inspection-integrated-tests.log`, and
`/tmp/navimuse-atlas-inspection-integrated-build.log`.

The earlier PR #282 review at `e097bcd98bb23bde37787856b3a9bfeb69349799`
failed because model output and repair output were not parseable JSON. Read-only
inspection of Mac mini Code Bot logs confirmed the run began at 15:25:31 and ended
in failure at 15:29:19 on 2026-09-06; those entries do not retain the malformed
payload. No reviewer runtime, permission or status was changed. This integrated
head requires its own independent review before merge and live consumption.

## Request-correlation review regression evidence

The review of `6404afb96fff08ef71ab557bb60eb5172f423ce8` claimed that omitting
X-Request-ID bypasses validation of the body's requestId, and suggested native
Origin values could grant unauthenticated access. HTTP regressions against that
unchanged production implementation did not reproduce either claim:

- A valid body-only request ID is returned on success and stale-projection errors.
- Null, array, numeric and string bodies are normalized by the existing JSON body
  reader, then rejected by the inspection contract. Missing, empty, invalid-character
  and overlength IDs also return 400 with INVALID_REQUEST, a safe request ID and
  no-store. The service parses the request regardless of header presence.
- All three supported Tauri Origins return 401 when no authenticated cookie is
  supplied. Origin is an additional browser check; it never replaces the earlier
  application-session gate. This does not claim native-app attestation or replace
  the separate account/HTTP trust-boundary migration.

No production code changed for these cases. The HTTP fixture now retains the
regressions so the reviewer can reproduce the stated outcomes. This evidence does
not itself clear Code Bot's failed gate; the updated head needs independent review.

Validation: all 710 tests passed, no failures/skips. The production sources are
unchanged from the preceding passing build, so that build was not repeated for
this test/documentation-only update. Log:
`/tmp/navimuse-atlas-request-validation-tests.log`.
