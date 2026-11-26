# NaviMuse account and session v1

Status: proposed shared prerequisite; independent review and merge required before
consumer implementation. No v1 route, account, credential, or cookie is enabled by
this change. Authority: M8 product plan sections Persistent-session contract,
Authentication modes and passkeys, and Downstream service identity. The master plan
and existing BFF credential boundary remain authoritative.

## Public session boundary

`GET /api/auth/v1/session` returns exactly the fields validated by
`shared/accountSession.js`, version `navimuse-account/v1`. Responses are private,
`Cache-Control: no-store`; neither service workers nor disk caches retain them.

| Field | Contract |
| --- | --- |
| mode | Explicit deployment policy: local, oidc, hybrid; never inferred from a missing provider response |
| state | setup-required, migration-required, signed-out, authenticated |
| methods | password/passkey/oidc availability booleans, computed by BFF policy and configured capability |
| account | Null unless authenticated; otherwise id, username, displayName, roles only |
| session | Null unless authenticated; otherwise authenticatedAt, expiresAt, deviceId only |
| queueScope | Null when signed out or when an authenticated account has no currently usable approved music namespace; otherwise `queue-scope-v2:` plus 64 lowercase hex characters |

Account and device IDs are independently generated random UUIDv4 values. Username
is null for accounts without a local identifier; display name is 1–120 UTF-16 code
units, nonblank and without control characters. Roles are a nonempty unique subset
of owner/listener; owner implies listener permissions. Roles are assigned by the
BFF's account record, never by authentication method, token email, or UI input.
Times are integer epoch milliseconds; expiresAt exceeds authenticatedAt. Device ID
is a public management identifier, not its secret token or an authorization grant.

Unknown fields, credential fields, invalid role vocabulary, conflicting mode/methods
and identity data in signed-out states are rejected. The parser checks a public
response's shape only: it does not verify a session, validate wall-clock freshness,
or authorize a request. Server middleware remains the authority even if a client
fabricates a structurally valid response or alters React state.

In local mode, OIDC is unavailable; in oidc mode, password login is unavailable
(recovery is a separate ceremony). Hybrid permits both. Passkey availability also
requires the pinned canonical HTTPS origin/RP ID and supported client path; a
configured mode alone cannot assert authenticator support. An authenticated session
can remain valid through provider outages, subject to BFF expiry/revocation policy.

Queue scope is HMAC-derived from deployment, immutable account ID and approved
upstream binding identity/version. No caller supplies the input identity. Changing
username/display name must not change it; changing the upstream binding must.
It is a cache namespace, never accepted as a credential or request principal.

### Authenticated accounts without music access (2026-09-06 amendment)

The unreleased v1 public contract allows `state: authenticated` with `queueScope: null`.
This represents a verified application account whose approved music namespace is
unassigned or temporarily unavailable. Account identity, roles and session expiry
remain populated and verified; null is never a credential or an upstream grant.
This resolves the bootstrap cycle where an owner otherwise could not sign in to
configure the mapping required to sign in.

Clients must keep account sign-in distinct from music access. Do not log out, erase
an existing queue cache, auto-import another namespace, or fabricate an `unbound`
queue key when this field is null. Pause namespace-dependent restore/write actions
until a verified scope is available. Bootstrap/service status must separately explain
unassigned versus unavailable access; null alone does not distinguish their causes.
Backend upstream operations still require an actual approved mapping and matching
server credentials. A successful account login alone never authorizes them.

The handler returns null if its binding resolver reports no mapping or fails. It
continues to deliver successful login/refresh cookies so a temporary binding lookup
failure does not strand a consumed device rotation. Malformed non-null namespace
values remain contract errors. Revocation, disabled accounts, incorrect credentials
and session expiry retain their existing authentication behavior. An actual binding
approval/change still invokes its separate generation/session invalidation rules;
lookup recovery is not a new approval.

This shared-contract/handler amendment requires review before client or deployment
consumers rely on it. No production route or UI is activated here.

## Private records and atomicity

These records never cross the public boundary:

- Account: schema version, UUID, normalized unique local username or null, display
  name, roles, disabled flag, created/updated times, authorization generation and
  approved downstream binding. Username uniqueness is enforced atomically.
- Password credential: account ID, hash algorithm/version/parameters and hash. New
  storage uses pinned and benchmarked Argon2id, or separately reviewed Node scrypt
  if runtime evidence requires it. Existing PBKDF2 is verification-only for migration.
- OIDC link: exact configured issuer and subject, account ID, linking time. Enforce
  unique issuer/subject; never auto-link using email, username or display name.
- Passkey: account ID, credential ID/public key, random opaque user handle, counter,
  transports, backup/device metadata, label and creation/last-use times. Verification
  uses a pinned maintained WebAuthn library, not handwritten cryptographic parsing.
- Ceremony: random identifier/challenge, purpose, account or discoverable-login
  context, exact origin/RP ID, issue/expiry and consumed state. Maximum five minutes;
  one-use success or failure consumption is atomic.
- Recovery code: account ID, one-way verifier, created/consumed times. Display the
  newly generated raw code once; never log or subsequently return it.
- Short session: random session verifier, account ID, authorization generation,
  authentication/recent-auth times, expiry and optional device-family ID.
- Trusted device family: UUID, account ID, label, current token hash/version, issue,
  last-use, idle/absolute expiry and revoked state. Store no reusable raw token.

Storage must serialize uniqueness, one-use consumption, token rotation, generation
changes and last-owner checks across every deployed writer. An in-memory Map or
process-only lock is insufficient when more than one BFF writer is possible. Pin the
storage/runtime choice and demonstrate crash durability before wiring the routes.

Local usernames normalize with NFKC, trim and locale-independent lowercase, followed
by `[a-z0-9][a-z0-9._-]{2,63}`. Display names support Unicode independently. Do not
normalize passwords. Login responses and work factors must not disclose whether a
username exists. Apply account/network throttling and password length/common-password
policy; pin policy and hashing costs with implementation measurements.

## Endpoint and authorization contract

Every mutating endpoint retains the existing same-origin/custom-request-header and
trusted-proxy protections. V1 credential/session endpoints require HTTPS outside
explicit loopback development. Return stable generic error codes without credentials,
password hashes, raw provider claims or token values. Bodies have bounded size.

| Operation | Required boundary |
| --- | --- |
| POST /api/auth/v1/setup | Existing deployment setup token; atomically create first owner only; no caller-supplied roles/account ID |
| POST /api/auth/v1/migrate | Verify legacy admin credential plus deployment-controlled migration ceremony; choose unique username, rehash, allocate immutable owner ID, revoke legacy sessions atomically |
| POST /api/auth/v1/password/login | Enabled mode, normalized username/password, rate limit; generic invalid-credentials response |
| OIDC callback adapter | Preserve existing PKCE/state/nonce/issuer/audience validation; resolve only an approved issuer/subject link or explicitly approved provisioning policy |
| POST /api/auth/v1/passkeys/register/options and /verify | Recent authenticated account or controlled setup; user verification required |
| POST /api/auth/v1/passkeys/login/options and /verify | Discoverable or username-first ceremony; consume challenge and verify exact origin/RP ID/signature/user verification before session issuance |
| POST /api/auth/v1/refresh | Current opaque device token in HttpOnly cookie; atomic compare-and-rotate; no account ID or queue scope accepted as credentials |
| POST /api/auth/v1/logout | Revoke current short session and device family; clear both cookies on explicit logout |
| GET /api/auth/v1/devices | Authenticated account's own device metadata only, no token hashes |
| DELETE /api/auth/v1/devices/:id | Authenticated ownership and recent authentication; revoke that family and its short sessions |
| POST /api/auth/v1/logout-everywhere | Recent authentication; revoke every family/session for that account |
| POST /api/auth/v1/recovery | One-time owner-controlled recovery code or fresh controlled setup ceremony; revoke affected sessions and require credential replacement |
| Account link/unlink and credential management | Recent authentication, explicit linking proof, atomic uniqueness; never remove the last recovery method or last enabled owner |

The exact WebAuthn options/response payload stays owned by the pinned verification
library; the public session contract does not substitute for WebAuthn verification.
Account role/disable/password/recovery operations invalidate authorization generation
and revoke affected sessions. Owner-only service administration remains separate from
ordinary listening and personal preferences. Audit events contain operation/outcome,
opaque account/device IDs and time, not passwords, tokens or private listening data.

## Rotation and concurrent clients

A successful login issues a fresh short session. Remember this Mac optionally issues
an independent random device token with a 30-day idle and 180-day absolute ceiling
(defaults from the accepted M8 plan). Rotation may extend idle expiry but never the
family's original absolute expiry. Both expiries and revocation are server-enforced.

Cookies are host-only, Secure, HttpOnly and SameSite=Lax. Device-cookie Path is the
refresh endpoint; short-session Path is `/`. Logout explicitly clears each cookie at
its original Path. Device management uses short-session identity, not cookie Path as
an access-control boundary. Cookie names and any loopback-only exceptions must be
pinned in the implementation before release; no Domain wildcard is permitted.

Refresh consumes the current verifier and installs its successor atomically. Only
the winning request issues replacement cookies. A losing concurrent request or
invalidated predecessor issues no Set-Cookie and does not revoke the winning family.
It must never clear/overwrite the winner's newer cookie or grant another session.
Client renewal is single-flight within a document and coordinated across documents;
a failed concurrent refresh rechecks the short session before showing signed-out UI.
Never treat a renewal transport error alone as explicit logout or erase its queue.
Test reordered response delivery, delayed requests, expired families, replay and
crash/restart; select the precise conflict response/retry schedule before route wiring.

## Migration and downstream identity

Legacy sessions do not silently become owner accounts. Back up the existing encrypted
settings volume, explicitly migrate the anonymous administrator, retain approved
service configuration, and record a rollback boundary. Old PBKDF2 material is removed
only after a successful durable migration; it cannot authenticate new v1 sessions.
Never infer identity from an old queue cache. Reconcile/import it only into the
explicitly verified account/upstream namespace and restore playback paused.

OIDC mode changes require an owner-controlled deployment migration. Missing Pocket ID
configuration is an error, not permission to enable password fallback. Hybrid linking
requires fresh proof of the linked method and unique issuer/subject mapping. The
resulting account ID survives subsequent method and display-name changes.

Navidrome bindings require an administrator-approved account-ID-to-username mapping.
Trusted Remote-User forwarding stays disabled until the deployed version, dedicated
source/network restrictions, header stripping and bypass prevention are verified.
Provisioning is explicit opt-in; never create an unintended first Navidrome admin.
AudioMuse retains BFF-only service authorization. Do not forward Pocket ID tokens to
an upstream that does not validate their issuer, audience, signature, expiry and scope.
Bootstrap reports application sign-in, Navidrome binding and AudioMuse health as
separate results; one degraded upstream must not invalidate the application session.

## Acceptance and implementation order

1. Merge this shared boundary after independent review. It is not account completion.
2. Implement durable accounts, credential policy, migration and authorization middleware
   with adversarial tests; select/pin storage and hashing implementation and costs.
3. Implement device rotation/revocation with concurrent-writer and response-order tests.
4. Pin WebAuthn library, canonical origin/RP ID and recovery/linking ceremonies. Prove
   incorrect origin, replay, invalid signature, missing user verification, authenticator
   cancellation/counter anomalies and account-enumeration behavior.
5. Wire public session/onboarding and Settings only after the relevant server contracts
   land. Exercise local/OIDC/hybrid migration and real owner/listener separation.
6. Deploy downstream mapping only after its threat-model/network gate; verify real
   MacBook Air Tauri and PWA sign-in, returning sessions, logout/revocation, queue
   isolation, recovery and rollback on the final candidate.

Public parser tests establish shape and accidental-secret-rejection only. They cannot
prove authentication, session rotation, hashing, WebAuthn verification or persistence.
Those implementation and real-device gates remain open.

Security references checked 2026-09-06: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
for server-enforced expiry, cookie protection and identifier renewal; [SimpleWebAuthn
server documentation](https://simplewebauthn.dev/docs/packages/server) for maintained
registration/authentication verification. Product-specific lifetimes and workflow
requirements above come from the accepted NaviMuse M8 plan.

### Controlled recovery HTTP payloads

The local runtime's recovery implementation uses the following exact payloads:

- `POST /api/auth/v1/accounts/:accountId/recovery-code`: body `{}`; requires an enabled, recently authenticated owner. Returns `201 {code,expiresAt}` once, where code is a random `r1.` bearer with 256 bits of entropy and expiresAt is a Unix millisecond timestamp 15 minutes after issue. A newly issued code supersedes the target's prior code without changing its active credentials or sessions. Delivery is owner-controlled; no email or URL-token channel is implied.
- `POST /api/auth/v1/recovery`: body `{code,password}`; requires canonical request-origin/body validation and rate admission, but no existing session. Screens the new password with the normal enrollment policy. Success atomically replaces its password and invalidates its sessions, devices and grant, returning `200 {ok:true,next:'sign-in'}` without issuing session cookies. Roles, identity, upstream assignment and registered passkeys remain unchanged.

Responses use `Cache-Control: no-store`. Codes/passwords must never be logged, placed in URLs or persisted in client storage. Expired, used and unknown valid-format codes share `RECOVERY_FAILED`; throttling returns `429 RECOVERY_THROTTLED` with Retry-After. The client must handle an unconfirmed save by offering normal sign-in rather than assuming the code remains usable. OIDC-only password recovery is disabled until its distinct controlled policy is implemented. Sole-owner lockout remains a separate deployment-controlled ceremony; the short-lived owner-issued flow does not satisfy that requirement by itself.

## Approved self-hosted privacy clarification

The owner clarified that the app connects to a self-hosted server. Account/security processing on that server is distinct from developer collection; M8 must include the [privacy policy and release audit](../privacy/M8_PRIVACY_VERIFICATION.md).

For optional username-first non-discoverable security keys, the owner's subsequent approval permits the standard mitigations and documented residual credential-ID metadata disclosure in the [passkey HTTP extension](NAVIMUSE_ACCOUNT_PASSKEY_HTTP_V1.md). This narrow exception does not authorize username-existence flags, unbounded enumeration, developer analytics, or disabling generic failures/rate admission. Default-off policy and physical-device QA remain in force.

## Owner role and enablement operations

`GET /accounts/:uuid/access` returns owner-only `{accountId,owner,disabled,revision}`. `PUT` accepts exactly `{expectedGeneration,owner,disabled}`, using the read revision as expectedGeneration. Recent owner authentication, generation comparison and last-enabled-owner protection occur atomically. Real changes revoke target sessions/devices and outstanding account-bound ceremonies/recovery grants; no-ops preserve them. Password and music assignment remain unchanged. See [owner-access evidence](../evidence/m8/owner-access/README.md) for validation and the still-required Settings/native work.


## Owner-created local listeners (M8 implementation in progress)

Account creation must bind authority to a recent enabled owner session in the same transaction as insertion, including after asynchronous password screening/hashing. The first increment adds `createManagedListenerForSession` to the private store/worker. Input accepts exactly normalized username and display name plus an already validated password credential supplied by the server. The store allocates the immutable ID, creates only an enabled Listener, adds no music binding, and issues no session. Caller-supplied roles, account IDs, actor IDs and disabled state are rejected. Username uniqueness is atomic across workers.

`POST /api/auth/v1/accounts` now accepts exactly `{username, displayName, password}` with the existing same-origin/header/transport boundary and an 8 KiB, five-second body limit. The service uses durable owner/network admission before the existing password screener and bounded Argon2 work; the transactional store rechecks authority after this asynchronous work. It returns HTTP 201 with `{ok:true, account}` containing only public listener overview fields and no cookies. Duplicate normalized usernames return `USERNAME_UNAVAILABLE` (409). OIDC-only creation is disabled. The reviewed creation UI and native QA remain to be implemented; this increment alone does not complete account creation.
