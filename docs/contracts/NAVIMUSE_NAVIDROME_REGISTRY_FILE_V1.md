# Private Navidrome registry file v1

Baseline: `c03a672696d965de450a634c4daa470561a26bcb`.

The assembled local account runtime accepts `navidromeRegistryFile`, an absolute
operator-controlled path, instead of in-memory `navidromeEntries`. Exactly one source
is required. The file is loaded and the existing registry/URL policy validates every
entry before creating the database or account secrets. Missing, unsafe, corrupt, or
ambiguous configuration stops startup; it never falls back to shared legacy credentials.

The file contains a JSON object with exactly `version` and `entries`:

```json
{
  "version": "navimuse-navidrome-registry/v1",
  "entries": [
    {
      "credentialRef": "music-owner",
      "serverId": "10000000-0000-4000-8000-000000000001",
      "url": "https://music.example.invalid",
      "username": "MusicOwner",
      "password": "REPLACE_WITH_PRIVATE_CREDENTIAL"
    }
  ]
}
```

The UUID and password above are examples, not deployment credentials. Generate and
retain the logical server UUID for the actual service; do not generate a new UUID on
every restart. The existing registry contract governs credential references and exact
username binding. File presence does not grant account access: the owner must still
approve a reference through the authenticated, recent-session binding route, including
upstream verification and session revocation.

This POSIX startup loader requires a regular, process-owned file with no group/other
permissions (normally 0600), in a process-owned directory without group/other write
permissions (normally 0700). Final-component symlinks are rejected; the containing
directory must be real. Operators control the path and its ancestors. The descriptor
is opened without following a final symlink and nonblocking so unexpected special
files cannot hang startup. Reading is bounded to 1 MiB and 256 entries, with fatal UTF-8
validation and size/timestamp checks for concurrent writes. Errors omit paths and
contents. The existing registry validates each entry and allowed upstream URL.

Provision the private file outside the checkout and public assets. It contains plaintext
upstream secrets and belongs in private service configuration and protected backups.
Use atomic replacement and restart the runtime to apply edits; there is no hot reload
or browser-facing credential-file endpoint. A running runtime retains its captured
registry. Never pass HTTP request fields or public settings into this startup option.

The real runtime HTTP regression loads this file, creates and signs in an account,
verifies no access before binding, approves a checked upstream reference, signs in
again, accesses the upstream, and restarts with the same account/session/queue scope.
Failure tests verify malformed entries and ambiguous sources leave no database or
secret artifacts. Loader tests cover permissions, symlinks, invalid UTF-8, oversized
input, schema errors, missing files, and exact password preservation.

This connects private configuration to the assembled runtime. The production BFF mode
selector and mount, per-account Atlas isolation, migration, account screens, native
and real-library acceptance remain open; this does not activate accounts in deployment.

Validation: Node v26.7.0 on macOS 26.6.2; eight focused loader/runtime tests and all
802 tests pass with zero failures/skips, and the production build passes. Existing
bundle-size warning remains. Logs: `/tmp/navimuse-registry-file-focused.log`,
`/tmp/navimuse-registry-file-all.log`, `/tmp/navimuse-registry-file-build.log`.
The test total is based on main c03a672; pending client-session PR #302 is not included.
