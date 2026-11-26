# Account passkey service v1

The private service composes the pinned WebAuthn verifier, durable one-use ceremonies,
credential storage, and the existing immutable account/session contract. It supports
recently authenticated enrollment and discoverable login. It is not yet mounted on
HTTP routes or exposed in the sign-in UI; the published passkey capability stays off.

## Trust boundary

The future HTTP adapter must validate the configured origin, bounded JSON bodies,
CSRF context and verified network identity before calling the service. Session and
browser-binding bearers come from server-controlled cookies, never request JSON.
Only the `public` property of successful options/enrollment results may be serialized.
`bindingToken`, `issued.token`, and `issued.deviceToken` are private cookie material.
Cancellation returns generic success; all failed ceremonies return `PASSKEY_FAILED`.

Options use durable browser, network and global admission. Verification additionally
uses account admission after private credential resolution. Login options contain no
account lookup or credential inventory. The browser binding is a canonical random
32-byte bearer. Outstanding ceremony limits and deadlines remain in the store.

Verification consumes the correctly bound challenge before asynchronous cryptography.
A wrong browser does not consume another browser's ceremony. Registration is bound
to the original recent session and authorization generation. Login captures the
credential revision and account generation before verification and passes those same
values into atomic issuance. Both final storage transactions recheck the consumed
ceremony deadline, preventing asynchronous work from completing after expiry.
Counter/revision update, audit, session and trusted-device issuance remain atomic.

## Verification and remaining M8 work

Base: `490307606a31fc207fa6d114a74cfe467f4ea9a5` (PR #316).
Synthetic authenticators generate actual P-256 keys, none attestation and signed
ES256 assertions; no fake verifier is substituted. Tests exercise successful
registration/login, replay, browser binding, invalid signature, UV, cancellation,
expiry, unknown credentials, generation races, admission and transaction deadlines.
Linux evidence pins Node 22.23.2 in the disposable QA image; no production data or
volumes are mounted. These are protocol/service tests, not hardware passkey evidence.

Remaining: HTTP/cookie integration, browser/native ceremony UX and capability policy,
credential management, recovery/linking, and real authenticator acceptance. Full M8
also retains all tab, playback, Atlas/Journey and native release gates.
