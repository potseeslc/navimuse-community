# Navidrome request identity context v1

Status: production BFF request capture; account runtime activation remains open.
Baseline: `89130ac359498a0785517e70c00162a84dceaabd`.

An authenticated music request can span several upstream calls. Previously each call
reread global service configuration. If the owner changed credentials while a genre
or artist request was waiting, later calls could use another upstream identity.

The BFF now creates an AsyncLocalStorage scope for each request and binds a copied
Navidrome configuration after the existing service authentication guard. Metadata and
media consumers resolve their client through this scope. Nested asynchronous work
retains the captured identity; later requests capture the new configuration. A scope
cannot be rebound, and a failed bound resolver cannot fall back to another identity.
Existing trusted operations outside the bound music paths retain their explicit
legacy resolver. No HTTP input selects a context or client.

This is not account-mode authorization or immediate cancellation of in-flight work.
Account activation must bind the client supplied by the reviewed account access
boundary and eliminate legacy fallback in that mode. An already authorized request
may finish with its captured client; future requests reauthenticate independently.

Atlas currently shares a projection snapshot/pending cache and global reference keys.
Async request context alone cannot isolate that cache. Account-specific Atlas service
instances/keys, cache lifetime and invalidation are still required before enabling
multi-account Atlas. Do not mount the new runtime by assuming this transport change
makes those shared services account-safe.

## Evidence

A real HTTP regression pauses a genre lookup, saves replacement credentials through
the actual authenticated Settings endpoint, then continues the lookup. Its nested
album query uses the original username; the next browse uses the replacement.
Temporarily removing the request binding makes this test fail on the album username,
confirming it detects the original bug. The source was restored before full tests.

Context tests cover concurrent and nested async operations, fallback isolation,
rebind rejection and bound failures. The initial HTTP fixture cleanup released a
response twice; that test-only error was corrected and the final run completes.

On Node v26.7.0 all 790 tests pass with zero failures/skips, and production build
passes. Logs: `/tmp/navimuse-request-context-race-fixed.log`,
`/tmp/navimuse-request-context-counterfactual.log`, `/tmp/navimuse-request-context-all.log`,
and `/tmp/navimuse-request-context-build.log`. Existing bundle-size warning remains.
No production credentials or services were changed by fixture tests. Native/PWA
playback, real account integration and full M8 acceptance remain open.
