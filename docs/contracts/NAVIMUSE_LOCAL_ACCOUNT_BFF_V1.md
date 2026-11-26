# Opt-in local account BFF integration

Baseline: `ea8988c91c91f85cd03582d07934575aa65a0581` (account Atlas scope merged).

The production Node BFF can now mount the local account runtime and route its
Navidrome metadata, media and listener writes through the approved account's private
client. This is an opt-in integration stage; the existing deployment remains legacy
unless explicitly configured. It is not a complete M8 account/UI release candidate.

## Startup configuration

| Variable | Meaning |
| --- | --- |
| NAVIMUSE_ACCOUNT_MODE | `legacy` (default) or `local`; other values stop startup |
| NAVIMUSE_ACCOUNT_ORIGIN | Canonical HTTPS origin for local mode |
| NAVIMUSE_ACCOUNT_NAVIDROME_REGISTRY_FILE | Absolute private registry file path, required in local mode |
| NAVIMUSE_ACCOUNT_INITIALIZE | Literal `true` permits initial account storage creation; omit after provisioning |
| NAVIMUSE_ACCOUNT_DEVELOPMENT_LOOPBACK | Literal `true` permits HTTP only for loopback development |
| NAVIMUSE_ACCOUNT_TRUSTED_PROXY_PEERS | JSON array of exact trusted peer IP addresses; default empty |
| NAVIMUSE_ACCOUNT_PROXY_ADDRESS_HEADER | `x-forwarded-for` (default) or `cf-connecting-ip`; trusted edge must provide one verified client IP |
| NAVIMUSE_ACCOUNT_NATIVE_ORIGINS | JSON array of supported exact Tauri origins; default empty |

The runtime stores its database and persistent secrets below `NAVIMUSE_DATA_DIR/accounts`.
The existing `NAVIMUSE_SETUP_TOKEN`/private setup-token mechanism controls first-owner
setup. Registry URLs still pass the existing Navidrome host policy. Proxy trust is not
inferred from the legacy TRUST_PROXY flag. Missing/corrupt account state is never reset
by selecting local mode or repeating initialization. Existing legacy admin/OIDC state
produces migration-required; this integration does not silently create a replacement
owner or migrate credentials.

## Request boundary

V1 setup, password login, session, refresh, logout, device and binding-management routes
are handled by the account runtime. `/api/config` advertises `accountApi`, `accountMode`
and an empty service map, with no legacy upstream URLs. Native API CORS is enabled only
for configured origins; transport and origin checks still precede protected dispatch.

Every `/api/navidrome/` request authorizes the short session and approved binding, then
captures that private client in the request context. The existing route method/body
validation remains in force. Listener writes (playlist operations, feedback, scrobbling)
use this account authorization rather than requiring a legacy Settings session. Their
write boundary still requires the custom request header and permitted origin.

No authentication returns 401; unassigned upstream or denied request returns 403;
unavailable account/upstream returns 503. Public errors contain stable codes. A local
account cannot fall back to environment/shared Navidrome credentials. Logout and binding
revocation stop subsequent metadata and media requests; in-flight authorized work keeps
its captured identity under the existing snapshot contract.

Legacy Settings/admin/provider login, global health and AudioMuse/Atlas routes return
503 ACCOUNT_ROUTE_UNAVAILABLE in local mode. This is an explicit temporary integration
limit: the per-account Settings, discovery and Atlas adapters must be mounted before
local mode is offered as the complete app. Ordinary Navidrome routes remain operational.
Static frontend assets are served normally, but the existing screens still need the
v1 session/onboarding integration; do not switch the owner's deployment to this mode yet.

The server closes the account worker when the HTTP server closes. Legacy mode retains
its existing handlers and authorization behavior.

## Evidence

A real server.mjs HTTP fixture uses actual Argon2 setup/login, owner binding approval,
then album retrieval, artwork, stream bytes, playlist creation, feedback and scrobbling.
It verifies no upstream access before setup/binding, revoked cookies fail after approval
and logout, missing write headers and foreign origins fail, legacy administration cannot
change service credentials, and every upstream call uses MusicOwner rather than the
configured legacy-shared-user. Only the breach-screen network response is stubbed; all
account/BFF/registry/transport code is real. Audio and artwork bytes are synthetic; this
is not audible playback or visual/native acceptance evidence.

Remaining M8 work includes real v1 screens, local/OIDC/hybrid/passkey/recovery completion,
migration, account-scoped Settings/discovery/Atlas routing, server-backed queues, real
native playback, each tab's QA, and release signing/notarization. No deployment changes
are part of this integration PR.

Validation: Node v26.7.0/macOS 26.6.2, all 808 tests pass with zero failures/skips
on the combined main baseline above; production build passes with the existing
bundle-size warning. Logs: `/tmp/navimuse-local-bff-combined-all.log` and
`/tmp/navimuse-local-bff-combined-build.log`.

Local Navidrome callers must now include the verified expected queue scope for both
fetch and media requests; see [account music request scope](NAVIMUSE_ACCOUNT_MUSIC_REQUEST_SCOPE_V1.md).
This prevents a stale UI from consuming another account's response after a shared-cookie
account switch. It is an identity precondition, never an authorization credential.
