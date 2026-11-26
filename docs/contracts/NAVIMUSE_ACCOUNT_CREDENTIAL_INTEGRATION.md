# Account credential persistence — schema v2

Status: private account/credential integration implemented; HTTP authentication,
sessions and live migration remain unwired. Prerequisites #275 and #276 are merged.

Schema v2 adds a password_credentials table keyed by immutable account ID, with
credential version/hash, monotonic revision and timestamps. Opening schema v1 adds
this table transactionally, without guessing credentials for existing identity-only
records. Future unknown schema versions fail closed. Backups publish schema v2;
restore accepts valid v1/v2 snapshots and reports the actual restored version.

`createFirstOwner(input, credential)` and `createListener(actorId, input, credential)`
now require the approved Argon2id credential shape. Account insertion, credential
insertion and audit insertion share one transaction. A failed credential write
leaves neither an orphaned account nor a misleading creation event. Hashing and
screening happen before acquiring the database transaction; uniqueness and owner
permission are still checked inside it.

`getPasswordCredential(accountId)` is an internal worker/BFF operation returning a
credential and its revision. It must never become a public API or be serialized to
React state. Ordinary account reads/creation results omit credential material.
Record validation is in passwordCredentialRecord.mjs, shared by the private store
and cryptographic helper without loading native hashing code in the database worker.

`replaceOwnPassword(actorId, {expectedGeneration, expectedRevision, credential})`
requires a currently enabled account with the captured authorization generation and
credential revision. It updates the credential, increments both revision and account
authorization generation, and inserts an audit event in the same transaction. Stale
replacements fail without changing current data. The caller must derive actorId and
captured revisions from recently verified server authentication, never trust values
submitted by the client, and use screened credentials for new password enrollment.

## Evidence

Tests exercise real Argon2id enrollment with a synthetic screening decision, durable
credential reads through the worker, successful verification, replacement and
rejection of old passwords. A SQLite trigger deliberately rejects credential insert
after account insertion; the transaction rolls back both account and audit data.
A schema-v1 fixture upgrades while retaining its owner identity and no credential.
Existing competing-writer, crash, worker, and backup tests now supply explicitly
synthetic storage-only credential records; those fixtures are not login credentials.

Verification on 2026-09-06: 689 tests passed and the production build completed.
The 12 account/store/worker/backup tests also passed in an isolated instance of the
deployed `navimuse:m8-tabs-6f5dd91` image (Node 22.23.2, Linux arm64), using synthetic
fixtures and no live volume mounts. This is runtime compatibility evidence, not
live sign-in or native acceptance.

## Required next

- Add short-session and trusted-device persistence, with issuance rechecking account
  state and credential revision/generation atomically after expensive verification.
- Verify current generation, disabled state and revocation on every authenticated
  request. A generation increment here does not revoke existing legacy cookies.
- Implement rate-limited setup/login/recent-auth/password-change routes using these
  private operations. A successful hash comparison alone is not authorization.
- Add controlled legacy PBKDF2 migration and credential attachment/recovery for any
  identity-only records. Do not silently promote old sessions or skip screening.
- Complete OIDC/passkey/recovery linking, downstream identity, and real-device flows.

No live accounts, settings, credentials or production volumes were modified by this
work. The rollout must retain an encrypted-settings backup and a verified database
backup/restore boundary before enabling the new authentication system.


## Review follow-up

The first review claimed a missing hash could pass validation, while its own focused
verification confirmed the hash type check. A version-only record has one key and
also fails the existing string/PHC checks. Direct regression cases now cover absent,
undefined, null, empty and malformed hashes. Required fields must additionally be
own properties, so inherited credentials cannot satisfy the record shape.

The ordinary account reader constructs an explicit metadata object; it does not call
`getPasswordCredential` or merge credential records. A separate worker-level test
checks the exact returned keys for creation, ID lookup and username lookup after
credentials have been persisted. HTTP serialization remains unwired.
