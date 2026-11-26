# Owner account overview prerequisite

`GET /api/auth/v1/admin/accounts` returns a paginated roster for the authenticated
local owner. It uses the existing account HTTP origin/cookie boundary and the
worker-backed store. Authentication and owner-role verification happen in the
same transaction as the page read. A supplied account ID cannot select an actor.

Optional query parameters: `limit` (1–100, default 50) and `after` (the UUID cursor
returned by the previous page). Unknown or duplicate parameters are rejected.
The cursor orders immutable account IDs and is not a cross-page snapshot; accounts
created while paging can require Refresh to see the full current roster.

Success: `{ok:true, accounts:[{id,username,displayName,roles,disabled,
musicConfigured,bindingRevision}], page:{limit,nextAfter}}`. `nextAfter:null` marks
the end. `musicConfigured` means an approved binding exists, not that an upstream
health check has passed. Disabled accounts remain visible to owners. No password
hashes, upstream usernames, credential references, server IDs, tokens, or device
identifiers are returned. All responses are `Cache-Control: no-store`.

Errors: 401 `SIGN_IN_REQUIRED`, 403 `OWNER_REQUIRED`, 400 `INVALID_ACCOUNT_PAGE`,
and the existing method/origin boundary failures. Revoked or expired sessions do
not retain roster access. This read does not require recent authentication;
existing binding writes continue to require recent owner authentication and an
expected revision, and invalidate affected sessions as before.

This is the prerequisite for owner Settings account selection and mapping controls.
It does not add account creation, service credential editing, recovery, or a UI,
and does not close the owner-administration or M8 acceptance gates. Existing
ordered integration/native listening holds remain in place.

Validation on the implementation branch: all 909 tests and the production build
passed. Logs: `/tmp/navimuse-owner-overview-full.log` and
`/tmp/navimuse-owner-overview-build.log`. The 26 focused account HTTP/session tests
also passed (`/tmp/navimuse-owner-overview-focused.log`). No live user account or
production binding was modified for these tests.
