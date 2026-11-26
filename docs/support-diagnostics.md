# Support Diagnostic Bundle Contract

NaviMuse support diagnostics are opt-in local artifacts for release support. They
must help debug native release problems without collecting music-library content,
service credentials, session cookies, or private provider identifiers.

## Bundle Command

Create a local diagnostic bundle:

```sh
npm run native:macos:diagnostics
```

The command writes a timestamped JSON file under `.scratch/diagnostics/`. Attach
that file to a support issue only after reviewing it.

## Allowed Contents

- NaviMuse commit, dirty-state summary, package version, and configured BFF origin.
- macOS, architecture, Node, npm, Rust, Cargo, and Tauri CLI versions.
- Existence and path of the local `.app` bundle.
- Tauri config release-relevant fields: product name, identifier, app version,
  bundle targets, macOS minimum version, window sizing, and CSP setting.
- Current release evidence fields from `native:macos:m7-evidence`.
- Redacted command output from explicit diagnostic commands.

## Prohibited Contents

The bundle must not collect or include:

- `navimuse_session`, Pocket ID, or browser cookies;
- Navidrome usernames, passwords, salts, tokens, server responses, stream URLs, or
  media paths;
- AudioMuse API tokens, item IDs, coordinates with raw provider IDs, waveform
  payloads, or similarity responses;
- `settings.json`, `settings.key`, setup tokens, OIDC client secrets, Docker
  secrets, keychain entries, or `.env` files;
- queue contents, Journey stop titles, listening history, ratings, favorites, or
  playlist contents;
- full system logs, shell history, browser storage, or arbitrary home-directory
  files.

## Redaction

Every collected text field must pass through the shared support redactor before it
is written. Redaction must cover authorization headers, cookies, common token and
password key names, known NaviMuse session/setup key names, URL query secrets, and
Atlas/AudioMuse item identifiers in URL parameters, JSON fields, and common
free-text key/value forms.

The generic key redactor intentionally over-redacts any key that looks
secret-bearing, including names containing password, token, secret, cookie, or
session. This may hide harmless fields such as token-count limits or session
timeouts, but support bundles prefer over-redaction to accidental credential
disclosure.

Quoted free-text secret values may span lines and are redacted as one value.
Unquoted free-text secret values are redacted to the end of the current line or
the next detected secret-bearing key. Diagnostic commands must avoid collecting
unquoted multiline secret values; if command output could contain one, review
the generated bundle manually before sharing it.

If a future diagnostic needs a prohibited field, add a new documented support
mode that is off by default, names the risk plainly, and requires separate user
approval before collection.

## 2026-08-30 M7 Review

Status: passed for release support review on
`7f506911295a87229bdffe1292598d330e3ed0b2`.

The M7 diagnostic command generated
`.scratch/diagnostics/navimuse-macos-diagnostics-2026-08-30T16-04-48-942Z.json`
with file mode `0600` inside `.scratch/diagnostics` with directory mode `0700`.
The reviewed bundle contains the expected repository commit, clean branch state,
package version, BFF origin, macOS/toolchain versions, app bundle path/existence,
Tauri release-relevant config, release-evidence command hint, and an explicit
exclusion list.

Manual inspection found no collected cookies, service credentials, setup tokens,
OIDC secrets, Docker secrets, keychain entries, queue contents, library metadata,
listening history, browser storage, full system logs, media paths, stream URLs,
or AudioMuse provider identifiers. The only prohibited field names present are
listed as exclusions, which is expected by this contract.
