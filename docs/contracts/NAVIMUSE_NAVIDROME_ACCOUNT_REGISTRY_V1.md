# Verified private Navidrome account registry v1

Status: runtime assembly prerequisite; no production registry or account mount.
Baseline: `a68163a6e4676cb75c1c33c7af7123a44f9ec1a0`.

`createNavidromeAccountRegistry` takes an array of trusted server configuration
records: credentialRef, serverId, url, username and password. It does not read HTTP
payloads, OIDC claims or public Settings input. The required assertAllowedUrl function
must throw for any destination forbidden by deployment policy; it runs before client
construction. Existing BFF assertAllowedNavidromeUrl has this assertion contract.

At most 256 entries are accepted. Logical references are unique and exact usernames
are preserved. Entries sharing one server UUID must use the same canonical URL,
including its path prefix. Different users on that configured server may have separate
references. A stable UUID is an operator-owned instance identity; the Subsonic ping
protocol cannot prove a server's historical identity after an operator changes DNS,
URL or restore configuration. That remains an explicit migration/restore responsibility.

Each entry constructs a private client with captured configuration. The registry
returns only identity metadata and request functions for createAccountUpstreamAccess;
raw URLs/passwords are not returned. These clients remain private BFF objects, never
public settings responses. A matching registry record alone does not approve an
account: the binding transaction remains mandatory.

bindingForCredential resolves only a known key and makes an authenticated ping before
returning its binding metadata. Unknown references return null without network access.
Wrong credentials, unavailable services, redirects, non-JSON/failed responses, malformed
UTF-8/JSON or responses above 16 KiB cannot produce a binding. The request has an
8-second deadline and failures expose only a generic verification error. No fallback
credentials, inferred mapping or automatic approval are provided.

The username is part of the fixed salted-token authentication request. Successful ping
verifies the configured credentials under that server's protocol; it does not grant a
NaviMuse role or establish the caller's session. Upstream outages after approval still
use the account access boundary and never authenticate another client.

## Evidence and integration work

Real loopback HTTP tests check the authentication token against configured fixture
credentials, then feed the verified record and client into a real SQLite-worker account
access test. Unassigned access is denied; explicit approval plus a newly issued session
allows the intended client. Other tests reject wrong credentials, oversized responses,
URL-policy denial, duplicate references and conflicting URLs for one server identity.
Original configuration mutation cannot change captured credentials.

This does not establish live Navidrome identity or production sign-in acceptance.
Private configuration loading/storage, BFF startup policy, owner Settings integration,
account-route mounting and native/PWA end-to-end QA remain open. No production secret
or binding was read or changed by these tests.

On Node v26.7.0, all three focused tests and all 787 suite tests pass with zero
failures/skips; production build passes. Logs:
`/tmp/navimuse-account-registry-focused.log`, `/tmp/navimuse-account-registry-all.log`,
and `/tmp/navimuse-account-registry-build.log`. Existing occupied HMR-port and
bundle-size warnings remain; both commands completed successfully.
