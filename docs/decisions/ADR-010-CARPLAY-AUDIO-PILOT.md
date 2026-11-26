# ADR-010: CarPlay audio pilot

Accepted September 17, 2026 following owner confirmation of Apple CarPlay approval
and request to build. Extends ADR-004 with the CarPlay template scene, audio
entitlement, and a bounded native presentation adapter. React remains the queue
and account authority; AVPlayer/MPRemoteCommandCenter remain the transport.

Four standard list tabs expose listening, complete downloads, playlists and the
current Journey. No custom driving UI, login form, URL entry or second player.
Catalogs are bounded, ephemeral, and tied to account scope and catalog revision.
Selections use opaque IDs, expire after eight seconds, acknowledge asynchronously,
and recheck account/output before changing the shared queue. Logout/page reset
clears the native catalog. Network requests retain existing BFF authentication.

Initial pilot requires the phone app to initialize/sign in. CarPlay-only cold
launch shows a parked-phone instruction; it must not silently construct a second
queue. Native transport controls work independently of JavaScript; new selections
and queue advancement still depend on the existing shell, so locked/background
and reconnect behavior require simulator and physical-car acceptance. Full cold
launch, headless queue restoration and new Journey planning from the car are
follow-on gates, not claims of this pilot. Current Journeys can be resumed.

Release requires the approved CarPlay audio capability, a refreshed provisioning
profile, and verification of BOTH signed entitlement and embedded profile. Keep
TaoScene for the phone and dispatch CarPlay's separate scene role correctly.
