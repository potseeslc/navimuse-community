# Deployment

## Current Private Preview

NaviMuse is deployed on the Mac Mini through Docker Compose.

- LAN URL: `http://192.168.1.242:8099`
- Local compose path: `/Users/developer/docker/navimuse/docker-compose.yml`
- Tracked compose reference: `deploy/docker-compose.yml`
- Container name: `navimuse`
- Docker network: `music_services`

## Runtime Services

The app server reads these environment variables:

- `PORT=8099`
- `NAVIMUSE_DATA_DIR=/data`
- `NAVIMUSE_SETUP_TOKEN=<optional first-run setup token>`
- `NAVIDROME_URL=http://navidrome:4533`
- `NAVIDROME_USERNAME=<optional fallback Navidrome username>`
- `NAVIDROME_PASSWORD=<optional fallback Navidrome password>`
- `NAVIMUSE_ALLOWED_NAVIDROME_HOSTS=<optional comma-separated host allow-list for Settings-saved Navidrome URLs>`
- `NAVIMUSE_ALLOW_ANY_NAVIDROME_URL=true` only if you intentionally want Settings admins to test/save arbitrary Navidrome URLs
- `PUBLIC_NAVIDROME_URL=<browser-reachable Navidrome URL>`
- `AUDIOMUSE_URL=http://audiomuse-ai-flask-app:8000`
- `AUDIOMUSE_API_TOKEN_FILE=/run/secrets/audiomuse_api_token` for the preferred Docker-secret token source
- `PUBLIC_AUDIOMUSE_URL=http://your-audiomuse-host:8000` when the internal Docker hostname is not browser-reachable
- `NAVIMUSE_OIDC_ISSUER=https://id.example.com`
- `NAVIMUSE_OIDC_CLIENT_ID=<Pocket ID client UUID>`
- `NAVIMUSE_OIDC_CLIENT_SECRET_FILE=/run/secrets/navimuse_oidc_client_secret`
- `NAVIMUSE_OIDC_REDIRECT_URI=https://navimuse.example.com/api/auth/callback`
- `TRUST_PROXY=true` only when NaviMuse is behind a trusted reverse proxy that overwrites `X-Forwarded-For` and `X-Forwarded-Proto`

## Pocket ID sign-in

Configure NaviMuse as a confidential Pocket ID OIDC client. Register the redirect URI exactly as it appears in `NAVIMUSE_OIDC_REDIRECT_URI`; URL scheme, host, path, and trailing slash must match. NaviMuse uses authorization-code flow with PKCE, state, and nonce validation, then issues its own `HttpOnly; SameSite=Lax; Secure` application session cookie.

Pocket ID sign-ins are remembered by NaviMuse for **90 days from sign-in** on
both the website and the native app. An existing, unexpired 12-hour cookie is
upgraded once when the client checks `/api/settings/session`; an expired cookie
requires another Pocket ID sign-in. New sessions do not slide indefinitely.
Logout revokes the user's existing sessions, and provisioning disable/delete
revokes access immediately; re-enabling the user does not revive those sessions.
Clearing browser/app data also removes the login. Keep `/data` persistent across
deployments so signing keys and revocation state survive. No Pocket ID passwords
or bearer tokens are placed in browser storage. This policy does not change the
separate password-only administrator unlock or local-account session policies.


Store the client secret in the Compose secret file named by `NAVIMUSE_OIDC_CLIENT_SECRET_HOST_FILE`. Create it outside source control with mode `0600`; do not put the secret in `.env`, a Compose command, or shell history. The tracked Compose file mounts it read-only at `/run/secrets/navimuse_oidc_client_secret`.

For file-backed AudioMuse auth, place its API token in the host file named by `AUDIOMUSE_API_TOKEN_HOST_FILE` with mode `0600`, then include the optional Compose override:

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.audiomuse-secret.yml up -d --build
```

The base Compose file does not declare the optional AudioMuse secret, so direct-token deployments start normally when no host token file exists. A token saved through NaviMuse Settings still takes precedence, followed by the direct environment value, then the file-backed value.

When all four OIDC variables are present, Pocket ID replaces the legacy NaviMuse administrator-password login. The old password endpoints remain only as a migration fallback for deployments without OIDC configuration.

No AudioMuse API token is required for the health display. Set `AUDIOMUSE_API_TOKEN` for authenticated waveform and discovery endpoints. Keep the token in the deployment environment or secret store; never place it in source control or browser-visible configuration.

Navidrome credentials can be saved from the Settings tab after signing in. Saved service passwords are encrypted in the private data volume and are never returned to the browser. `NAVIDROME_USERNAME` and `NAVIDROME_PASSWORD` remain available as fallback credentials, but they are no longer required for container startup.

When editing Navidrome settings, leave the password field blank to preserve the existing saved password. Use the Settings tab Clear action to remove saved Navidrome credentials and fall back to environment values.

NaviMuse only tests and saves Navidrome URLs whose host and port match `NAVIDROME_URL` by default. Add extra `host:port` entries to `NAVIMUSE_ALLOWED_NAVIDROME_HOSTS` when migrating Navidrome to a new service name or host. Do not add wildcard, unspecified, public, or user-controlled DNS hosts; host allow-listing does not protect against DNS rebinding for names outside your control. `NAVIMUSE_ALLOW_ANY_NAVIDROME_URL=true` disables that SSRF guard and should only be used on trusted single-admin networks.

The first-run setup token comes from `NAVIMUSE_SETUP_TOKEN` when set. Otherwise NaviMuse writes a generated token to `${NAVIMUSE_DATA_DIR}/setup-token`. Back up `${NAVIMUSE_DATA_DIR}/settings.json` and `${NAVIMUSE_DATA_DIR}/settings.key` together; the key is required to decrypt saved service credentials.

Login throttling keys by socket address by default. Behind a reverse proxy without `TRUST_PROXY=true`, all users may appear to share the proxy IP, so repeated bad login attempts from one client can temporarily lock out other users behind that proxy. Set `TRUST_PROXY=true` only when a trusted reverse proxy strips and rewrites `X-Forwarded-For`; otherwise leave it unset so clients cannot spoof throttle identities. Login throttling is process-local and resets when the container restarts, so it is a guardrail for accidental or casual brute-force attempts rather than a durable account-lock system.

When NaviMuse is served over HTTPS by a reverse proxy, set `TRUST_PROXY=true` and have the proxy send `X-Forwarded-Proto: https` so session cookies receive the `Secure` flag.

After first-run setup, every NaviMuse Navidrome and AudioMuse BFF route—including artwork, waveforms, and audio streams—requires the same browser session cookie. The app keeps media URLs same-origin (`/api/navidrome/stream/...`), so a browser `<audio>` request sends that cookie normally; do not rewrite these routes to a different origin. On a LAN HTTP deployment the cookie is `HttpOnly; SameSite=Lax`; on the documented HTTPS proxy deployment it also has `Secure`. Do not set `TRUST_PROXY=true` unless that proxy strips client-provided forwarding headers and writes its own.

If the NaviMuse admin password is lost, stop the container and remove only the top-level `admin` object from `${NAVIMUSE_DATA_DIR}/settings.json`, then restart and complete first-run setup again. Do not delete `settings.key` unless you intentionally want to make saved encrypted service passwords unrecoverable.

## Commands

```bash
cd /Users/developer/docker/navimuse
docker compose up -d --build
```

The tracked compose file defaults `NAVIMUSE_BUILD_CONTEXT` to `.`. Run Compose from the repo root, or set `NAVIMUSE_BUILD_CONTEXT` to the repo root when launching from another directory such as `deploy/`.

NaviMuse requires Node 20 or newer for local installs and tests. The v0.2 preview raises the former Node 18 baseline because Node 18 is end-of-life and the browser-hook test environment requires Node 20. The Dockerfile pins a Node 22 Alpine manifest for both build and production runtime, so the supported deployment path already satisfies this requirement. Update that digest intentionally and rerun the full build/test/deployment verification when upgrading it.

Health check:

```bash
curl http://192.168.1.242:8099/api/health
```

Navidrome bootstrap check:

```bash
curl http://192.168.1.242:8099/api/navidrome/bootstrap
```

## Separate Navidrome accounts with Pocket ID

For an existing OIDC appliance, `NAVIMUSE_OIDC_MUSIC_ACCOUNTS_FILE` enables an explicit, server-managed mapping from immutable Pocket ID subjects to separate users on the configured Navidrome server. Unlisted subjects cannot authenticate to NaviMuse. Do not match accounts by email or display name.

The private JSON file contains exactly one `{ "sub": "owner-subject", "owner": true }` entry; that owner retains the existing appliance music connection and preferences. Each listener uses `{ "sub": "listener-subject", "username": "listener", "passwordFile": "/run/secrets/listener_navidrome_password" }`. Mount the mapping and password files read-only, with mode 0600. No secrets belong in source control. Invalid mappings fail startup instead of falling back to the owner.

Listeners use their own credentials for reads, streams, playlists, favorites, scrobbles, personalized mixes, and speaker grants. Preferences and logout revocation are subject-scoped; service connection changes remain owner-only. ListenBrainz connections retain their existing account-scoped namespaces. Pocket ID enrollment and Navidrome account provisioning remain administrative operations, not automatic email-based linking.

Existing owner speaker grants are accepted only when both their exact original owner scope and credential binding match. Other grants require an explicitly mapped subject. Existing owner browser sessions and their queue namespace remain stable. After editing mappings, restart the BFF and verify each account against its intended upstream identity before sharing its enrollment link.

### Pocket ID automatic music provisioning (SCIM)

NaviMuse supports Pocket ID 2.14.0's outbound SCIM user/group synchronization
against Navidrome 0.63.2. This runs in the existing BFF, with no Docker socket,
client-side upstream password, separate player, or direct database writes.

Enable only alongside the explicit `NAVIMUSE_OIDC_MUSIC_ACCOUNTS_FILE` seed
mapping described above. Existing accounts are imported by immutable Pocket ID
subject and verified Navidrome credentials; name/email collisions are never
adopted automatically. The seed owner is never rewritten in Navidrome.

- Mount a private regular file containing a cryptographically random 32-byte
  base64url token, and set `NAVIMUSE_SCIM_TOKEN_FILE` to its container path.
- Set `NAVIMUSE_SCIM_LIBRARY_IDS` to a JSON array of approved Navidrome library
  IDs, for example `[1,2]`. Provisioned accounts are always non-admin.
- Create a dedicated empty Navidrome library excluded from new-user defaults,
  and set `NAVIMUSE_SCIM_DISABLED_LIBRARY_ID` to its ID. Navidrome 0.63.2
  requires every regular user to retain at least one library, so revoked accounts
  move to this empty library. Keep its folder empty; it must not be a music path.
- The deployment's existing Navidrome connection must have administrator
  privileges. Native API JWTs stay in server memory and redirects are rejected.
- Configure the NaviMuse OIDC client's SCIM endpoint in Pocket ID as
  `https://<navimuse-host>/api/scim/v2`, with that token, then choose **Sync now**.
- Leave the client unrestricted when every enabled Pocket ID user should get
  music access automatically. Allowed User Groups can restrict future access.
- Users enroll their Pocket ID passkey and sign in to NaviMuse. They do not enter
  a Navidrome URL, username, or password. Separate upstream credentials and
  immutable subjects preserve personal favorites, playlists and history.

Pocket ID synchronizes five minutes after the latest change, and at least hourly;
**Sync now** applies changes immediately. OIDC authentication alone does not
provision or revoke upstream accounts. Until the synchronization finishes, a new
user is denied access with a provisioning message rather than using shared owner
credentials. During an outage, existing ready users continue to use music.

The private `/data/provisioning/accounts.json` registry records stable upstream
IDs, credentials, account status and session revisions. Back it up with the rest
of `/data` using encrypted/private backups. Writes are atomic and fsynced. A
pending operation denies access and can be retried by Pocket ID. Usernames in
Navidrome stay stable when Pocket ID display names/usernames change. Deleting a
SCIM user retains its private tombstone and history: the BFF rejects sessions and
speaker authorization immediately, replaces the user's music libraries with the empty disabled-user library, and
rotates the server-managed password. Restoring the same immutable identity
restores its account, but does not resurrect old browser sessions. The owner
identity is also denied NaviMuse access when disabled, without mutating its
administrator account in Navidrome. Audio already buffered by a speaker/client
is outside the scope of immediate revocation; subsequent server requests fail.

Only the authenticated SCIM API accepts lifecycle changes; browser session cookies
cannot authorize it. Supported Pocket ID operations are paginated Users/Groups
GET, POST, PUT and DELETE. PATCH, bulk requests and general-purpose SCIM filters
are not advertised or accepted. SCIM responses contain no Navidrome passwords,
JWTs, internal credentials or upstream error bodies. A generic 503 marks an
incomplete operation for retry; check Pocket ID's sync result when onboarding.

To roll back, first disable SCIM synchronization in Pocket ID. Keep the registry
and secrets private and intact. Returning to the static seed configuration only
restores access for its explicitly listed subjects; it is not a rollback for
newly provisioned users. Do not remove the mapping environment variable entirely,
because legacy unrestricted OIDC mode shares the owner's music connection.
