# Account password login service v1

Status: implementation proposed for independent review. No HTTP route or UI is wired.
Base: NaviMuse `9201a1a66a0e224937dd2c25d0c372ba4f2cf6d1`.

This implements the internal password-login orchestration required by
[account v1](NAVIMUSE_ACCOUNT_V1.md), using the accepted password, session and
HTTP-boundary prerequisites. It does not complete access/onboarding acceptance.

## Durable admission

Account database schema 4 adds `login_throttle`, migrated in the existing immediate
transaction. All BFF writers must share this database. Admission runs through the
existing bounded worker interface, before account lookup or Argon2 verification.

The initial conservative policy is five attempts per normalized username per
15 minutes, 30 per network per minute, and 100 across the deployment per minute.
Windows start at the first admitted attempt, expire on server time, and are not
extended by failures. This is a fixed-window policy: bursts across a window boundary
are possible. Success does not reset counters. Network identity is an exact IPv4
address or IPv6 /64; equivalent IPv4-mapped addresses share the IPv4 bucket.
Unknown usernames use the same admission policy. Invalid usernames share a bucket.
Account-denied requests still spend network/global admission; once broader admission
is exhausted no new account buckets are allocated. Counters saturate at their limits.

Rows expire and are reclaimed during admission. A 4,096-row ceiling fails closed
instead of evicting an active limit. SQLite `BEGIN IMMEDIATE` serializes all writers;
database failure rolls back partial updates. Limits survive restart and are included
in schema-4 backups; restoring a backup still clears bearer sessions as before.
Backward wall-clock movement conservatively prolongs windows; forward movement can
expire them. The deployment clock remains an operational dependency.

Stored identity keys are domain-separated HMAC-SHA256 values. The service requires
an explicit 32-byte deployment secret, held privately and identical across writers
and restarts. Its secure provisioning, backup and rotation belong to deployment
wiring; silently generating a new key at startup is prohibited because it would
reset identity limits. No raw usernames, IP addresses or passwords enter this table.
The initial limits can deny legitimate shared-network traffic or let an attacker
temporarily exhaust a known username's budget; production tuning must preserve
bounded admission and record the revised policy rather than bypassing it.

## Verification and issuance

`createAccountPasswordLogin` accepts the internal account worker, initialized password
service, explicit local/OIDC/hybrid mode and secret. OIDC-only mode denies password
login. A trusted HTTP adapter supplies a verified network IP; no forwarding headers
are parsed by this service. Scoped IPv6 addresses are rejected.

The service normalizes usernames without modifying passwords. After admission,
unknown accounts use the password service's existing dummy Argon2 record. Existing,
disabled and unknown accounts use the same configured verification work factor for
bounded passwords. Malformed passwords follow the existing uniform length check.
Invalid passwords and unknown or disabled accounts, along with stale issuance, return the same
`INVALID_CREDENTIALS` result. Saturated hash work returns `LOGIN_UNAVAILABLE`;
admission rejection returns `LOGIN_THROTTLED` with no account-specific counts or
timers. Storage errors fail closed without exposing their messages.

Successful verification supplies the captured authorization generation and credential
revision to atomic session issuance. A password/access change during verification
therefore prevents stale issuance. `remember` must be boolean. The successful result
contains internal bearer material solely for the accepted HttpOnly cookie writer;
it must never be serialized as a public JSON response or logged.

## Evidence and remaining route requirements

`test/accountPasswordLogin.test.mjs` exercises real Argon2 verification and session
authentication, stale-generation rejection, disabled/unknown/wrong-password results,
two actual worker threads racing admission, restart and backup persistence, network
canonicalization, expiry, storage saturation and injected transaction rollback.
Test credentials, addresses and the fixed HMAC key are synthetic fixtures.

Local validation on 2026-09-06, Node v26.7.0: all 744 repository tests pass
with zero failures/skips, and the production build passes. Logs:
`/tmp/navimuse-account-login-tests.log` and
`/tmp/navimuse-account-login-build.log`. These local results do not establish
packaged-runtime, deployment or live sign-in acceptance.

Before exposing `/api/auth/v1/password/login`: provision the stable secret; enforce
the accepted HTTPS/Host/Origin/custom-header boundary and bounded exact request
body; derive network identity only through configured trusted proxy rules; map errors
to a stable public response and generic retry policy; serialize cookies only on
success; complete controlled setup/migration and deployment policy. No caller may
pass account IDs, revisions or generations into this service as authentication.
Real request/cookie tests, live sign-in, audit integration, passkeys, OIDC linking,
recovery, onboarding UI and final native/PWA QA remain open.
