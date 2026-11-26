# Account HTTP handler v1

Status: mountable handler proposed for independent review. Baseline
`8934f1b76a59b94200ba348c2e75997d16314c35`. The main BFF does not mount it yet.

`createAccountHttpRoutes` composes the reviewed request boundary/parser, setup,
password login and account worker. It handles `/api/auth/v1/setup`,
`/password/login`, `/session`, `/refresh`, `/logout`, `/devices`,
`/devices/:id` and `/logout-everywhere`; paths are relative to that prefix.
Unknown v1 paths return 404 and incorrect methods return 405. Outside the prefix
the handler returns false to its caller.

Transport/Host/Origin checks precede dispatch; writes require the accepted custom
header. Setup/login require the trusted network address and bounded body parser.
Native preflight uses the same explicit Origin policy with only the endpoint's
method and Content-Type/X-Requested-With headers. Responses are no-store JSON with
Vary:Origin. Connections close after account responses, bounding unread request
bodies on early rejection; parser timeout/overflow may close before a response.
Refresh and revocation operations accept no request body.

Setup creates the owner but returns only `ok` and `next:sign-in`; it does not expose
the internal account ID or issue a cookie. Login projects the verified account and
session through the existing public parser. The required server dependency
`queueScopeForAccount(accountId)` must resolve an approved upstream namespace.
Missing/unavailable mapping yields an authenticated response with null queueScope;
malformed non-null scopes fail validation. No query or body identity can
set a queue scope. Session/device tokens are serialized only into the accepted
HttpOnly cookies. Nonremembered login clears a previously stored device cookie;
successful explicit login revokes the previous presented session/family.

Refresh returns 409 `REFRESH_NOT_CURRENT` with `next:recheck-session` if its token is
invalid, expired, revoked or already rotated. It sends no Set-Cookie in those cases.
Only the winning durable rotation returns successor cookies. Clients must coordinate
renewal and recheck the short session after a conflict; a transport failure alone
must not become logout or erase playback state. Setup/login throttling returns a
generic Retry-After:900, avoiding per-account remaining counts or expiry disclosure.

Device listing is authenticated and returns only the store's safe metadata. Device
revocation enforces ownership and recent authentication in the store transaction.
Logout-everywhere also requires recent authentication. Explicit logout/current-device
revocation/logout-everywhere clear both cookie paths only after successful durable
revocation. Forbidden/unauthenticated operations never clear another session's cookies.
Parser codes are allowlisted; other unexpected failures return ACCOUNT_UNAVAILABLE
without internal messages. Permission and recent-auth failures have stable codes.

## Evidence and remaining integration

Real HTTP tests mount this actual handler with the real account worker and Argon2
service. Setup-token verification, password screening and approved namespace mapping
are explicitly synthetic dependencies. Tests cover setup/login/session/logout,
concurrent renewal with reordered cookie application, replacing remembered login,
invalid origins/bodies/mapping, native preflight, account/device ownership, recent-auth
expiry and bodyless refresh enforcement. The cookie ordering test is an HTTP jar
simulation, not native/PWA browser-cookie acceptance.

Mounting requires an explicit deployment policy, stable key derivation, approved
upstream mapping and replacing the legacy authorization boundary across the BFF.
The current legacy `requireAppAuth` allows first-run service access while no legacy
admin exists; merely adding v1 setup routes would leave that logic inconsistent.
Therefore activation must atomically switch the relevant route/authentication policy,
disable competing legacy bootstrap, and preserve controlled migration/rollback.
The handler alone does not authorize library, Atlas or owner-settings routes.

Failure auditing and token-file cleanup still need the deployment adapter. Projection
or transport failure after committed issuance/rotation cannot undo the durable write;
clients must recover through session recheck or explicit sign-in. Actual proxy/Worker
configuration, bounded server concurrency, client refresh coordination, OIDC/passkey
adapters, migration, onboarding and native/PWA release acceptance remain open.

Local validation on 2026-09-06, Node v26.7.0: all 764 tests pass with zero
failures/skips and the production build passes. Logs:
`/tmp/navimuse-account-http-routes-tests.log` and
`/tmp/navimuse-account-http-routes-build.log`.

## Review attack reproduction

The review and investigation alleged a client-controlled `deviceToken` login field.
The production parser already rejects that field, and the login service obtains
its device token exclusively from atomic server-side issuance. No production code
was changed in response to this allegation.

A new real HTTP test creates a second account's actual session/device family, then
submits that bearer in login body fields, query parameters and a forged device-cookie
header. Body fields deviceToken/deviceId/accountId each return 400 with no cookie.
A wrong password plus the foreign cookie returns 401 with no cookie. Correct owner
credentials plus the foreign query/cookie issue a new owner family; refreshing it
still authenticates the owner. The other account's existing session remains valid.
All seven focused HTTP-handler tests pass; evidence is in
`/tmp/navimuse-account-http-routes-injection.log`.

This verifies the requested cross-account scenario against the actual parser,
handler and worker. It does not waive the independent review gate or native/PWA
cookie and identity-mapping acceptance.

Full verification after adding the attack test: 765 tests pass with zero failures/skips
and the production build passes on Node v26.7.0. Logs:
`/tmp/navimuse-account-http-routes-injection-all.log` and
`/tmp/navimuse-account-http-routes-injection-build.log`.


## Unbound-session integration (2026-09-06)

The public v1 amendment separates application authentication from music mapping.
Login, session reads and refresh now preserve the verified account when the namespace
resolver returns null or throws; the response carries no queue namespace or upstream
grant. Raw resolver errors are not returned. Wrong credentials still fail and invalid
non-null scope formats still return ACCOUNT_UNAVAILABLE without cookies.

A real HTTP test covers unbound login, wrong-password rejection, renewal during a
resolver failure, cookie/session continuity and recovery of an unchanged namespace
without reauthentication. The resolver is synthetic; restoring its availability is
not evidence that a real binding mutation avoids its required generation invalidation.
Client queue gating, separate bootstrap status and approved backend credential checks
remain mandatory before mounting.

Verification on Node v26.7.0: 14 focused contract/HTTP tests and all 768 suite
tests pass with zero failures or skips; production build passes (existing large-chunk
warning remains). Logs: `/tmp/navimuse-unbound-session-focused.log`,
`/tmp/navimuse-unbound-session-tests.log`, and
`/tmp/navimuse-unbound-session-build.log`. This is pre-mount evidence, not live
native/PWA sign-in or upstream authorization acceptance.
