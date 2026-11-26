# Account passkey verification v1

Status: cryptographic prerequisite for M8 account step 4; independent review required before route/storage consumers. No passkey route, UI availability flag, account migration or production configuration is enabled by this change.

## Pinned verification boundary

`@simplewebauthn/server` is pinned to **14.0.1**, including the resolved dependency graph in package-lock.json. The private `server/accountPasskeyVerifier.mjs` adapter owns library calls. Registration uses ES256 and RS256, attestation `none`, discoverable credentials required, and user verification required. It does not restrict users to platform authenticators, allowing synced passkeys and security keys. Options request at most five minutes; that browser timeout does not replace server expiry.

Canonical origin is an exact HTTPS origin with no path, trailing slash, credentials, query or fragment. RP ID must equal that origin's DNS hostname, not a parent suffix, request Host header or user input. IP-address, Tauri-scheme and changing LAN-host configurations are rejected. Explicit development permits only `http://localhost[:port]` with RP ID `localhost`. Production must use the same deployment-controlled canonical origin as the account HTTP boundary, and record the actual hostname before enablement. This prerequisite does not assign or change the owner's deployment domain.

The native client must perform the ceremony after its first-party HTTPS redirect, under that same origin. Local Tauri origins do not become allowed WebAuthn origins merely because they are allowed by HTTP transport policy. Top-level first-party ceremonies are required; cross-origin/iframe responses are rejected, including responses missing `topOrigin`. Client data decoding, CBOR/COSE parsing, RP hash, challenge, type, user-presence/user-verification, attestation, signature and counter checks use the maintained library.

The adapter has no caller override for expected origin, RP ID, verification requirement or attestation policy. Verification failure returns only `{verified:false}`, without library exception text or response data. Successful results are private service data, not session JSON.

Each account receives a random 32-byte opaque WebAuthn user handle, separate from username and immutable account ID. Discoverable login must match the returned handle to the credential's stored account handle. Username-first login may omit the returned handle; if supplied, it must still match. Response credential ID must match the stored credential selected by the service. Display names never authorize an account.

## Required durable ceremony and issuance consumer

The next storage/service change must implement these requirements before routes are enabled:

1. Allocate a random ceremony identifier and challenge. Store purpose, exact configured origin/RP ID, creation/expiry, account/generation and originating authenticated-session context for enrollment. Bind unauthenticated login ceremonies to an independent HttpOnly cookie secret; never authorize from a client-supplied account ID or user handle.
2. Atomically consume the matching unexpired ceremony on the first verification attempt, including invalid/cancelled responses. An incorrect binding must not consume another browser's ceremony. Limit issuance and outstanding ceremonies using verified network admission. Enforce five-minute expiry server-side and prune expired records.
3. Registration requires recent verified authentication or a separately controlled setup ceremony. On completion recheck session, enabled account and captured generation atomically. Uniquely insert credential ID, public key, user handle, counter, backup/device metadata, label and timestamps. No implicit account linking or account creation.
4. Login verifies the response against the stored credential and ceremony. In one transaction recheck account generation, credential revision/revocation, update counter/backup metadata and issue the existing short session/optional device family. Cryptographic success alone is not authorization. Concurrent completions cannot overwrite a newer credential counter or bypass revocation.
5. Zero-counter synced credentials remain valid under the library's counter policy; one-use ceremony storage is mandatory even when the counter is always zero. A repeated/non-increasing positive counter is denied with the generic failure, not silently retried through password.
6. Recovery uses a separately rate-limited, owner-controlled one-time code with only its one-way verifier stored. Consume it and revoke sessions/device families atomically, then issue a short credential-replacement-only grant, not music access. Grant expiry, replacement, generation checks and code reissue must be independently tested before activation.
7. Method linking requires recent existing authentication plus fresh proof of the new method. OIDC links remain unique exact issuer/subject pairs; no email/name matching. Credential removal must preserve a usable recovery method and the last enabled owner. Recovery/linking consumers must receive independent review.

## Evidence scope

Tests construct synthetic `none` attestations and real ES256-signed assertions using a generated key pair. They exercise valid enrollment/login, wrong origin/RP/challenge/type, invalid signature, missing user verification/presence, cross-origin responses, wrong credential/account handle, positive counter rollback and zero-counter synced credentials. Option tests verify discoverability, verification requirements, fresh challenges, timeout and configured algorithms.

These are cryptographic boundary tests, not durable replay, account enumeration, enrollment authorization, real Touch ID/PWA, cancellation UI, recovery or end-to-end session evidence. Those tests belong to the next consumers and final M8 acceptance.

References checked September 7, 2026: [SimpleWebAuthn server documentation](https://simplewebauthn.dev/docs/packages/server), [passkey guidance](https://simplewebauthn.dev/docs/advanced/passkeys). Installed package metadata and source at 14.0.1 are the implementation authority when documentation examples differ.

The four focused tests also pass in an isolated container using the existing QA runtime image and Node 22.23.2 on Linux arm64, with no production volume mounts or published ports. See ../evidence/m8/account-passkey-verifier/linux-node22.txt. Dependency installation reports zero known vulnerabilities at the time of the check. This is not a claim that the dependency graph is vulnerability-free.

The main baseline retained one source-text assertion against the former location of app settings. This branch applies the already established ff156f0 correction, asserting the exported settings values after the packaging move; no playback behavior changes.

Final local validation: all 841 tests pass with no failures or skips; production build passes. This is the main-based account branch, not the separately tested 851-test Search/player integration candidate.
