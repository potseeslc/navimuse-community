# Private Navidrome client v1

Status: metadata/media transport extraction; account registry mounting remains open.
Baseline: `562bfd7d61c8014da7b3bd9856ef1506a632ad15`.

The BFF metadata and media proxy paths now use `createNavidromeClient` with a captured
copy of the current private service configuration. The factory can also construct
separate account-registry clients without reading mutable global settings on each
request. Production still uses its existing configured service identity until the
account runtime and registry are mounted; this change does not claim account-specific
production authorization.

The client permits only the production-used Subsonic methods, including the separate
Library genre helper. It preserves configured path prefixes, repeated playlist
parameters, JSON metadata format, binary media format, byte ranges and caller abort
signals. Metadata retains the caller's existing eight-second timeout. Streaming keeps
its disconnect-driven cancellation. Redirects remain manual.

Caller parameters cannot set username, password, API key, salt/token, client name,
protocol version or response format. Endpoint strings cannot change origin, add a
query or invoke administration methods. Only a Range header is accepted; request
cookies and authorization headers are never forwarded. URL configuration must be
HTTP(S), without embedded credentials, query or fragment. The existing BFF's service
host policy still applies before constructing a client; a future registry must apply
the same deployment policy. Trusted server configuration may intentionally reference
private-network Navidrome hosts.

Authentication retains the existing username plus per-request random salt and
MD5(password + salt) wire protocol with a longer random salt. This is upstream
protocol compatibility, not password storage. See the official
[OpenSubsonic API reference](https://opensubsonic.netlify.app/docs/api-reference/).
NaviMuse account password hashing remains Argon2id. API-key negotiation is not added.

`navidromeEndpointFor` is a private helper whose return value contains authentication
material. Raw fetch responses may also carry their request URL. Never serialize/log
these values; existing metadata parsing and media header/body filtering remain the
public response boundary. Network exceptions are replaced with stable errors without
the original message, URL or nested cause. Public service failure text stays generic.

An account registry entry must pair its declared server UUID and exact username with
a client constructed from that same verified private configuration. The client does
not itself create an approval, validate a NaviMuse bearer or infer account mappings.
Those responsibilities remain in the account access/runtime layer.

## Verification

Actual loopback HTTP tests verify captured configuration, salted authentication,
repeated playlist parameters, media format/ranges, redirect isolation and cancellation.
Additional tests prove pre-transport rejection of auth/header/path overrides and
redaction of transport errors. The existing BFF integration suite verifies the
production metadata/media consumers, including genre browsing and playlist writes.
No production service configuration, personal playlist or real audio was changed.

Final validation on Node v26.7.0: 105 focused client/BFF tests and all 781 suite
tests pass with zero failures/skips; production build passes. Logs:
`/tmp/navimuse-private-client-regressions.log`, `/tmp/navimuse-private-client-all.log`,
and `/tmp/navimuse-private-client-build.log`. Existing large-chunk warning remains.
The initial focused run caught an obsolete export, and the subsequent route run
caught missing getGenres allowlisting; both are fixed in these final results.
