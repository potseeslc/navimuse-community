# Account request bodies v1

Status: private parser proposed for independent review; production routes are not
enabled. Baseline: `97b64928b788b6d6193d9c8db15b7eac65a1405a`.

`readAccountRequestBody` defines the bounded JSON input for setup and password login.
It runs after the accepted transport/Origin/network checks and before either account
service. It does not authorize requests or replace their durable admission limits.

- Maximum 8,192 received bytes, including JSON syntax. Declared oversized bodies are
  rejected before reading; chunked bodies are counted as bytes while streaming.
- Application/json, optionally charset=utf-8, with absent or identity content
  encoding. Compressed, unsupported-charset and ambiguous content types are rejected.
- Five-second total read deadline, unaffected by trickled chunks. Oversized streaming
  bodies and timed-out streams are destroyed; the connection may close rather than
  deliver a JSON response. Abort/error/early-close rejects and removes read listeners.
- Decode UTF-8 once, strictly, after collecting bounded Buffer chunks. Splitting a
  multibyte password across packets must not alter it. Invalid UTF-8 and unpaired
  JSON Unicode surrogates are rejected. Passwords are never trimmed or normalized.
- Login requires username/password and optionally boolean remember (default false).
  Setup requires setupToken/username/displayName/password. Unknown fields, including
  roles and account IDs, are rejected. Arrays, scalar roots and empty JSON are invalid.
- Username is bounded to 256 UTF-8 bytes; password and token to 1,024 bytes each;
  display name to 120 UTF-16 code units and 480 UTF-8 bytes. Username normalization,
  new-password screening/minimum length and token verification remain service-owned.
- Stable status/code errors contain no submitted values or raw parser exceptions.

The parser accepts a trusted timeout override of 1–10,000 ms for bounded tests and
deployment configuration; it is not request-controlled. It requires an unread binary
IncomingMessage: a prior setEncoding call or consumed stream is rejected. Existing
legacy endpoints retain their parser until an explicitly reviewed route migration.

Before wiring, the HTTP adapter must close or drain requests rejected before reading,
map stable errors, avoid logging bodies, and not authenticate or issue cookies on any
parse failure. Configure server connection/header timeouts independently. The parser
does not implement a global concurrent-connection cap or replace reverse-proxy limits.

Evidence: every byte split of a synthetic Unicode password; malformed UTF-8 and JSON;
exact fields/types; declared and chunked overflow; stalled/aborted stream cleanup;
and real chunked Node HTTP with split UTF-8. The real HTTP fixture returns only a
synthetic comparison result, never the password. Production route/native/PWA QA
remains open.

The existing HTTP/login integration now reads its synthetic submitted JSON through
this parser, following the merged network boundary and before actual Argon2/session
work. It retains token-gated test setup and verifies the issued cookie against the
real account worker. This is still an isolated adapter, not a deployed route.

Validation on 2026-09-06, Node v26.7.0: all 758 tests pass, zero failures/skips,
and the production build passes. Logs: `/tmp/navimuse-account-request-integration-tests.log`
and `/tmp/navimuse-account-request-integration-build.log`.
