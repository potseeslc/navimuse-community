# Fresh-install account setup v1

Status: private service proposed for independent review; no HTTP route enabled.
Base: `a1d472fe3f2b5524a50c01c7a7214923d45a8974` (merged login service).

`createAccountSetup` implements the fresh-install side of the
[account contract](NAVIMUSE_ACCOUNT_V1.md). It accepts trusted deployment mode,
an explicit `legacyConfigured` boolean, the deployment setup-token verifier,
account worker, password service and stable admission secret. The submitted body
cannot set deployment policy. Existing deployments return `MIGRATION_REQUIRED`;
OIDC-only deployments cannot use password setup. No legacy credentials or sessions
are promoted into v1 accounts by this service.

Admission shares the login service's durable network/global limits, identity HMAC
namespace and IPv6 grouping. A reserved `<setup>` identity gives the entire bootstrap
ceremony five attempts per 15 minutes regardless of submitted username. The shared
helper was extracted without changing login key derivation or bucket semantics;
existing persisted login limits remain applicable. A failed admission or invalid
network never reaches token verification, password screening or hashing.

The body has exactly setupToken, username, displayName and password. Token length is
bounded to 16–1024 characters, and the trusted verifier must return boolean true.
The route must use the deployment's constant-time token comparison, not a browser
claim. Only after verification does the service check whether accounts already
exist, normalize the username, validate the display name and call `enrollPassword`.
Enrollment retains minimum length/common-password screening and pinned Argon2id.
Caller-supplied account IDs and roles are rejected.

`hasAccounts` is a private read optimization, not a uniqueness guarantee.
`createFirstOwner` retains the authoritative SQLite immediate transaction checking
for any account before creating the immutable owner and credential together.
Concurrent ceremonies can both finish password work, but only one creates an owner.
The successful operation retains the existing `created` audit event.

Success returns only an internal account ID and boolean. It does not authenticate
the caller, issue cookies or create a session. The adapter may then perform the
reviewed login flow; a failure after durable creation must offer sign-in rather than
claiming setup rolled back. Subsequent authorized setup attempts return SETUP_CLOSED.
The durable presence of any account closes this ceremony even if token-file cleanup
fails. Password policy failures have stable codes; other internal exceptions expose
no database, token or credential detail. A losing concurrent creation returns the
generic SETUP_UNAVAILABLE result and can recover through account status/sign-in.

## Evidence and activation requirements

`test/accountSetup.test.mjs` covers real enrollment followed by real login, closed
setup, invalid token/body/role handling, protected deployment policy, screening and
hash-service failures, and two actual workers racing first-owner creation. The
test screener is explicitly synthetic; no breach-provider availability claim is made.
The existing password-login tests cover unchanged network canonicalization,
durable admission, session issuance and generation races after helper extraction.

Before activation, the production adapter must enforce the reviewed HTTP/network
boundary, bounded request parser and deployment-token verifier. Provision one stable
admission secret across writers/restarts (the existing stable settings-key derivation
can provide it with a dedicated versioned label). Pin the legacy-state policy and
disable legacy first-run setup while v1 setup is enabled; do not run competing
bootstrap systems against different stores. Preserve legacy deployments for the
separately controlled migration flow, including durable session revocation and
rollback. Token-file cleanup, public status/response mapping, failure audit handling,
HTTP/CORS integration and onboarding UI remain route-level work. Native/PWA sign-in,
OIDC, passkeys and recovery acceptance remain open.

Local validation on 2026-09-06, Node v26.7.0: all 749 tests pass with zero
failures/skips and the production build passes. Logs:
`/tmp/navimuse-account-setup-tests.log` and
`/tmp/navimuse-account-setup-build.log`. PR #287 is not included in this baseline;
its integrated HTTP boundary still requires its own review and final route QA.
