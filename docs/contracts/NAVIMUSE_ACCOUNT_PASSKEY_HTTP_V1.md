# Account passkey HTTP v1

This mounts the composed passkey service behind the account request boundary and
existing immutable account/session projection. Base: PR #317 merge
`e0cd93a1c414821b0173cfb3f4b37f61dc7f3710`.

## Runtime policy

Local mode may explicitly set `NAVIMUSE_ACCOUNT_PASSKEYS=true` (runtime API:
`passkeyEnabled:true`). The default stays off. Enabling requires the configured
canonical HTTPS domain and its exact hostname as RP ID. The explicit development
exception accepts HTTP localhost only. LAN IP, custom Tauri and invalid origins
cannot become relying-party scope. Invalid enabled configuration fails startup.

This enables server endpoints; the Settings enrollment UI, sign-in UI, username-first
compatibility path, recovery/management, and native first-party redirect remain
required M8 work. No production deployment or hardware authenticator acceptance is
claimed by this contract. A custom-origin Tauri client must use the future canonical
first-party ceremony flow rather than invoke these endpoints from its custom origin.

## Routes and request boundary

All paths are under `/api/auth/v1`, use POST JSON, require the canonical Origin,
verified transport/network identity, and the existing X-Requested-With check.
Bodies have a 32 KiB ceiling, strict UTF-8, no content compression, and a five-second
read deadline. Existing non-passkey account bodies retain their 8 KiB ceiling.
Top-level request keys are exact; session, binding, account and verification state
cannot be supplied as JSON authority. WebAuthn response cryptography and protocol
validation remain owned by the pinned library and composed service.

| Route | JSON input | Success |
| --- | --- | --- |
| `/passkeys/register/options` | `{}` plus recent session cookie | 200 options and ceremony ID |
| `/passkeys/register/verify` | ceremonyId, response, label | 201 credential metadata |
| `/passkeys/login/options` | `{}` | 200 discoverable options and ceremony ID |
| `/passkeys/login/verify` | ceremonyId, response, optional remember | 200 existing account session |
| `/passkeys/cancel` | ceremonyId, purpose (`register` or `login`) | 200 generic success |

The browser binding is an opaque `p1` bearer in a host-only HttpOnly SameSite=Strict
cookie, Secure in production, at `/`, expiring with the ceremony (at most five
minutes). Production uses the `__Host-` prefix. Duplicate, wrong-kind and malformed
cookies are rejected. Option retries reuse the valid browser binding; cancellation
consumes its one ceremony without disturbing concurrent ceremonies or session cookies.
Logout/revocation that clears account cookies also clears the binding at its exact path.

Only public ceremony options/credential metadata are serialized. Successful login
uses the same session and optional trusted-device cookie issuance as password login,
retires the previous explicit session, and preserves an authenticated account even
when its approved library mapping is unavailable. Failed verification never sends
replacement authentication cookies and returns only `PASSKEY_FAILED`. Parser and
transport failures retain their existing bounded public errors.

## Evidence scope

Actual HTTP requests run through a worker-backed SQLite store and generated signed
ES256 assertions, covering enrollment, login, replay, cancellation, browser binding,
origin denial, body limits, and server-only context. The assembled runtime test also
proves explicit enablement and rejects a LAN-IP relying party. Cookie tests include
canonical encodings, injection, duplicate values, Secure/HttpOnly/SameSite and clearing.
These protocol tests do not substitute for real Touch ID/security-key or native UX QA.

## Opt-in username-first extension (mitigated policy approved)

The implementation adds canonical `GET /passkeys/policy` returning exactly `{usernameFirst:boolean}`. With explicit deployment opt-in and passkeys enabled, login options also accept exactly `{username}`; empty-body discoverable login remains supported. Registration options reject username input. Named challenges bind normalized username lookup to account generation and credential snapshots in schema 10. Verification accepts omitted user handles only for that bound flow.

This path remains disabled by default. The owner approved the standard privacy mitigations; live rollout and physical-device QA remain pending. The privacy limitation, mitigations, configuration and validation are recorded in [username-first evidence](../evidence/m8/passkey-username-ui/README.md). This records a bounded exception to absolute indistinguishability for the documented credential-ID metadata; generic errors and admission controls remain required. It does not mark physical-device/native verification complete.
