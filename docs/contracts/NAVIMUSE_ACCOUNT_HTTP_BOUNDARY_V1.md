# Account HTTP boundary v1

Status: private helper implemented for independent review against merged account
contract #274. No endpoint imports this helper yet. It does not depend on the held
session-storage PR #278 and does not enable local sign-in.

`createAccountHttpBoundary` accepts trusted deployment configuration: canonical HTTPS
origin, exact trusted proxy peer IPs and explicitly enabled Tauri origins. Request
Host must match the configured host/port. TLS is required directly, or a configured
peer may assert exactly `X-Forwarded-Proto: https`. Untrusted peers and comma-separated
protocol values are rejected. Forwarded Host and Forwarded For do not establish
transport trust. Deployment must restrict proxy access and strip incoming forwarded
headers; this helper cannot establish network topology.

Any supplied Origin must match the configured canonical origin or explicit native
origin. Writes additionally require `X-Requested-With: NaviMuse` or `NaviMuse-Server`.
Origin-less clients still require transport/host checks and the write header. No
wildcard origin or proxy is accepted. This is transport/CSRF protection only, never
proof of authentication or account authorization. Endpoint CORS handling must use
the same origin policy and must not allow arbitrary credentialed origins.

The development exception requires an explicit flag, HTTP on a loopback canonical
host, and a loopback socket peer. It does not accept remote HTTP or make proxy headers
proof of development locality. Production and development cookie names are separate.

## Network identity for login admission (2026-09-06)

`networkAddress(req)` first enforces the same write boundary, then returns a valid
socket IP for direct clients. Direct clients' X-Forwarded-For, Forwarded,
CF-Connecting-IP and X-Real-IP headers cannot select a different admission bucket.
For an exact configured trusted proxy peer, the deployment-selected header must
instead contain one IP. `proxyAddressHeader` defaults to `x-forwarded-for`; the
only other permitted value is `cf-connecting-ip`. There is no fallback between them. Missing values, lists, duplicate headers, ports, bracketed addresses and
IPv6 zone identifiers fail closed. There is no leftmost/rightmost chain heuristic
and the legacy broad `TRUST_PROXY` flag does not affect this helper.

Deployment must configure the immediate peer's exact socket address and make that
edge supply the selected header with the verified client IP. Multi-proxy deployments
must resolve their trust chain at that edge; appending an unverified incoming header
is incompatible with this policy. Verify the actual proxy configuration before
enabling login routes. The returned address is private input to keyed admission,
never account identity or a value to log/return to a client. The login service owns
canonicalization and IPv6 /64 grouping. No production endpoint calls this helper yet.

`test/accountNetworkBoundary.test.mjs` checks spoofed direct headers, configured
proxy identity, malformed/ambiguous values and transport/Origin/write rejection.
It also sends real Node HTTP requests through an isolated loopback server to verify
duplicate-header parsing, chain rejection and direct-client spoof protection.
These synthetic tests do not establish the deployed reverse proxy's configuration.
Validation on Node v26.7.0 against main `9201a1a66a0e224937dd2c25d0c372ba4f2cf6d1`: 739 tests pass with zero failures/skips and the production build passes.
Logs: `/tmp/navimuse-account-network-tests.log` and
`/tmp/navimuse-account-network-build.log`. This branch does not include PR #286's
password-login service; their integrated flow still requires verification after review.

## Cookie contract

Production cookies are `__Host-navimuse_session_v1` at `/` and
`__Secure-navimuse_device_v1` at `/api/auth/v1/refresh`, Secure, HttpOnly, SameSite=Lax
and with no Domain attribute. Cookie Max-Age derives from a supplied verified expiry;
the caller supplies the server-owned deadline. Logout clearing uses each exact name
and path with Max-Age=0. Explicit loopback development uses unprefixed names ending
in `_dev` and omits Secure. No legacy cookie is accepted as a v1 token.

Cookie parsing limits the header to 8192 characters, rejects duplicate cookie names,
and requires canonical 46-character `s1.`/`d1.` tokens of the correct kind. Percent-
encoded substitutions and noncanonical base64url are rejected rather than normalized.
The cookie writer rejects invalid token values, preventing cookie attribute injection.
Raw tokens must only pass between this helper, the private session store and response
headers, never public JSON, browser state, logs or evidence artifacts.

Tests cover configured/direct/proxied transport, foreign/null origins, required write
headers, explicit loopback/native policy, protected cookie attributes, exact clearing
paths, token-type separation, duplicates, encoded substitutions and header bounds.
These tests do not establish an authenticated endpoint or browser cookie behavior.

Remaining: merge reviewed session persistence; wire bounded body parsing and durable
account/network throttling; controlled setup/migration and password proof; public
session projection and every-route owner/listener authorization; attach headers only
after successful durable issuance/rotation. A losing refresh must send no Set-Cookie.
Pin its conflict/retry behavior and test reordered responses with native/PWA clients.

Verification on 2026-09-06: 695 tests and the production build pass on the merged
main baseline `57176b380d9ecfb8af20c5ffdf9c022986f1d881` plus this helper. All four
focused tests also pass on isolated Node 22.23.2 Linux arm64 in the deployed image,
without live data mounts. The held session branch's tests are not part of this base.

## Current-main integration and token evidence (2026-09-06)

Integrated reviewed main `0fa69aca276642736f137985cd1f494eaf30050a` into
PR #279's `ff86658dcbd35a012eec6790ce123eb000a3d979` baseline. This combines
the boundary helper with the current Atlas server/contracts while preserving the
separate session-persistence review gate. The merge was clean and build passed.

An additional regression enumerates all 64 possible final base64url symbols for
both s1 and d1 tokens. A 32-byte token requires two unused zero bits: the reader
and writer accept only the 16 canonical tails and reject the 48 aliases. The test
also rejects padding, ordinary-base64 slash/plus, percent substitutions and embedded
whitespace. Existing duplicate-cookie, kind, prefix, length and request-origin
checks remain. This validates format, not account authentication; the session
store must still verify the opaque token.

The prior review's malformed-token allegation contradicts its own verification
that no vulnerable path was found. The production helper retains its strict
alphabet/length/kind checks and decode/encode canonicality check. Replacing that
with a regex alone would lose the unused-bit check. No production validation was
weakened to satisfy the contradictory claim.

Final suite evidence: `/tmp/navimuse-auth-http-main-final-tests.log`. Build:
`/tmp/navimuse-auth-http-main-build.log`. All original live HTTP/account/UI/native
acceptance requirements above remain open; this is a reviewed-helper prerequisite.

## Merged session-store integration (2026-09-06)

Integrated main `7e27b5f56dd320df90dee5ab64d2babef7dd78f4` after session
PR #278 passed review and merged. All 736 tests and the build pass with the real
session worker and HTTP boundary together. Logs:
`/tmp/navimuse-auth-session-boundary-tests.log` and
`/tmp/navimuse-auth-session-boundary-build.log`.

The boundary/store integration test issues a storage-only session, serializes and
reads the protected cookies, authenticates through the worker, rotates a device
predecessor once, rejects wrong-kind and unissued tokens, then revokes all sessions
in that family. It does not simulate password verification or claim that login
endpoints, browser cookie handling or live identity mapping are complete.

The latest review's exact cookie-injection example is rejected by cookie() before
any string is returned. New coverage also replaces a character with semicolon,
equals, CR, LF, tab, space, colon, comma, quote and backslash while preserving the
46-character length; all are rejected. Appended Domain/Path and CRLF Set-Cookie
payloads are rejected too. Existing production length/alphabet/canonicality checks
already enforce this; no production sanitizer change or review bypass was made.


## Login-service integration (2026-09-06)

Integrated reviewed main `a1d472fe3f2b5524a50c01c7a7214923d45a8974`, which
contains PR #286's durable login admission and password verification. The new
`test/accountLoginBoundaryIntegration.test.mjs` connects the real HTTP boundary,
real Argon2 service and real account worker through an isolated test adapter.
It proves malformed/duplicate/foreign-origin requests do no password work and
issue no cookie; a successful login produces a short cookie that authenticates
against durable storage; wrong passwords have generic errors; account admission
across different networks stops further hashing without invalidating an existing
session. The adapter uses fixed synthetic credentials and is not a production
endpoint or a body-parser/remember-device/browser-cookie acceptance claim.

Code Bot's manual investigation of `d2119480281e20a52538b0f5b147bb055f44f5d6`
reported no duplicate-header bug and confirmed the real HTTP tests. Its automatic
review remained failed despite that finding; no status was changed or bypassed.
This integration requires a fresh review on its own exact head.

Read-only deployment inspection found NaviMuse with `TRUST_PROXY=true`, service
address `172.21.0.2`, and cloudflared attached to the same `music_services` network
at `172.21.0.4`. Those observed container addresses are not pinned deployment
configuration. The available recent cloudflared logs did not establish NaviMuse's
ingress rule or header overwrite behavior. No production configuration changed;
exact edge trust and header behavior still require verification before activation.

Integrated validation: all 748 tests pass with zero failures/skips and the production
build passes on Node v26.7.0. Logs are
`/tmp/navimuse-account-network-integration-tests.log` and
`/tmp/navimuse-account-network-integration-build.log`.


## Explicit Cloudflare header policy (2026-09-06)

Cloudflare's [HTTP header documentation](https://developers.cloudflare.com/fundamentals/reference/http-headers/)
says existing X-Forwarded-For values can be extended into a chain. CF-Connecting-IP
provides the client address, with special semantics for Worker subrequests and
Pseudo IPv4. Therefore a direct Cloudflare Tunnel deployment can explicitly select
`proxyAddressHeader: 'cf-connecting-ip'` after verifying its edge path. The default
single-IP XFF behavior remains unchanged for other proxies.

The option is trusted deployment configuration, not request-controlled. Both modes
require the exact configured socket peer, existing TLS/Host/Origin/write checks,
one valid IP and no duplicate selected header. Missing/invalid CF-Connecting-IP
never falls back to XFF; direct clients cannot select identity through either
header. A legitimate CF header can coexist with an ignored XFF chain.

Verify the actual tunnel ingress, reachable peers, Worker routes, managed transforms
and Pseudo IPv4 settings before activation. In particular, same-zone Worker code
can affect the reported client address; do not treat arbitrary Worker-supplied
values as trusted network identity. No Cloudflare setting or production service
was changed by this implementation. Tests simulate the documented edge output,
including real HTTP duplicate CF headers and absence of fallback; they do not
prove this deployment's edge configuration.

Integrated reviewed setup main `da5d6161b6121e9728d57711ec8e799accfe7e08`.
The HTTP integration fixture now obtains its owner through token-gated setup before
real password login and cookie authentication. Screening and the token verifier
remain synthetic fixture boundaries, not live-provider or HTTP setup-route proof.
All 754 tests pass with zero failures/skips; build passes on Node v26.7.0. Logs:
`/tmp/navimuse-account-network-setup-tests.log` and
`/tmp/navimuse-account-network-setup-build.log`.
