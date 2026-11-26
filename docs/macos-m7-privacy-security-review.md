# macOS M7 Privacy and Security Review

M7 privacy/security review must be completed against the same release candidate
commit used for signing, notarization, and long-session evidence. This document
defines the review surface and evidence required before the M7 checklist item can
move from scaffolded to passed.

## Review Surface

- BFF authentication: Pocket ID authorization-code flow, PKCE, state, nonce,
  NaviMuse session creation, logout, and fallback password mode.
- Session cookies: `HttpOnly`, `SameSite`, `Secure` behavior behind trusted
  proxies, expiration, logout revocation, and unauthenticated media/API handling.
- Protected writes: `X-Requested-With: NaviMuse` write boundary and CORS behavior
  for packaged Tauri origins.
- Service credentials: Navidrome credentials, AudioMuse tokens, OIDC client
  secret, setup token, Docker secrets, settings encryption key, and fallback
  environment variables.
- Local data: packaged-app storage, queue persistence, track feedback cache,
  Atlas Journey persistence, projection/tile cache identities, and migration
  rollback behavior.
- Logs and diagnostics: redaction, prohibited fields, generated support bundles,
  BFF logs, WebView logs, and crash reports.
- Deep links and navigation: deterministic in-app URLs, track links, native BFF
  redirect behavior, and rejection of unsupported navigation state.
- Client bundle: built assets must not contain Navidrome credentials, AudioMuse
  tokens, OIDC client secrets, setup tokens, or private provider IDs.

## Required Evidence

1. Capture M7 evidence with the release BFF origin and no unexplained dirty state.
2. Run the production build and full test suite for the release candidate.
3. Confirm automated client credential scanning reports no known NaviMuse
   credential markers in the release environment or built assets, including
   Navidrome, AudioMuse, setup-token, OIDC client-secret, and private-provider
   markers. Any marker match is `needs-review` release evidence until manual
   inspection confirms it is only a harmless configuration name, not a secret
   value. Then perform manual review for literal credential values because
   automated scanning cannot prove absence of arbitrary unknown secrets.
4. Confirm a generated diagnostic bundle contains only allowed fields from
   `support-diagnostics.md`.
5. Verify unauthenticated BFF media/API requests fail closed.
6. Verify authenticated Tauri-origin reads and preflights stay limited to the
   documented app origin and do not open arbitrary browser origins.
7. Verify write endpoints require the protected request header and an authenticated
   session.
8. Verify saved service secrets remain encrypted at rest and are never returned to
   the browser.
9. Verify logs and diagnostic output redact authorization headers, cookies, setup
   tokens, API tokens, passwords, and AudioMuse/Atlas item identifiers.
10. Record any accepted residual risk with owner, reason, mitigation, and follow-up
    milestone.

## Current Status

Status: automated privacy/security coverage passed; live log/deep-link spot
review remains for final release signoff.

Automated privacy/security verification on 2026-08-30 passed 136/136 with:

- Tauri-origin CORS reads and preflights limited to `tauri://localhost` without
  opening arbitrary browser origins;
- body-bearing writes and DELETE requests protected by the
  `X-Requested-With: NaviMuse` boundary;
- unauthenticated BFF media/API routes failing closed with controlled 401/503
  responses;
- Pocket ID sign-in using authorization-code flow with PKCE, state, nonce, and a
  secure transaction cookie;
- session cookies using `HttpOnly` and `SameSite=Lax`, and `Secure` only when
  trusted proxy state proves HTTPS;
- client API requests using explicit BFF origins and `credentials: include`
  without embedding Navidrome passwords, AudioMuse tokens, or authorization
  headers;
- Navidrome and AudioMuse saved secrets encrypted at rest, redacted from settings
  responses, and recoverable across module reloads with the persisted settings
  key;
- service URL allow-lists blocking private or disallowed upstreams by default;
- AudioMuse, Atlas, support diagnostics, and server log redactors removing
  authorization headers, cookies, setup tokens, API tokens, password values, URL
  query secrets, and provider/item identifiers;
- fresh support diagnostics for `7f50691` containing no collected cookies,
  service credentials, setup tokens, OIDC secrets, Docker secrets, keychain
  entries, queue contents, library metadata, listening history, browser storage,
  full system logs, media paths, stream URLs, or AudioMuse provider identifiers;
- M7 client credential scanning passing for the release environment and built
  assets.

Verification command:
`NODE_ENV=test node --test test/server.test.mjs test/clientServices.test.mjs test/supportRedaction.test.mjs test/tauriFoundation.test.mjs`
passed 136/136 on 2026-08-30.

Remaining manual observation: inspect the signed packaged app during a live
session for unexpected WebView logs, crash reports, unsupported deep-link state,
or unredacted support output before claiming final privacy/security signoff.
