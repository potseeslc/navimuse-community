# Approved music connections for owner Settings

`GET /api/auth/v1/admin/music-connections` exposes the configured connection
choices to an authenticated owner. The route exists only when a catalogue provider
is configured. Anonymous/expired/revoked sessions receive 401 and listeners 403.
The existing origin/method boundary and no-store response policy apply.

Success: `{connections:[{reference,label}]}`. The bounded catalogue has at most
256 unique references, validated with the existing credential-reference grammar.
The handler explicitly projects those two fields even if a provider has extra
private fields. It never serializes registry clients or request functions.

Trusted registry v1 entries now accept an optional `label` of 1–120 characters,
trimmed, well-formed Unicode without control characters. Unknown keys still fail
closed; existing entries remain valid and use their reference as a fallback label.
Labels are captured at startup and catalogue callers cannot mutate the registry.
Passwords, upstream usernames, server URLs and server IDs are not returned.
References identify approved choices; they are not credentials.

Listing performs no upstream probe. The existing binding update route still
verifies the chosen connection, requires recent owner authentication and an
expected binding revision, and invalidates affected sessions/devices after a
change. An absent or empty catalogue does not authorize arbitrary credentials.
This API does not create, edit or persist registry entries through HTTP.

Tests exercise the real registry projection, immutable snapshots, invalid labels,
zero probe requests during listing, owner/listener/anonymous/revoked HTTP access,
method/origin rejection and stripping injected private fields. No production
registry or user binding was changed. Selector UI and binding-change QA remain to
be delivered; this prerequisite does not complete owner administration or M8.

Validation: 914 full-suite tests and the production build passed. Logs:
`/tmp/navimuse-owner-catalog-full.log`, `/tmp/navimuse-owner-catalog-build.log`;
16 focused tests passed in `/tmp/navimuse-owner-catalog-focused.log`.
