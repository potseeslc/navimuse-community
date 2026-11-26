# Account music request scope

Baseline: `fb8ed4a65d44d7c6b8b323d812f6d8e8af56df35`.

Local-mode Navidrome requests now require exactly one `accountScope` query parameter,
matching the public queue scope of the session and binding authorized for that request.
The session is authenticated first; the scope is only an expected-identity check. It
never authorizes a request, replaces the cookie, or selects another account's client.

This closes a cross-tab UI race: after another tab signs into B, a still-rendered A
player might send its next request using the browser's new B cookie. Without an
expected-scope check, the server would correctly authorize B but return B's metadata
to A's stale UI. The BFF now rejects that mismatch before metadata, media or listener
writes dispatch. Missing, malformed or duplicate scope parameters return 400
ACCOUNT_SCOPE_REQUIRED. A well-formed mismatch returns 409 ACCOUNT_SCOPE_CHANGED.
These errors are no-store. Existing sign-in, missing-binding, transport and origin
checks retain their precedence. Legacy mode remains unchanged.

The query parameter works for audio and image elements as well as fetch requests,
and gives different account scopes distinct media URLs. Local media and placeholder
responses also use private, no-store; a shared cache must not serve a previously
authorized cover URL without rechecking the current session and scope. It is an
opaque HMAC-derived public namespace, not a secret credential. No passwords, tokens,
usernames or raw account IDs are added to media URLs.

`createAccountMusicTransport(scope)` captures one verified scope for a mounted player.
Its request method preserves the existing credentialed fetch behavior; mediaUrl uses
the configured BFF origin. Both overwrite caller-supplied accountScope parameters.
Only relative Navidrome API paths are accepted, including after URL normalization;
foreign URLs, traversal to another API family and fragments are rejected. A different
player/account receives a new transport. Never use a mutable global scope that could
retarget old asynchronous player work to the newly signed-in account.

## UI integration requirements

The v1 account/player screen integration remains pending. Before mounting the player,
obtain the verified account session and non-null queueScope, create its transport and
scoped persistence adapter, then pass these through all metadata, artwork, audio and
listener-write paths. An account/binding scope change must dispose the previous player
and pending work before restoring the new namespace. A 409 requires rechecking the
session; do not automatically replay a write or reuse the newer account's scope for
old work. Errors and null scope must not invent a fallback queue or delete saved data.

This tightens the opt-in local BFF integration from the previous PR. Unscoped local
Navidrome clients must adopt the verified scope before they can access music. The
owner's deployment remains legacy; this branch does not change it or claim the account
screens are connected. No legacy queue migration occurs here.

## Evidence

The real BFF fixture uses two real Argon2-backed accounts, HTTP owner binding approval
and HTTP password login. With both accounts approved for the same music identity, B's
cookie plus A's scope returns 409 for album and artwork requests with zero upstream
calls. B's scope succeeds. Missing, duplicate and forged scopes fail; scoped album,
artwork, stream, playlist, feedback and scrobble workflows still pass, as do logout and
origin/header checks. Content is synthetic, not audible/native acceptance evidence.

The client transport test proves separate captured scopes remain stable across
interleaved requests, forged query scope is overwritten, media parameters survive,
cache URLs differ by account, and invalid/foreign/traversal inputs are rejected.

Validation: Node v26.7.0/macOS 26.6.2; two focused tests and all 818 tests pass with
zero failures/skips; production build passes with the existing bundle-size warning.
The final full run includes private/no-store media assertions. Logs:
`/tmp/navimuse-account-scope-focused.log`, `/tmp/navimuse-account-scope-all.log`,
`/tmp/navimuse-account-scope-build.log`.
