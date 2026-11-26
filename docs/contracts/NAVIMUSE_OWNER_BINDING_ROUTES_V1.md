# Owner music-binding routes v1

Status: proposed mountable account-handler implementation; no production mount/UI.
Baseline: `abbab6b6f5fa716a1c9c829b3fcbfd86365a6be3`.

When the BFF supplies a trusted `bindingForCredential` resolver, the account handler
supports GET and PUT `/api/auth/v1/accounts/:uuid/upstream-binding`. Without that
resolver these routes remain unavailable. Existing TLS/host/origin, explicit native
CORS and no-store response boundaries apply. Path IDs select a target account only;
a short session cookie establishes the actor.

GET requires an authenticated owner and returns only `{revision, credentialRef}`.
The store rechecks owner authorization and target existence in the read transaction.
PUT accepts exactly `{expectedRevision, credentialRef}` through the bounded UTF-8
JSON parser. A null reference clears approval; a non-null reference must resolve to
one trusted server-configured binding with the same reference. Request-supplied
server IDs, usernames, passwords or actor IDs are rejected. The resolver never reads
credentials or mapping data from the request beyond selecting its configured key.
Private registry construction and a user-visible list of available references remain
part of runtime/owner-UI integration.

The session-based store mutation validates the bearer, recent authentication, enabled
owner role, target existence and revision in the same immediate transaction as the
binding write, generation increment, session/device revocation and audit event.
Device refresh preserves original authentication time and cannot satisfy recent-auth
requirements. A stale revision returns 409 UPSTREAM_BINDING_CHANGED; an old proof
returns 403 RECENT_AUTH_REQUIRED; absent sessions return 401, nonowners return 403,
and unknown configured references return 400. Internal errors are never echoed.

Successful PUT returns `{ok:true, revision, reauthenticate}`. Changing the owner's
own binding clears both cookies and returns reauthenticate true. An exact idempotent
update does not revoke sessions or clear cookies. Changing another account revokes
that target's sessions while preserving the acting owner's session. The UI must
handle conflict/retry and explicit reauthentication without importing another queue.

The preexisting actor-ID store method remains a private server provisioning API;
HTTP routes exclusively use the new bearer-based mutation. Its internal transaction
body is not exposed on the store or worker API.

## Evidence and remaining work

Real HTTP tests use the actual parser, handler, Argon2 login and SQLite worker with
a synthetic registry. They exercise unauthenticated/listener denial, extra identity
fields, unknown references, origin rejection, native PUT preflight, approval, clear,
revision conflict, target session revocation, own-cookie clearing and expired recent
proof. Controlled-clock storage tests prove refreshed devices do not renew recent
authentication, revoked bearers fail, and the private raw transaction body is absent.
Existing audit rollback and concurrent binding tests cover the shared write logic.

No credentials, production bindings or personal music state were changed. Owner
Settings integration, registry provisioning/verification, production mounting and
native/PWA user acceptance remain open.

Validation on Node v26.7.0: all 783 suite tests pass with zero failures/skips and
production build passes. Logs: `/tmp/navimuse-owner-binding-all.log` and
`/tmp/navimuse-owner-binding-build.log`. Existing large-chunk warning remains.
The earlier focused run passed 20 tests before the final HTTP recent-auth regression
was added; that final regression is included in the passing full suite.

Integrated reviewed transport main `a68163a6e4676cb75c1c33c7af7123a44f9ec1a0`.
All 787 combined tests and the production build pass on Node v26.7.0. Logs:
`/tmp/navimuse-owner-binding-transport-all.log` and
`/tmp/navimuse-owner-binding-transport-build.log`. The previous review failed to
produce parseable JSON; no code finding was returned. The new combined head still
requires a successful independent review before merge.

The requested authorization-race scenario is now exercised with two real SQLite
workers: one approves a binding using an owner session while another disables that
owner. A successful approval must precede revocation in audit sequence; otherwise
approval must fail with no binding/audit mutation. Subsequent use of the revoked
bearer always fails. All eight focused binding tests and all 788 suite tests pass on
Node v26.7.0. Logs: `/tmp/navimuse-owner-binding-revocation.log` and
`/tmp/navimuse-owner-binding-revocation-all.log`. Production code is unchanged by
this regression test; the successful transport-integrated build remains applicable.
Independent review is still required.
