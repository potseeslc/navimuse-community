# Local account runtime assembly v1

Status: mountable local-service assembly, not production activation.
Baseline: `89130ac359498a0785517e70c00162a84dceaabd`.

openLocalAccountRuntime composes the reviewed private store worker, persistent secrets,
Argon2 password service, admission throttles, setup/login/session HTTP handler,
Navidrome registry and approved-account access boundary. Configuration comes only from
trusted startup code. Production password screening defaults to the existing breach
screening service; test fixtures inject screening only, retaining real Argon2 work.

Initialization is explicit. Without initialize true, the private directory and account
database must exist. A new installation generates synced private keys before opening
the database. Any existing SQLite database/WAL/SHM prevents key regeneration; orphaned
SQLite files without the database are also rejected. Missing keys on an existing
installation fail startup even when initialize is requested. Losing only the database
cannot silently create a new owner installation during ordinary restart.

The directory must be private, owned by the process user and a real directory. URL
policy and registry configuration are validated before persistent state is created.
Initialization failures close any opened worker and expose a generic error. close()
closes the worker and may be called repeatedly. Persistent state is retained on failure
for deliberate recovery; this module never deletes or resets an installation.

The returned handler serves account routes, and withUpstreamRequest validates the
request transport/origin boundary then obtains the short bearer exclusively from the
configured HttpOnly cookie. No account ID, upstream credential or queue scope in a
request establishes authorization. Registry clients are scoped to approved bindings.
The store and private keys are not returned to the caller.

This assembly intentionally advertises only its implemented local password method.
It does not implement OIDC/hybrid/passkey adapters or reinterpret legacy sessions.
legacyConfigured is trusted deployment detection; such a deployment remains
migration-required and fresh-owner setup is denied. Owner binding HTTP routes now use the registry credential verifier. Tests approve
bindings through the authenticated HTTP route rather than private store provisioning.

## Evidence and remaining integration

Actual loopback account HTTP plus a synthetic Navidrome HTTP server exercise setup,
Argon2 login, unassigned denial, verified owner HTTP approval, approved dispatch and
restart. The same account ID, queue namespace, short cookie and key bytes survive
restart. Further checks reject hostile origin, closed setup, missing keys and implicit
initialization; legacy setup remains blocked. No production credentials were used.

server.mjs has not mounted this runtime. Production activation still needs the private
configuration source, legacy migration, owner UI, account-aware settings and
Atlas/media request context, and removal of legacy authentication bypass paths in the
new mode. Native/PWA cookie behavior, real playback and the full M8 tab/release gates
remain required. These tests are not evidence that those flows are complete.

Validation on Node v26.7.0: three focused runtime tests and all 790 suite tests pass
with zero failures/skips; production build passes. Logs:
`/tmp/navimuse-account-runtime-focused.log`, `/tmp/navimuse-account-runtime-all.log`,
and `/tmp/navimuse-account-runtime-build.log`. Existing large-chunk warning remains.


## Owner approval runtime integration

The runtime now supplies registry.bindingForCredential to the reviewed owner routes.
A real HTTP test completes setup, password login, verified own-binding approval,
old-session revocation, explicit sign-in and approved music dispatch, then checks
restart continuity. Its synthetic upstream verifies the configured salted token.
No binding is inserted directly into the test database. A second test rejects failed
upstream verification with no cookie change or binding write and preserves the
unbound signed-in state. This is isolated HTTP integration, not live production or
native/PWA acceptance. Owner Settings UI and production mounting remain open.


Verification on Node v26.7.0: all four focused runtime tests and all 795 suite tests
pass with zero failures/skips; production build passes. Logs:
`/tmp/navimuse-runtime-approval-focused.log`, `/tmp/navimuse-runtime-approval-all.log`,
and `/tmp/navimuse-runtime-approval-build.log`. Existing bundle-size warning remains.

Integrated reviewed request-context main
`62ef90373d780fa605b5523ee94f656fd9a34193`. All 798 combined tests pass with zero
failures/skips and the production build passes on Node v26.7.0. Logs:
`/tmp/navimuse-runtime-approval-context-all.log` and
`/tmp/navimuse-runtime-approval-context-build.log`. The previous PR review ended in
invalid verification JSON (required confirmed/rejected arrays were missing), not a
returned code finding. The updated combined head still requires independent review.

The runtime also accepts an exclusive `navidromeRegistryFile` startup source; see the
[private registry file contract](NAVIMUSE_NAVIDROME_REGISTRY_FILE_V1.md). File loading
and registry validation happen before persistent initialization. Supply either that
absolute private file path or `navidromeEntries`, never both.

The runtime now also exposes `withAtlasRequest`, with no dataset grants by default.
Its explicit dataset grants, per-account keys and bounded cache lifecycle are defined
in [account Atlas scope v1](NAVIMUSE_ACCOUNT_ATLAS_SCOPE_V1.md). This is separate from
ordinary music access; the legacy global Atlas service is never used by this method.
