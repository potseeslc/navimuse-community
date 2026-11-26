# macOS M7 WebGL Recovery Proof

M7 must prove that the packaged NaviMuse release candidate handles Sonic Atlas
WebGL context loss in the pinned macOS WebView without corrupting playback,
queue, or Journey authority.

This proof is release hardening, not new Atlas product design. The M6 client
behavior already fails the renderer closed: `ReglAtlasRenderer` listens for
`webglcontextlost`, reports `Sonic Atlas WebGL context was lost.`, and the
Sonic Atlas surface degrades to the complete ordered Journey fallback while
ordinary playback remains owned by the player and queue.

## Automated Coverage

The browser-free Atlas overview test covers the current client contract:

- renderer context loss is observed through the WebGL context-loss event;
- renderer failure hides the canvas instead of crashing the Sonic surface;
- the complete ordered Journey fallback remains available;
- playback and queue authority are not transferred to the renderer.

Automated coverage is necessary but not sufficient for M7 exit because it does
not exercise the packaged Tauri app, Apple's pinned WebView, real media
playback, sleep/wake, or crash/log behavior on the target MacBook Air.

## Manual Release-Candidate Procedure

Record each run against the exact release candidate commit, app version, bundle
identifier, macOS version, hardware model, power source, WebView version when
available, and BFF origin.

1. Launch the signed packaged app on the pinned MacBook Air.
2. Sign in and start real Navidrome playback from a playable library track.
3. Start or resume an authenticated Sonic Atlas Journey with the map visible.
4. Record the current track, current stop, destination, route status, queue
   position, and whether the app is in Follow, Overview, or Explore mode.
5. Force or observe a WebGL context-loss event in the pinned macOS WebView. For
   deterministic release evidence, launch the packaged app binary with
   `--m7-webgl-loss`; the native shell moves the WebView to Sonic with the
   existing `?navimuse-m7-webgl-loss=1` evidence query. The shell seeds that
   query on the bundled `tauri:` bootstrap document so the first-party BFF
   redirect preserves it through secure session recovery. After the Atlas
   renderer reaches ready state it requests the browser-native `WEBGL_lose_context`
   extension. If the extension is unavailable, record that as skipped and use an
   observed renderer loss instead.
6. Confirm the Sonic Atlas canvas degrades to the ordered Journey fallback with
   a visible renderer-loss message.
7. Confirm ordinary playback continues, the player controls still work, the
   current queue item remains authoritative, and the Journey current stop and
   destination remain truthful.
8. Confirm recovery behavior by reloading the surface, restarting the app, or
   creating a fresh renderer session. Record whether the map returns cleanly or
   remains safely degraded.
9. Inspect app logs, crash reports, and diagnostic output for renderer errors,
   unredacted private library data, duplicate queue authority, or app crashes.
10. Attach screenshots, timestamps, logs, and any diagnostics bundle generated
    with `npm run native:macos:diagnostics`.

## Pass Criteria

The release candidate passes this item only when a real packaged-app run proves:

- renderer loss does not stop or replace ordinary playback;
- queue and Journey state remain aligned after context loss;
- the ordered Journey fallback is complete enough for continued listening;
- recovery or restart does not create duplicate renderer, queue, or Journey
  authority;
- logs and diagnostics do not expose credentials or private library metadata;
- no app crash or unrecoverable blank Sonic Atlas surface is observed.

## Current Status

Status: deterministic packaged-app trigger added; pinned-device run still
pending.

The client fallback contract is covered by automated tests, and the packaged app
now has a release-evidence launch flag and URL trigger that request
`WEBGL_lose_context` through the active regl renderer without adding a normal
user-facing control. M7 still needs the release-candidate WebGL context-loss run
in the pinned macOS WebView before this area can be marked complete.
