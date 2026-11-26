# Private account sessions — schema v3

Status: implemented for review; no HTTP route or production authentication change.
Base: merged account credentials PR #277 (`57176b380d9ecfb8af20c5ffdf9c022986f1d881`).
The public [account contract](NAVIMUSE_ACCOUNT_V1.md) remains authoritative.

## Storage and authorization

Schema v3 adds short sessions and trusted-device families in the same SQLite worker
and transaction boundary as accounts. V1/v2 upgrades preserve identities and password
credentials. No existing cookie is promoted to a new session.

Tokens contain 32 random bytes, encoded canonically as base64url, with separate `s1`
and `d1` prefixes. The full token is exactly 46 ASCII characters: `s1.` or
`d1.` followed by 43 unpadded base64url characters, with decode/re-encode equality
required. SQLite stores domain-separated SHA-256 verifiers, never reusable
raw tokens. Password hashing remains Argon2id; random-token verification does not
use password hashing. Malformed and wrong-kind tokens fail closed.

`issuePasswordSession` is private server infrastructure. The future caller verifies
the password and supplies the generation and credential revision captured before
verification. Inside the transaction, issuance rechecks both plus the enabled account,
then creates a session and optional device family together. A submitted account ID
and revision are not authentication proof. These operations must never be exposed
as generic RPC endpoints.

`authenticateSession` resolves the opaque token and checks expiry, account generation,
enabled state, session revocation, and any attached family's generation, expiry and
revocation before returning account metadata and public session fields. No session
response caches account roles across requests. The current implementation uses a
30-minute short lifetime and a five-minute recent-authentication window. Device
lifetimes use the accepted 30-day idle / 180-day absolute defaults. Trusted store/worker initialization accepts a validated `sessionPolicy` to shorten
these lifetimes, with recent ≤ short ≤ idle ≤ absolute. Unknown keys, noninteger or
nonpositive values, and values above those ceilings fail startup before opening the
database. Policy is deployment configuration, never a request field. All writers
must use the same configuration. Stored deadlines remain authoritative for existing
sessions; shortening issuance policy does not retroactively revoke them.

Per-account defaults cap storage at 20 device families and 128 short sessions; these
limits may also be lowered. Issuance and renewal prune expired, revoked and obsolete-
generation records transactionally. Reaching a cap rejects issuance rather than
evicting another active device. Failed renewal rolls back token rotation, so its
current token can retry after capacity is available. Dormant accounts retain bounded
rows until their next successful issuance. Expired short tokens removed by retention
can no longer identify a family for logout; the live session/renewal flow must obtain
a current session before relying on that operation.

`refreshDevice` consumes the current verifier and installs a successor plus a new
short session in one BEGIN IMMEDIATE transaction. Competing writers return one
winner and null for the predecessor. A losing refresh neither revokes the family nor
returns replacement tokens. Absolute expiry never extends. The original authentication
time survives renewal: refresh cannot grant recent authentication. Device management
returns only the authenticated account's device metadata.

`logoutSession` revokes that session and its attached family, including sibling short
sessions. A recognized expired short token can still revoke its own family.
`revokeDevice` requires ownership and recent authentication. `logoutEverywhere`
requires recent authentication and revokes all sessions and families for that account.
Account generation changes invalidate all old short/device tokens on their next use.

## Backup recovery

Backup includes schema v3 consistently. Offline restore validates the new tables and
removes all short sessions and device families before publishing the restored file.
Historical backups therefore cannot resurrect revoked bearer tokens. Restored users
must sign in again; account identities and credentials remain available. Never swap
in a historical database directly to bypass this restore policy.

## Verification and remaining integration

Tests cover persistence across store close/reopen, verifier-only storage, token type
separation, competing worker rotation, predecessor rejection, immutable absolute and
idle expiry, short expiry, recent-auth preservation, ownership, disable/password
invalidation, stale issuance, logout/revocation, failed-write rollback, schema-v2
migration, and backup restoration without resurrected tokens. Tests use synthetic
accounts, an injected clock where appropriate, and no live volume.

Verification on 2026-09-06: 699 tests passed and the production build completed.
All 22 account/store/worker/credential/session/backup tests passed in an isolated
`navimuse:m8-tabs-6f5dd91` container (Node 22.23.2, Linux arm64), with no live mounts.

Before route/UI wiring is accepted:

- Complete password/setup/migration/recent-auth ceremonies and bounded account/network
  throttling. Wire the validated deployment lifetime and retention policy.
- Pin Secure/HttpOnly/host-only/SameSite cookie names and paths, HTTPS/proxy/origin
  enforcement, no-store responses and generic error mappings. Raw tokens are returned
  only to the trusted BFF cookie writer, never as session JSON or React state.
- A losing refresh sends no Set-Cookie, including no cookie clearing. Select the
  conflict/retry response and verify delayed HTTP response ordering. Coordinate
  renewal across documents and recheck session after a losing renewal.
- Wire authorization middleware on every protected API. Existing signed cookies and
  production routes remain unchanged by this private storage implementation.
- Add OIDC/passkey/recovery proof adapters without weakening atomic issuance checks.
- Complete live native/PWA login, restart, network, expiry, device management,
  migration/rollback and owner/listener tests on the final release candidate.

Database tests do not establish cookie delivery, cross-document renewal, actual
password verification by a route, or live sign-in acceptance.

Policy/retention follow-up: 701 full-suite tests and the build pass. The 10 session
tests pass with explicit unchanged-absolute-deadline assertions; all 24 account tests
pass in the same isolated Node 22.23.2 runtime. Capacity rejection preserves active
sessions and rolls back renewal so the current device token remains usable.

## Revocation review evidence

The second review claimed a failed session update could leave family revocation
committed, while its focused verification confirmed the transaction context.
`logoutSession`, `revokeDevice` and `logoutEverywhere` each execute family and session
updates inside the same store transaction. A new regression injects a SQLite trigger
that aborts the session update after the family update. For all three operations,
neither revoked flag persists, both prior sessions still authenticate, and retry
without the trigger revokes the intended tokens. The database transaction wrapper
rolls back the entire transaction, not just the failing statement.

`logoutEverywhere` calls the same `recent` guard as device revocation before any
updates. Existing expiry tests reject it at the recent-auth boundary even after
renewal. Rate limits remain a route-layer requirement. `normalizeSessionPolicy`
checks every final value with Number.isSafeInteger plus positive/ceiling checks;
invalid-policy worker startup tests include fractional values.

Latest evidence: 705 full-suite tests and the build pass; 14 session tests (including
three revocation subtests) pass on isolated Node 22.23.2 Linux arm64. No session
implementation change was needed for the reported rollback claim.

## Current-main integration (2026-09-06)

Integrated main `0fa69aca276642736f137985cd1f494eaf30050a` into the session
branch based on `1624a363d2d88507dd36967392ac1ee13219a512`. This brings the
reviewed Atlas contracts and HTTP endpoint into the same tested server tree.
All 729 tests and the production build pass, with zero failures/skips. Logs:
`/tmp/navimuse-account-sessions-main-tests.log` and
`/tmp/navimuse-account-sessions-main-build.log`.

The prior review's partial-revocation allegation contradicts its own verification.
The existing regression installs a SQLite trigger that aborts the session-table
update after the family update, tests logoutSession/revokeDevice/logoutEverywhere,
and verifies both updates roll back. Removing the trigger then proves successful
revocation rejects session authentication and device refresh. The shared wrapper
uses BEGIN IMMEDIATE, COMMIT and ROLLBACK on the same connection. These checks pass
with current main; no transaction weakening or review-gate bypass was made.

This remains a storage/session prerequisite. Live account HTTP/UI wiring, native
sign-in and the complete M8 account acceptance gates remain open.
