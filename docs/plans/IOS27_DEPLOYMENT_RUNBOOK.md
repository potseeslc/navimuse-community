# iOS 27 speaker Lock Screen candidate — September 26, 2026

Build 59 (`cff2934`) remains the shipped baseline. Build 60 integrates the remote
speaker extension with that baseline. The candidate host flag is enabled; the
production server flag remains off until coordinated deployment. Signed distribution export and entitlement checks passed; see the
[Build 60 evidence](../evidence/m8/remote-speaker-build60/README.md).
No TestFlight upload or physical Lock Screen acceptance has occurred.

## Behavior

Transfer to a WiiM/UPnP speaker from NaviMuse to start an iOS 27 remote Now Playing
session. The extension uses the existing server-owned queue for play, pause,
next, previous and seek. Radio exposes live metadata/artwork without seeking.
Track/station changes reuse the remote session. Confirmed release, external
controller takeover and logout remove it. Transient observation failures retain
it. Older iOS and browser clients do not expose the native bridge.

APNs updates run independently of the web view. Track/state changes are sent at
the next five-second delivery tick; position-only updates are coalesced to one
per minute. Speaker observation remains owned by the existing coordinator.

Scoped control grants last 90 days, matching the long-lived sign-in experience.
They are server-hashed and stored in shared device-only Keychain storage. Every
operation rechecks account/binding revision and speaker-session ownership. Tokens
are rotated per installation and revoked by logout; they do not authorize general
library access or arbitrary speaker commands. The newer Pocket ID subject and
music-provisioning revision are preserved in saved grant identities.

Apple controls presentation priority and users may dismiss cards. This feature
represents speaker playback; it does not keep silent phone audio running.

## Signing and packaging

Host: `com.developer.navimuse`, minimum iOS 17, retains CarPlay and passkeys.
Extension: `com.developer.navimuse.remote-player`, minimum iOS 27, embedded at
`Extensions/NaviMuseRemotePlayer.appex`, NowPlaying weak-linked by the host.
Both Apple bundle IDs have Push Notifications enabled. Shared Keychain group:
`ABCDE12345.com.developer.navimuse.remote-now-playing`.

Use Xcode 27 and the normal Tauri archive workflow, then:

```sh
python3 scripts/export-ios-remote-candidate.py \
  src-tauri/gen/apple/build/navimuse_iOS.xcarchive \
  /Users/developer/.codex/artifacts/navimuse/build60
```

The dedicated exporter preserves both targets' entitlements and uses automatic
Apple distribution signing. It verifies the exported host, extension, push
profiles, shared Keychain group, CarPlay, passkeys and scene manifest. It does not
upload. The existing host-only exporter intentionally refuses extensions.

## Server deployment prerequisites

The owner's private APNs key/configuration exists under
`~/.config/navimuse/apns/`; it must never be committed or copied into the app.
Mount the key read-only and set these server configuration names:

- `NAVIMUSE_IOS27_REMOTE_NOW_PLAYING=true`
- `NAVIMUSE_APNS_KEY_FILE` (private mounted key path)
- `NAVIMUSE_APNS_KEY_ID`
- `NAVIMUSE_APNS_TEAM_ID=ABCDE12345`
- `NAVIMUSE_APNS_ENVIRONMENT=production` for TestFlight

APNs topic: `com.developer.navimuse.push-type.nowplaying`.
Persist `/data/now-playing` with the existing private data volume. Enable the
server routes before installing the candidate; unauthenticated requests must not
issue grants or execute commands. Roll back by disabling the server flag and
reverting to the prior signed app. Do not expose tokens in logs.

## Validation before broad enablement

- Run `scripts/test-ios27-remote-now-playing.py`, remote/coordinator/native audio
  tests, server tests and the web build. Record actual results in the evidence file.
- Export and inspect the signed candidate. Compilation is not phone acceptance.
- Physical iOS 27: transfer to a speaker, lock for several natural track changes,
  pause/resume/skip/seek from Lock Screen, change radio stations, check artwork and
  sleep timer, then return to phone playback. Confirm commands work while the web
  view is suspended. Check signed Keychain sharing and APNs token/update delivery.
- Verify logout, account switch, takeover, revoked grant, network interruption and
  dismissal. Test older iOS launch/local playback and CarPlay regression separately.

Reference: [Apple remote media sessions](https://developer.apple.com/documentation/nowplaying/publishing-remote-media-sessions).
