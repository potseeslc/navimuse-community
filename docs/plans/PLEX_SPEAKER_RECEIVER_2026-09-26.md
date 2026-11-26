# Plexamp speaker receiver pilot

Base: NaviMuse `dfa3713` (iPhone Build 62). This server-only feature lets Plexamp address a named NaviMuse speaker receiver. It does not change the native iPhone binary or turn Navidrome into a Plex library.

## Architecture

Plexamp Companion commands enter a dedicated LAN HTTP listener, configured by an administrator. A Plex PIN link gives each stable receiver identifier a Plex account identity and token; the service refreshes its local connection registration with plex.tv every 60 seconds. The separate listener is not attached to the public NaviMuse web router or Cloudflare tunnel.

The existing remote coordinator remains the only speaker queue/ownership authority. Plex and NaviMuse principals cannot simultaneously acquire overlapping speaker groups. Plex queue occurrences, original-file media and metadata use a source adapter; the same short-lived `/media/wiim` grants feed the existing LAN transport bridge. Credentials stay in a private configuration file, not in renderer URLs or persisted queue state. Plex playback reports go to Plex, never to another user's Navidrome/ListenBrainz account.

Incoming server addresses and media URLs are never trusted. The administrator pins one local PMS origin and machine identifier. The source adapter only fetches validated metadata, play-queue, media-part and artwork paths from that origin, with redirects refused. Controllers must authenticate to the linked Plex account. After a valid token, a controller/address binding allows the subsequent tokenless Companion controls for 30 minutes. Unlinked discovery probes see only an idle receiver, not private playback state. Browser requests are limited to app.plex.tv.

## First release contract

- Named targets linked individually to Plex, each mapped to an approved WiiM output/group leader.
- Plexamp polling timeline and playback commands: playMedia, play, pause, stop, seekTo, skipNext, skipPrevious, skipTo, setParameters, refreshPlayQueue.
- Complete music queues up to 1000 items, original audio files, repeat/shuffle, volume, current position and artwork. Queue refresh retains the playing occurrence and position.
- Source changes and occupied speaker groups fail explicitly; no forced takeover or unconfirmed-stop override.
- Plexamp is the pilot controller. Subscription-based generic Plex clients, partial/dynamic queue windows, Plex server discovery/multiple PMS origins, transcodes, Sweet Fades and new group creation are outside this first contract. Existing speaker grouping/gapless behavior is reused but requires independent physical acceptance.
- Registration and linking alone never start playback. The receiver is disabled unless NAVIMUSE_PLEX_RECEIVERS_FILE is set.

## Verification and acceptance

Automated fixture runs production HTTP receiver, source adapter, media proxy and remote coordinator against a simulated PMS and renderer. Covers credentials and URL confinement, linking checks, command retries, paused starts, seek offsets, queue refresh, natural advancement, reusable Range media grants, cross-principal ownership and source limits. Existing speaker, radio, Journey and gapless tests remain required.

Local PMS `/identity` responded on 2026-09-26 at `192.168.1.242:32400`, version `1.43.4.10903-e5521bd8c`. Account PIN linking subsequently succeeded. A real Music-library queue was created and parsed, and a bounded FLAC Range request returned HTTP 206 without starting speaker audio. Automated verification: 101 focused tests and 116 server regression tests passed; production build passed. This is protocol/media-fetch verification, not audible playback acceptance.

Physical acceptance: link the target, confirm it appears in Plexamp, select it and play one track on a free output; check audible audio/art, seek, pause/resume, Next and album end; stop and return to NaviMuse. Confirm that an occupied output produces a conflict instead of being interrupted. No live audio has been started during implementation.

## Reliability milestone — planned 2026-09-27

These items are planned, not implemented or accepted. The pilot contract above records the initial scope; subsequent work added automatic WiiM discovery, PMS handoff reporting and bounded radio queue windows.

1. Recover saved queues and positions after abrupt shutdowns. Validate saved state, retain a last-known-good backup, and reconcile with the actual speaker before restoring controls. Never resume audio or overwrite another controller's playback merely because the server restarted.
2. Recover when Plex, the host bridge and speakers return in different orders. Retry unavailable dependencies without losing stable receiver identities or requiring relinking.
3. Support a second Plexamp device joining existing playback. Selecting an active Living Room receiver from Android must expose the current track, position, artwork and queue without issuing playMedia, replacing the queue or interrupting audio. Keep the existing coordinator as the sole playback authority.
4. Expose separate integration health and sanitized recovery diagnostics for authorization, discovery, receiver connectivity and playback. Container health alone is insufficient.
5. Consolidate reviewed changes into a reproducible release with matched server/host bridge versions, current setup documentation, backup and rollback instructions.

### Cross-device authorization investigation

User report: music was playing on Living Room; selecting that receiver in Plexamp on an Android tablet did not populate its player or queue. Recent diagnostics show authorized polls receiving playing state while unauthorized tokenless polls receive idle state. This supports a controller-authentication hypothesis; the logs do not yet identify the tablet conclusively.

Investigate the Android attach handshake and establish linked-account authorization before returning playback state. Do not authorize a new controller solely because it is on the same LAN, knows a receiver identifier, or another device is authorized. Do not require starting a new track as the workaround for joining a session. Preserve the distinction between selecting a receiver to control it and explicitly moving playback.

Acceptance:

- Start a queue from the iPhone, advance several tracks, then select the same active receiver on Android with Move Playback With Selection disabled. Android shows the actual occurrence, position and queue; audio continues without a restart, skip or queue replacement.
- Pause, resume, seek and skip from either authorized controller; both converge on the same state, and retransmitted commands do not execute twice.
- Repeat in the opposite direction, with duplicate tracks in the queue, and after controller backgrounding, authorization expiry and server restart. Reauthentication must preserve the active queue.
- An unrelated account or unauthenticated LAN client cannot read private playback state or control the speaker. Receiver and account boundaries remain enforced.
- Add protocol regression tests for the observed handshake and perform physical Android/iPhone acceptance with exact client/server versions recorded.

Release acceptance also includes abrupt shutdown/corrupted-state tests, delayed dependency recovery and a long listening test covering albums, radio, groups and phone handoff.

## Reference links

- Plex's published Companion protocol: https://github.com/plexinc/plex-media-player/wiki/Remote-control-API
- Compatibility reference: https://github.com/songchenwen/plexdlnaplayer (GPL-3.0). Consulted for Plexamp account-linked discovery and polling behavior; not vendored or copied into NaviMuse.
- Configuration: ../PLEX_RECEIVER.md
