# Passkey access and credential management v1

Base: HTTP PR #318 merge `36e966734c01d04e20c58a629819eb9a2f2e0eea`.

## User flows

When the configured server advertises passkeys, the sign-in surface follows the
approved Cinematic Focus reference: passkey action first, password form retained
below it. The same remember-device preference applies to either explicit sign-in.
Unsupported or noncanonical client origins show an explanation rather than opening
an invalid ceremony. Cancellation, timeout/non-completion, verification failure,
and unsupported authenticators have recoverable messages and retain entered fields.
The browser cannot reliably distinguish cancellation from every NotAllowedError
cause, so the UI does not pretend to make that distinction.

Settings > Account lists named passkeys and supports adding, renaming and removing
one after recent authentication. Rename focuses its input; removal shows an explicit
confirmation and offers Keep passkey. Mutation success refreshes metadata and moves
focus to the section heading. Empty, loading, error and unavailable-browser states
remain visible. Removing a key blocks future assertions, including captured pending
proofs; existing sessions remain independently revocable using device/session controls.

## Client and protocol boundary

Pinned `@simplewebauthn/browser@14.0.0` owns browser credential conversion, invocation,
response serialization and authenticator cancellation. No custom WebAuthn crypto is
introduced. The package API and cancellation helper were checked against installed
source and [official browser documentation](https://simplewebauthn.dev/docs/packages/browser).
Registration/login call the already accepted options and verification routes.

Ceremonies use the existing account Web Lock and document serialization. A cancelled
or failed ceremony consumes its server challenge when reachable. Cancel is available
before verification; once verification begins, its cookie response settles before the
lock is released. Unmount cancels an outstanding authenticator prompt. Registration,
credential reads and changes recheck the expected immutable account under that lock
so queued work cannot be applied to a newly signed-in account.

No bearer token enters client JSON/storage. Successful passkey login resolves the
same account/session contract and publishes the existing cross-document session notice.
Native custom origins cannot directly perform WebAuthn for the canonical BFF; they
show the supported-browser path while native first-party redirect integration remains
open. Explicit server enablement remains off by default pending real authenticator QA.

## Credential management contract

- `GET /api/auth/v1/passkeys`: authenticated current-account metadata only: ID,
  name, revision, device/backup metadata, creation time and last use. No key bytes.
- `POST /api/auth/v1/passkeys/change`: exact JSON containing ID, expectedRevision
  and either label or remove:true. Existing transport/CSRF/body limits apply.
- Store operations authenticate inside their transaction. Mutations require recent
  authentication, own-account ownership and matching revision. Rename/removal increment
  the credential revision, invalidating captured pre-change assertions.
- Removal marks the key revoked rather than reassigning or deleting its identity.
  It refuses to remove the final active key when no password credential exists.
  Two workers removing separate final keys still leave one valid recovery credential.
- Metadata updates and privacy-safe audit events commit together. Public errors
  distinguish recent-sign-in requirement, stale revision and last recovery method.

## Remaining M8 acceptance

This completes the browser discoverable sign-in and Settings add/rename/remove code
path, not the full access milestone. Username-first compatibility, controlled recovery,
OIDC/hybrid/linking, native first-party redirect and real Touch ID/synced-key/security-key
acceptance remain required. Full M8 additionally retains tab acceptance, real listening,
Atlas/Journey and native lifecycle/accessibility/release evidence on a common commit.
