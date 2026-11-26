# ADR-007: Sonic creates mixes; the library map is secondary

Date: 2026-09-11
Status: Accepted by the owner in the NaviMuse task (“let’s do that plan”)

## Decision

Make Sonic a music discovery workspace. Sound descriptions use the installed AudioMuse CLAP HTTP API; Alchemy combines included and excluded song or artist seeds. Existing lyrics discovery becomes the Meaning mode. Results share a finite editable preview and enter the existing player only through an explicit play or queue action. Saving explicitly creates a Navidrome playlist in the user's music identity.

The map is a secondary visual representation of the analyzed library. Sonic no longer starts in an active route or offers start/destination/path planning. This supersedes the earlier map-first product presentation; it does not promote new renderer or path algorithms from the lab. Existing ordinary Journeys remain available through the player and seed actions.

## Boundaries

The Node BFF remains the authentication and credential boundary. New inputs are bounded and whitelisted. AudioMuse results are resolved against Navidrome; analysis vectors and service credentials do not enter the preview. Candidate results cover the configured AudioMuse analyzed library, and are labeled accordingly. The library picker scopes seed search; it does not imply that the AudioMuse projection is folder-filtered.

Use the existing accepted renderer and projection contract with a null Journey and no route pins. Sustained physical-phone rendering performance remains a device check. Discovery and map failures do not take playback ownership. No upstream AGPL source is copied.

Local-account mode keeps its existing unavailable-service boundary until account-scoped AudioMuse adapters are implemented. This change must not fall through to the legacy identity.

## Deferred

InstantPlaylist natural-language instructions, SonicFingerprint personalization, saved recipes and scheduled refresh, and Lumae integrations are separate future work. WiiM Journey transfer is tracked separately and is not represented as solved by mix creation.

## September 12: Your Personalized Mix

Owner instruction “Great let’s build it!” approves the previously deferred Sonic
Fingerprint integration, named **Your Personalized Mix**, on both Home and Sonic.
One shared result per verified music identity offers Play Mix, Refresh and Save
Playlist. Generation is explicit; there is no scheduled refresh or automatic play.

The BFF calls AudioMuse's existing fingerprint endpoint with the current saved
Navidrome credentials, never credentials or account IDs from the request body.
The local-account registry supplies a private operation bound to its captured
credentials only after normal account/binding authentication. A different person
must have a distinct approved Navidrome connection; legacy shared connections
still describe the shared music identity. This adapter supports the installation's
configured Navidrome/AudioMuse pair; other music servers need an explicit analysis
binding and must not fall through to default-account credentials.

Request up to 100 fingerprint candidates and select across the result to retain a
blend of familiar seeds and sonic neighbors, capped at 30 verified playable tracks.
Resolve songs through the same music identity before persistence or response.
Cache only normalized tracks and generation time in private files keyed by the
verified account/binding scope; never store passwords in mix files or client state.
Home and Sonic share a single client model. Concurrent refreshes coalesce; failures
and empty history retain the previous mix. Changed account scopes invalidate late
client results. Saving uses the existing account-scoped playlist service, and Play
uses the existing local/remote queue authority without changing it.
