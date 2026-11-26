> Historical September 13 design record. Current implementation, candidate and release status: [September 26 runbook](IOS27_DEPLOYMENT_RUNBOOK.md). Old build numbers, flag state and morning dates below are superseded.

# iOS 27 direct-speaker Now Playing

Status: native/BFF integration and unsigned archive implemented; feature flags remain off.
The historical sequence below is superseded by IOS27_DEPLOYMENT_RUNBOOK.md.
Current roadmap and release gates: IOS27_FEATURE_ROADMAP.md.
Owner authorization: September 13, 2026, begin support for keeping the Lock Screen
player while playing through UPnP speakers; physical testing may follow later.
Base: 499a47547e606e41c3cc3db8db792df27e1b2a54 (merged Build 42).
Branch: codex/ios27-remote-now-playing.

## Why the current player disappears

`src/main.jsx` passes null to `useMediaSessionPublication` while a WiiM direct
session owns playback. Native `publish` in `src-tauri/ios/native-audio.m` clears
MPNowPlayingInfoCenter when AVPlayer has no current item. This is appropriate for
local playback ownership, but leaves no representation for the external speaker.

Apple's iOS 27 NowPlaying framework provides RemoteMediaSession and a
RemoteMediaSessionExtension. This is distinct from AVPlayer's AirPlay route.
The feature should represent the existing BFF speaker session; it must never keep
silent local audio running to retain controls or create a second queue.

## Implemented foundation

- `shared/wiim/remoteNowPlaying.js`: narrow, credential-free presentation snapshot
  from the existing coordinator state; stable session/device identity across
  station changes, cover-art identifiers, accurate buffering state and bounded
  transport capabilities. It is deliberately not invoked by production yet.
- `src-tauri/ios/remote-now-playing/RemoteSpeakerSession.swift`: iOS 27 observable
  RemoteMediaSessionRepresentable, shared Codable attributes, and injected native
  command/artwork boundaries. Stale revisions and mismatched session updates are
  rejected. Command replies update display only from confirmed server state.
- Artwork delivery is injected, not an unauthenticated arbitrary-URL fetch.
- Serialized native host publication and stale-completion cleanup, type-checked with iOS 27.
- Explicit retain/update/end projection, live radio representation and observed-time ordering.
- No changes to Build 42 packaging, deployed web app, speaker playback or signing.

## Remaining implementation, in order

1. Add the extension target with `com.apple.nowplaying.remote-media` extension
   point and iOS 27 minimum for the extension; retain iOS 17 for the host. Wire the
   shared model into both targets. Add a bounded ADR-004 extension amendment.
2. Implement a native extension BFF client. A WebKit cookie jar is not automatically
   shared with an extension. Decide and implement a revocable, account- and
   session-scoped authorization mechanism in shared Keychain access; keep service
   credentials in the BFF. Clear authorization and end sessions on logout/switch.
   Do not put authorization in Codable attributes or push payloads.
3. Preserve coordinator command semantics: fresh ownership check, revision,
   commandId, existing authenticated route, no automatic replay of next/previous
   after an ambiguous response. Reconcile before reporting success. No new queue.
4. Connect native foreground start/update/end and recovery of existing sessions.
   Request system-primary only from a user-initiated foreground speaker transfer.
   Serialize handoffs and reject stale completions. Transient refresh failure must
   not be interpreted as an explicit release. End on confirmed return to local,
   account change or lost ownership. Keep older iOS and PWA paths unchanged.
5. Add server-driven NowPlaying APNs updates and token rotation/cleanup. Browser
   polling cannot maintain metadata while suspended. Server session transitions,
   station changes, pause and timer expiry must reach the extension independently
   of the web view. Configure signing/capabilities before enabling this release.
6. Authenticated artwork fetch using existing canonical station/song cover IDs,
   generation rejection, and cache invalidation on account change. Extend group
   devices/volume only after verified topology and capabilities are available.
7. Test extension/host packaging, authenticated command failures, replacement
   sessions, logout, token rotation, push ordering, offline behavior and iOS 26
   fallback before a signed candidate. Physical iOS 27: transfer to UPnP group,
   lock/app suspension, song and radio changes, artwork, pause/resume, timer expiry,
   next/previous, return to local, and interruption by another media app.

## Evidence and limitations

Installed compiler: Xcode 27, iPhoneOS27.0.sdk. Swift adapter type-check passed with
`-application-extension -target arm64-apple-ios27.0 -parse-as-library`.
Seven Node contract tests passed in `test/remoteNowPlaying.test.mjs`.
These establish API compatibility and snapshot rules, not a packaged extension,
background operation, signing, or Lock Screen persistence on a physical phone.
Fractional and whole-second ISO-8601 timestamps now use an explicit Codable wrapper;
round-trip and malformed input rejection pass in the native timestamp test.

Apple controls presentation priority and users can dismiss system controls; do
not promise a permanently pinned player.

Sources verified September 13, 2026:
- https://developer.apple.com/documentation/nowplaying/publishing-remote-media-sessions
- https://developer.apple.com/documentation/nowplaying/remotemediasession
- https://developer.apple.com/videos/play/wwdc2026/312/

## Owner device direction: iPhone Duo

September 13, 2026: the owner plans to buy iPhone Duo and explicitly requests that
NaviMuse be built with it in mind. Treat it as a planned physical acceptance device;
do not claim hardware validation until the device is available.

The remote Now Playing implementation must preserve the same BFF session while
app geometry changes. Display changes must not start/stop playback, transfer output,
reset a radio station, recreate the queue, or publish duplicate remote sessions.
