# Account storage v1 implementation prerequisite

Status: private identity storage implemented; no route or live account enabled.
Schema-v2 credential integration is specified in
[NAVIMUSE_ACCOUNT_CREDENTIAL_INTEGRATION.md](NAVIMUSE_ACCOUNT_CREDENTIAL_INTEGRATION.md).
Extends NAVIMUSE_ACCOUNT_V1.md. The private record returned by this store is not the
public session response and must never be serialized wholesale by a route.

## Runtime and durability

`server/accountStore.mjs` uses built-in `node:sqlite`. The minimum Node engine is
22.23.2, matching the currently pinned production image, and is recorded in package
and lockfile metadata. Node 20 is no longer supported for this implementation.
Node 22's SQLite API remains experimental: upgrades must rerun the storage suite,
including multi-process and crash cases, before changing the deployment image.

Evidence on 2026-09-06: local Node 26.7.0 and isolated production-image Node 22.23.2
both passed the initial four storage tests. The isolated container had no network or live
volume mounts. It used image `navimuse:m8-tabs-6f5dd91` (digest
`sha256:e09f0d56bd78498557bf048e86611a4dd6fcb0dd6aaba36c68bc602426660a07`).

The database uses WAL, FULL synchronous commits, a five-second lock timeout, and
BEGIN IMMEDIATE transactions. Constraints and the write lock serialize bootstrap,
normalized username uniqueness, authorization checks, access changes, generation
increments and audit insertion across processes. Store methods never await inside
transactions. Failed operations roll back. Future schema versions fail closed.

A dedicated directory must be owner-private; symlink/non-directory targets and
non-private permissions are rejected. The database is created with mode 0600;
existing symlink/non-regular/non-private database files are rejected. The deployment
owns and protects parent directories. Do not put the database on network storage.

## Current operations

- Create the first immutable UUID owner only when the account table is empty.
- Create a listener through an enabled owner's authority.
- Look up an account by ID or normalized unique local username.
- Change owner/disabled state through an enabled owner, preserving at least one
  enabled owner and incrementing authorization generation on actual changes.
- Record creation/access-change events in the same transaction, containing only
  opaque account/actor IDs, operation and timestamp.

Actor IDs are private server arguments, not authorization credentials. The future
caller must verify a session before supplying one. First-owner creation requires the
existing setup-token/migration ceremony at the future route boundary. No public
account-creation endpoint exists in this change.

## Required before sign-in wiring

1. Schema v2 now stores first-account credentials in the same transaction. The
   private bootstrap operation still requires the setup/migration route boundary.
2. Add OIDC links (including accounts without local usernames), downstream mappings,
   recovery/passkey records and their atomic lifecycle constraints. Password
   persistence is implemented in schema v2; those other identity methods remain open.
3. Store short sessions/device families and verify current authorization generation
   on every authenticated request. A generation change alone does not revoke legacy
   signed cookies, which are not connected to this store.
4. Use `openAccountStoreWorker` for future request wiring; never call the synchronous
   store on the BFF event loop. Its dedicated worker serializes operations, limits
   pending requests to 64, drains accepted work on close, and rejects calls after
   close. The caller must still enforce authentication and request-size limits.
5. Integrate the deployment-only backup/restore operations described below with the
   eventual account rollout. Do not copy only the live main database file or assume
   a live tar of WAL files is an atomic database backup.
6. Benchmark contention and credentials on the deployed host; test aborted/uncommitted
   transactions during credential/device writes, upgrade rollback, backup recovery
   and actual power-loss behavior.
   SIGKILL proves process-crash recovery of an acknowledged commit, not power-loss
   durability or complete account security.

Reference: [Node 22 SQLite documentation](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html),
checked 2026-09-06. No new third-party native dependency was added.

## Worker and interrupted transaction verification

The expanded seven-test storage/worker suite passed in the isolated Node 22.23.2
production image. A second SQLite connection holds a real write lock while a caller
timer runs and the worker write remains pending; releasing it allows the operation
to finish. Close drains an accepted read and rejects subsequent operations. Startup
permission errors reject the async factory.

A separate child process starts a transaction, disables the owner without committing,
then receives SIGKILL. Reopening preserves the original enabled owner and generation.
The previously tested committed-account crash recovery remains covered.

## Consistent backup and offline restore

`createBackup(privateDirectory)` runs `VACUUM INTO` in the dedicated account worker
and publishes a uniquely named snapshot only after completion, file sync, rename
and directory sync. Files are created mode 0600 in an owner-private directory. An
interrupted operation may leave a `.partial` file, which is never returned as a
completed backup and is refused by restore. This operation is deployment-only; no
HTTP export or backup-directory input is accepted from clients.

`restoreAccountStoreBackup(backupPath, newDirectory)` is an offline utility. It
requires a private regular backup file and a nonexistent target directory. It
copies the snapshot, checks SQLite integrity, foreign keys, schema version and
required columns, then publishes `accounts.sqlite`. Existing targets are refused.
A failed target directory may remain for inspection but contains no published
database. Stop account consumers and switch to the verified restored directory
only after success; never overwrite the live database and its WAL files. Retain
the original directory as the rollback point. Backups are trusted deployment
artifacts, not arbitrary uploaded SQLite files.

The backup regression creates a snapshot with the source WAL connection still open,
adds another account afterward, restores the snapshot and verifies only the earlier
account is present. It also verifies overwrite refusal and rejection of corrupt or
incomplete files. Deployment switching and power-loss tests remain release gates.

Reference: [SQLite VACUUM INTO documentation](https://www.sqlite.org/lang_vacuum.html),
checked 2026-09-06.
