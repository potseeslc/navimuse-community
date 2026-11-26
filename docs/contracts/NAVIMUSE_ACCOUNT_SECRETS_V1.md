# Account service secrets v1

Status: private startup prerequisite; no production BFF mount or deployment.

The account login admission service and queue namespace derivation require stable,
server-controlled keys. `server/accountSecrets.mjs` provides their persistent source.
The caller supplies an absolute, operator-configured data directory and an explicit
`allowCreate` flag. Neither input may originate in an HTTP request. There is no
secret-input parameter, environment fallback, hardcoded key, or automatic rotation.

The directory must already exist, belong to the process user and forbid group/other
writes. Its ancestors and filesystem are trusted deployment infrastructure. The final
component cannot be a symlink. This POSIX startup helper targets macOS and Linux.

A new file contains 64 CSPRNG bytes: independent 32-byte admission and queue secrets.
It is written to an exclusive mode-0600 temporary file, synced, then published using
an atomic hard link that cannot replace a competing process's file. All successful
concurrent starters read the winning file. The directory is synced before returning
from creation. A crash may leave an unused private temporary file; it must never be
mistaken for the authoritative key. Existing files are opened without following
symlinks, verified as private regular files owned by the process user, and read with
a fixed size bound. Unsafe or malformed files fail startup without replacement.
Returned buffers are copies. Errors contain no secret bytes or filesystem paths.

Missing secrets fail by default. The BFF may set `allowCreate: true` only for an
explicit fresh installation with no existing account state. It must not regenerate
keys after a lost mount, broken restore, or missing file in an established deployment.
That startup policy remains to be implemented when mounting the account services.
Changing the queue key changes namespaces; changing the admission key abandons the
old throttle identifiers. Back up this file privately with the account database and
restore matching ownership/permissions. Never include it in diagnostics, public
configuration, client bundles, screenshots, or API responses. No backup export is
added here. A privileged operator can replace a key file; byte validation cannot
prove the entropy or provenance of an operator-supplied restore.

The queue namespace is not an authorization credential. Every music request still
requires verified account/session state, an approved binding and matching private
upstream credentials. Loading this file neither supplies nor approves a binding.

## Evidence

Focused tests on Node v26.7.0 prove explicit creation and restart stability, separate
returned buffers, mode 0600, twelve concurrent real Node processes reading one
winning key file, and nonreplacement of malformed, public or symlinked key files.
World-writable data directories are rejected before creation. These tests use
isolated temporary directories and no production secrets. Production volume,
backup/restore, Linux runtime and mounted-route acceptance remain open.

Full validation at base `418ccfcb26d65f361485f47694b5d611281a0c5f` plus this
change: 769 tests pass, zero failures/skips, and production build passes on Node
v26.7.0. Existing large-chunk warning remains. Logs:
`/tmp/navimuse-account-secrets-tests.log` and
`/tmp/navimuse-account-secrets-build.log`.
