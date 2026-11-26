# ADR-004: Native iOS audio pilot

Accepted scope: owner request on 2026-09-09 to continue fixing lock-screen track
controls and WiiM AirPlay artwork after the build 2 bridge failed.

Use AVPlayer for installed iOS audio, AVAudioSession playback/long-form routing,
MPRemoteCommandCenter and MPNowPlayingInfoCenter. WebKit audio and browser
Media Session remain the browser/PWA implementation. The iOS capability is
injected by the shell before the remote application starts; no user-agent-only
switch and no simultaneous native/browser fallback are permitted.

The existing queue remains authoritative. Native play/pause/seek execute without
JavaScript. Track navigation and natural-ended events enter the existing queue
through generation-scoped events. Background JavaScript delivery remains a
physical-device acceptance gate: a successful native compile or registered
command does not establish uninterrupted background queue advancement.

The restricted native message channel accepts only the production HTTPS main
frame, explicitly enumerated commands, and BFF stream/cover endpoints. Native
requests reuse first-party WebKit session cookies, never Navidrome credentials.
Metadata and media locations are not written to diagnostic logs. Page replacement
invalidates callbacks and clears playback; track generations reject stale events.
Artwork is fetched natively and supplied as MPMediaItemArtwork.

This is an iOS pilot, not M8 completion, full M9 delivery, offline/gapless support,
or a guarantee that every AirPlay receiver presents artwork. Device acceptance
must cover locked pause/resume, next/previous and consecutive album advancement,
Bluetooth, WiiM AirPlay, interruptions, logout/relogin, and network recovery.

## 2026-09-26 extension: opt-in local album reservations

The owner requested gapless albums on the web player and iPhone after accepting
an audible seamless UPnP transition. The iOS pilot may use AVQueuePlayer for each
existing native deck, reserving at most 31 consecutive upcoming album items.
The shared application queue still owns ordering, controls and occurrence IDs.
Native automatic promotions return a token/occurrence receipt; foreground
reconciliation adopts it without reloading, seeking or issuing another Play.
Scoped checkpoints retain the last receipt for cold restoration.

This capability is explicitly negotiated by `albumQueue: true`, with prepare,
cancel, handoff and resume messages. It uses existing first-party cookie and
media authorization. HLS reservations are excluded from this pilot. The account
preference defaults off, and iPhone Safari retains ordinary media playback.
The native renderer may maintain the reserved album run while JavaScript sleeps;
this is bounded transport state, not a second queue policy implementation.

Simulator automatic advancement establishes controller behavior, not physical
phone gaplessness. Audible locked/background tests and captured boundaries for
real library codecs remain release acceptance gates. See the September 26 gapless
plan and local-player evidence for exact results and limitations.
