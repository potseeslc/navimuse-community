# Approved Navidrome account bindings v1

Status: private storage/namespace implementation proposed for independent review.
Baseline: `ece0d2bf77feabac9e4a9baa7d982826ad50661d`.

The account contract requires administrator-approved account-ID-to-Navidrome-username
mapping. Login identity alone cannot authorize the administrator's service credentials.
Schema 5 adds one versioned binding record per immutable NaviMuse account:

- `serverId`: a version-4 UUID identifying the server-side configured Navidrome
  instance, stable across credential rotation and network-address changes;
- `username`: the exact approved upstream username, preserving case and Unicode,
  bounded to 256 UTF-8 bytes without surrounding whitespace or control characters;
- `credentialRef`: a bounded logical key into the BFF's credential configuration,
  never a file path, password, API token, URL or request-selected secret;
- revision and update time. Clearing retains a tombstone/revision so stale approvals
  cannot win after a clear/recreate cycle.

No bindings are inferred from existing accounts, local usernames, email, OIDC claims,
queue caches or environment credentials. Schema migration leaves every account
unbound until explicit approval. Private account metadata reads still omit bindings.

`setUpstreamBinding(actorId, accountId, {expectedRevision,binding})` follows the
existing private account-store ownership boundary: its actor ID must originate from
a server-verified, recently authenticated owner, not an HTTP request body. Within one
SQLite immediate transaction it rechecks that the actor is an enabled owner, checks
target existence and binding revision, writes the binding, increments the target's
authorization generation, revokes its short/device sessions and adds a credential-free
approval/clear audit event. Exact idempotent approval does not revoke sessions.
The worker interface keeps SQLite off the HTTP event loop. This is not a public
binding-management endpoint and does not itself verify a recent-auth bearer.

`accountQueueScope` uses a stable 32-byte server secret and domain-separated HMAC over
the immutable account ID, configured server ID and exact upstream username. Changing
any identity component gives a distinct opaque `queue-scope-v2` namespace. Changing
only the credential reference preserves that queue namespace while still revoking
old sessions. No previous queue is automatically imported or erased by binding work.

Backups include approved bindings and revisions. Restore retains snapshot approvals
but continues to discard all bearer sessions/device families. An operator restoring
a snapshot must revalidate its credential references against the current server
configuration before enabling upstream access; a reused credential key must never
silently resolve to a different server or username.

## Required consumers and acceptance

Before mounting the account handler, supply its namespace resolver from these approved
records. Resolve logical credential keys through an explicit server-owned registry,
check that registry server identity and username exactly match the approval, and keep
all credentials inside the BFF. A missing/mismatched binding denies upstream access.
Do not provision Navidrome users or enable Remote-User forwarding as an implicit
fallback. AudioMuse retains its separate BFF service authorization.

The approval UI/endpoint must enforce owner/recent-auth and expose a controlled
upstream selection/proof flow. Account-aware Navidrome requests, encrypted credential
registry integration, bootstrap status, local/OIDC migration, queue import and
real native/PWA owner/listener testing remain open. An account session remains valid
when an upstream is temporarily unavailable; upstream health is not application logout.

Evidence covers owner denial, approval/clear/idempotence, session invalidation,
two actual writers racing revisions, audit-trigger failure rolling back all changes,
restart/backup, v4 migration with no invented approval and namespace isolation.
Credential fixtures are structural storage records; these tests do not claim live
Navidrome authentication or production account mapping.

Integrated reviewed main `418ccfcb26d65f361485f47694b5d611281a0c5f`, including
the first-run upstream guard. All 772 tests pass with zero failures/skips and the
production build passes on Node v26.7.0. Logs:
`/tmp/navimuse-account-binding-main-tests.log` and
`/tmp/navimuse-account-binding-main-build.log`.

The unbound-session prerequisite is now merged through PR #293 and integrated
here at main `67e5e2c0b6ab26d9a78075ef7939d972965769c9`. The public parser and
HTTP handler preserve authenticated identity with a null queue namespace when
mapping is absent or unavailable. Null never grants music access. Real binding
approval or clearing still invalidates the target account generation and sessions;
lookup recovery is not a binding mutation.

Code Bot's requested investigation found no attacker-controlled secret path in this
private helper. Its required review status remains a separate merge gate. The BFF
must supply a persistent server-controlled key; the startup loader is independently
proposed in PR #294 and is not included or consumed here. Neither fixture constants
nor queue namespaces are authentication credentials. Production mounting and the
credential registry remain open.

Combined validation with PR #293: all 774 tests pass with zero failures/skips and
production build passes on Node v26.7.0. Logs:
`/tmp/navimuse-account-binding-unbound-tests.log` and
`/tmp/navimuse-account-binding-unbound-build.log`. The test run reports an occupied
Vite HMR port; all test processes completed successfully. The existing production
bundle-size warning remains. No live binding or native acceptance is claimed.

The proposed [owner HTTP routes](NAVIMUSE_OWNER_BINDING_ROUTES_V1.md) add a
bearer-based store mutation that validates recent owner authentication inside the
binding transaction. Public callers must use that boundary, not pass actor IDs to
the provisioning method. Production mounting and Settings integration remain open.
