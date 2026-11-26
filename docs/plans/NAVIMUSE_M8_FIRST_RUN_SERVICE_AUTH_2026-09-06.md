# First-run upstream authorization

Baseline: `8934f1b76a59b94200ba348c2e75997d16314c35`.

The legacy shared BFF guard returned true when no administrator was configured.
With environment-provided upstream credentials, anonymous requests could therefore
reach music, media or discovery routes before initial account setup. The setup
endpoint already has its own deployment-token gate and does not require this
exception.

The guard now returns 401 `NaviMuse admin setup is required` before dispatching
Navidrome, AudioMuse or Atlas requests when no administrator exists. Setup and public
configuration remain reachable. After setup, the existing signed-session requirement
continues to apply. Existing configured installations retain their authorization
behavior. This change does not enable v1 accounts or bypass their migration gates.

The new regression uses an isolated BFF and a counted local upstream with synthetic
credentials. Music metadata, streams, artwork HEAD requests, discovery and Atlas
inspection all reject before contacting that upstream. The same test then completes
token-gated setup, verifies an unauthenticated request still fails, and verifies an
authenticated library request reaches the upstream.

Twenty-two existing endpoint test cases previously relied on anonymous bootstrap
access. Their business requests now use an explicit authenticated helper that creates
the administrator through the real setup endpoint. Authorization tests retain the
unauthenticated helper, including the song-feedback rejection inside a mixed test.
Credential-missing and media-proxy fixtures use isolated data directories rather
than modifying the module-global server's settings. Existing endpoint assertions
remain in place.

This closes a prerequisite for a coordinated v1 server mount: library authorization
must never infer that absence of a legacy administrator means public service access.
The pending v1 handler, real approved upstream identity mapping, owner/listener
authorization, deployment migration and native/PWA acceptance remain separate work.

Validation on 2026-09-06, Node v26.7.0: all 759 tests pass with zero failures/skips
and the production build passes. The focused server suite passes all 101 tests.
Logs: `/tmp/navimuse-first-run-tests.log`, `/tmp/navimuse-first-run-build.log`,
and `/tmp/navimuse-first-run-server-tests-fixed.log`.
