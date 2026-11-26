# Durable passkey ceremonies — schema v7

Status: private storage prerequisite; routes and passkey availability remain disabled. Built on verifier PR314, merged as 11d5739. The accepted account and verifier contracts remain authoritative.

`createPasskeyCeremony` and `consumePasskeyCeremony` run in the existing dedicated account worker. SQLite BEGIN IMMEDIATE serializes every operation across workers. New databases and schema 1–6 databases upgrade transactionally to schema 7; future versions fail closed. Existing accounts and credentials remain unchanged.

## Creation and binding

The private service supplies a library-generated challenge and deployment-controlled origin/RP ID. The verifier's canonical-origin policy is applied. Challenges are canonical base64url encoding 32–128 bytes and are globally unique among outstanding ceremonies. Browser binding secrets encode 32 random bytes with a distinct `p1.` prefix; only a domain-separated SHA-256 verifier is stored. Raw binding or session tokens never become database ceremony fields or public JSON.

Each row contains a random UUID, purpose (`register` or `login`), challenge, exact origin/RP ID, binding verifier, creation time and server expiry at five minutes. Registration additionally stores an account ID, authorization generation and hashed original session binding. Identity comes from current recent session authentication under the insertion transaction; callers cannot assign the account. Login ceremonies have no account/session identity, supporting discoverable login without username disclosure.

A binding has at most four outstanding ceremonies and the store has a 4,096-row global ceiling. Expired rows are pruned during creation/consumption. These bounds prevent unbounded storage growth; the future HTTP service must additionally enforce network admission before issuing browser cookies or ceremonies. They do not replace rate limiting.

## Consumption

The caller supplies the stored ceremony ID, browser binding and trusted expected purpose/origin/RP ID. Wrong bindings or contexts do not consume another browser's attempt. Registration also requires the original session token, not another valid session for the same account.

A correctly bound live row is deleted in the transaction before being returned for cryptographic verification. Enrollment then rechecks the original enabled session/account generation and recent-auth window inside that transaction. A now-revoked, changed or no-longer-recent session returns no proof while retaining the deletion. Expired or future-issued rows cannot produce proof. Concurrent consumers have exactly one winner.

The returned object is private proof context, not authentication. The service must consume a recognized verification/cancellation attempt before checking its cryptographic response; failure cannot restore the challenge. The later credential/session transaction must recheck captured authorization state and credential revisions after verification. This change does not implement credential enrollment or session issuance.

## Backup and recovery

Backup snapshots include schema 7, but offline restore discards every outstanding ceremony together with sessions and device families. Restoring an old snapshot cannot revive an old browser challenge. Existing schema compatibility tests now remove the new table when constructing deliberately old-schema fixtures and expect the current schema version in backups.

Tests cover wrong browser/purpose/origin/RP/session context, duplicate challenge rejection, recent-auth enrollment, revocation and password-generation changes, exact expiry, outstanding caps, two-worker consumption races, close/reopen persistence, SIGKILL after acknowledged consumption, schema-six migration, and backup discard. Process-crash evidence is not a claim of physical power-loss durability. No production account database or container volume was migrated during development.

Before enabling passkeys: implement durable credential records and opaque user handles, guarded enrollment/login services, admission and cookie boundaries, client ceremonies, controlled recovery/linking and native/PWA acceptance. Public availability stays false until those consumers pass independent review and real-device verification.

Validation: 848 tests pass, zero failures/skips; the production build passes. All seven focused ceremony tests pass in an isolated Linux arm64 Node 22.23.2 QA-runtime container, without production volumes or published ports. See ../evidence/m8/account-passkey-ceremonies/linux-node22.txt.
