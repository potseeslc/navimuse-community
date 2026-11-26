# Passkey credential persistence and session issuance — schema v8

Status: private worker/service prerequisite on merged ceremony PR315 (1b05d00). Enrollment/login routes, credential-management UI and passkey availability remain disabled. This does not complete M8 account access.

## Records and enrollment

Schema 8 adds a durable random 32-byte WebAuthn user handle per immutable account, plus globally unique credential IDs, COSE public-key bytes, counter, transports, device/backup metadata, label, revision, creation/last-use timestamps and revocation state. Existing schema 1–7 databases migrate transactionally. No private key or biometric data is stored.

`preparePasskeyEnrollment(sessionToken)` verifies recent authentication under the write transaction, allocates the account's handle once, and returns private account/generation context plus credential IDs/transports for excludeCredentials. It does not return public-key material in that options list. Handles remain stable across reopening and differ between accounts. There is a 20-active-passkey account limit.

`registerPasskey` accepts only the service's successfully verified registration result after consuming its bound ceremony. In a new transaction it rechecks the original recent session, captured account generation and stored user handle, then inserts the credential and audit event atomically. A credential ID cannot attach to two accounts, including a formerly revoked credential ID. It never trusts a client-selected account ID or treats a valid-looking public-key record as proof.

The store validates sizes and metadata shape; it is not a second CBOR/signature verifier. Cryptographic verification remains owned by the pinned library adapter. Public HTTP consumers must not pass request bodies directly to these operations.

## Authentication and races

`getPasskeyCredential(id)` is a private lookup of an enabled account's active credential, account generation, credential revision and user handle. None of its key material, revisions or internal account proof is a public login response. Discoverable and username-first services must resolve the account from this stored record and apply the verifier's handle/credential checks.

After consuming a ceremony and verifying a response against that captured record, `issuePasskeySession` rechecks enabled account, generation, active credential, revision, device type and counter while holding the write lock. It updates counter/backup state/revision/last use and issues the existing short session and optional trusted-device family in the same transaction. Positive counters must increase. Zero-counter synced credentials are supported, with revision comparison ensuring that concurrent completions cannot both issue from the same captured record. The one-use ceremony remains required; revisions do not replace it.

Password and passkey issuance share the existing token/device helper, retaining session limits, device limits, lifetimes, generation binding and hashed-token storage. A failed session write rolls back credential changes, new device family and login audit together. A credential or account revoked/changed during expensive verification cannot issue from its stale proof.

These operations are private authorization-boundary building blocks. The next service must connect consumed ceremony → captured credential → cryptographic result → atomic issuance without refreshing the captured proof after verification. No public route currently invokes them.

## Backup restore and recovery

Snapshots retain credential records and account handles, but offline restore marks every restored passkey revoked and increments its revision. It also retains the existing removal of sessions, device families and ceremonies. An older snapshot must not silently reactivate a key revoked after that snapshot. Metadata remains available for controlled recovery/audit; fresh passkey enrollment is required after restore.

All currently supported local accounts retain their password credential through restore. Future passkey-only/OIDC policies must include the reviewed owner-controlled recovery ceremony before they can ship. This is not authorization to enable such modes or migrate production data. Credential rename/removal, last-recovery-method protection, recovery grants and linking remain separate required consumers.

## Validation scope

Tests use explicitly synthetic storage-only public-key bytes. They prove persistent opaque handles, unique cross-account ownership, recent-auth/generation/handle enrollment checks, zero-counter two-worker issuance races, atomic rollback after a forced session-write failure, counter rejection, disable/re-enable generation changes, credential revocation, schema-seven upgrade and backup revocation. They do not claim these synthetic records are valid authenticators. Cryptographic tests live with the verifier; full composed service/HTTP and real Touch ID/native/PWA tests remain required.

Validation: all 854 tests pass with no failures or skips; production build passes. Six focused tests pass in an isolated Linux arm64 Node 22.23.2 QA runtime with no production volume mounts or published ports. See ../evidence/m8/account-passkey-credentials/linux-node22.txt.
