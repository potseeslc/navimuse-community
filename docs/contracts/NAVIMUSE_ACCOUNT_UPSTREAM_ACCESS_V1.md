# Account-bound upstream dispatch v1

Status: private integration prerequisite; production routes are not yet switched.
Baseline: `562bfd7d61c8014da7b3bd9856ef1506a632ad15`.

`authenticateUpstreamSession` reads the short bearer, account generation, device
family and approved binding in a single SQLite immediate transaction on the worker.
It accepts only the bearer. An invalid, expired, revoked or disabled session returns
null; a valid unassigned account retains its identity with a null binding. This
avoids combining a previously authenticated bearer with a later reassignment read.

`createAccountUpstreamAccess` owns a registry of preconfigured BFF request functions.
Each entry declares its logical credential reference, server UUID and exact upstream
username. Duplicate references and malformed configuration fail construction. The
registry copies these identity fields. Its request function must be created by trusted
server configuration, authenticated to precisely that server/user, and must not permit
a caller to override credential-bearing headers, URLs or identity parameters. This
module does not create that Navidrome adapter or verify a declared identity against a
live service; adapter integration and credential verification remain required.

`withUpstream(shortBearer, operation)` checks the atomic session/approval snapshot,
then requires an exact server-ID and username match in the registry. Only then does
it invoke the server-owned operation with that private request function and opaque
queue context. Neither operation nor client configuration can come from HTTP input.
Missing sessions return SIGN_IN_REQUIRED, absent approval returns UPSTREAM_UNASSIGNED,
and a missing/mismatched client returns UPSTREAM_UNAVAILABLE without dispatch. Store
failures return ACCOUNT_UNAVAILABLE; operation failures return UPSTREAM_UNAVAILABLE
without exposing private exception messages. Route adapters still own response-body
sanitization and endpoint/argument allowlists.

Authorization is evaluated at the database transaction. Revocation prevents later
requests; it cannot retract bytes already dispatched under a valid snapshot. A route
must not retain the callback/client for later requests. Long-lived media streams and
Atlas lease invalidation need their own documented lifecycle handling when mounted.

`queueScopeForAccount` is for the account HTTP handler's trusted session projection.
It yields a namespace only for an approval matching the private registry. A queue
namespace is public state, never an upstream authorization token. Every music request
must separately use bearer authorization. This function does not accept client account
IDs at an HTTP endpoint. Lookup failure preserves the account handler's existing
unbound-session behavior, without permitting music access.

## Verification

Tests use real SQLite workers, issued storage-fixture sessions, explicit approvals,
and synthetic request functions. They cover unassigned accounts, UUID-as-bearer
rejection, owner/listener isolation, approval and clear revocation, exact username
case/server matching, missing clients, duplicate configuration and private failure
redaction. Two real workers race approval changes against twenty authentication
snapshots: an old bearer may see its old approval or denial, never the new identity.
These are authorization-boundary tests, not real password or Navidrome playback proof.
Production mounting, registry construction from private configuration, owner approval
UI, native/PWA access and all tab acceptance gates remain open.

On Node v26.7.0, all three focused tests and all 780 suite tests pass with zero
failures/skips; production build passes. Logs:
`/tmp/navimuse-account-access-focused.log`, `/tmp/navimuse-account-access-tests.log`,
and `/tmp/navimuse-account-access-build.log`. Existing occupied HMR port and
bundle-size warnings remain; neither prevented completion.
