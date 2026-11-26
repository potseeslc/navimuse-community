# Account preferences v1 — review candidate

This contract adds personal settings to local-account mode. It does not replace
legacy owner settings, configure services, grant upstream access, or close M8
Settings acceptance. The Settings UI must consume this reviewed API before the
local-account placeholder can be removed.

`GET /api/auth/v1/preferences` requires a valid session and returns
`{version:"navimuse-preferences/v1",accountId,revision,preferences}` with no-store
headers. A new account receives defaults at revision zero without importing the
legacy owner's values. The client must match accountId to its verified session
before applying the response, and discard stale or post-unmount responses.

`PUT /api/auth/v1/preferences` accepts exactly
`{expectedAccountId,expectedRevision,preferences}`. It requires the existing trusted
transport/origin and write-header boundary. The JSON body uses the existing 8 KiB
limit, timeout and strict UTF-8 parser. Unknown keys, missing fields, coercible
strings, unsupported enum values and enabled ordinary autoplay are rejected.
`shared/accountPreferences.js` is the exhaustive field/value schema; preferences
are a complete replacement, not a partial merge.

The account comes only from the authenticated session. expectedAccountId is a
comparison guard, never a selector or grant. The database transaction rechecks
session validity and account generation before reading or writing. A mismatched
identity returns 409 ACCOUNT_SCOPE_CHANGED without writing or disclosing the new
account's preferences. A stale revision returns 409 PREFERENCES_CHANGED with the
current snapshot for that same account. The client must show the conflict and
let the listener reload/reapply; it must not blindly retry with a new revision.
Success returns `{ok:true,version,accountId,revision,preferences}`.

Schema six adds one row per account with revision and update time. Migration
preserves accounts, sessions, bindings and credentials. Backup restore recognizes
schema six and checks the required table. Secrets/service configuration are not
part of this schema. Settings use application-account identity independently of
whether a Navidrome binding is approved; binding changes do not erase preferences.

UI acceptance remains open: load preferences before restoring/applying playback
controls, save indicators, rollback on failed save, conflict recovery, account
switch handling, persistence across relaunch, actual observable control behavior,
keyboard/VoiceOver and visual comparison with the approved Settings references.
Expose unsupported capabilities truthfully. Do not claim server-backed queues or
listening history from this preferences endpoint.

Backup verification: backup metadata is read from the database's actual
`PRAGMA user_version`. The schema-six regression saves a nondefault preference,
creates and restores a backup, verifies the old session is rejected, then signs
in again and verifies the same account, revision and saved preference. Restoring
a backup intentionally clears sessions and device families; it does not restore
an authenticated browser state.
