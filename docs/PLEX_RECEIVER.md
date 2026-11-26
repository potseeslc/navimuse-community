# Plexamp → NaviMuse speakers (pilot)

This optional server integration exposes approved NaviMuse WiiM speaker outputs to Plexamp. Your music comes from your existing Plex server. NaviMuse continues to handle speaker ownership and transport. No new iPhone build is needed.

## Link one receiver

Run from the NaviMuse repository on an administrator's computer. Use a private configuration directory outside the checkout:

```sh
node scripts/plex-receiver-link.mjs begin \
  --config /private/navimuse/plex-receivers.json \
  --server http://192.168.1.10:32400 \
  --advertised http://192.168.1.20:18099 \
  --device bedroom \
  --name 'NaviMuse Bedroom'
```

`--device` is an existing approved WiiM device ID. `--advertised` is the server's reachable LAN address and a free receiver port. Both addresses must be local IPs. The CLI verifies the PMS identity and prints a code for https://plex.tv/link. Sign in with the Plex account that owns the music server, approve that code, then run:

```sh
node scripts/plex-receiver-link.mjs finish --config /private/navimuse/plex-receivers.json
node scripts/plex-receiver-link.mjs status --config /private/navimuse/plex-receivers.json
```

The file is written with mode 0600 and contains a Plex token. Keep it outside Git. Status prints no credentials. Repeat begin/finish with another approved device/name to add another target; retain the same server and advertised address. Each target has a stable receiver identifier and its own account link.

## Enable on the server

WiiM Direct and its host bridge must already work. Mount the configuration read-only and add the optional environment variable and a LAN-bound published port to the existing NaviMuse service:

```yaml
services:
  navimuse:
    environment:
      NAVIMUSE_PLEX_RECEIVERS_FILE: /run/navimuse-plex/receivers.json
    volumes:
      - /private/navimuse/plex-receivers.json:/run/navimuse-plex/receivers.json:ro
    ports:
      - '192.168.1.20:18099:18099'
```

Merge these entries with existing environment/volumes/ports; do not replace the whole service. The configured advertised port determines the internal receiver port. The normal NaviMuse port still serves speaker media. Leave the receiver out of public tunnels and router port forwarding. Discovery uses Plex account registration and the LAN GDM responder described below.

Restart NaviMuse, open Plexamp's player picker on the same LAN, and choose the named target. A receiver appears after Plex accepts its connection registration, refreshed every minute. If the speaker/group is already owned by NaviMuse, stop/release it there before casting from Plexamp. Stop Plexamp playback before transferring a NaviMuse queue to that output.

## Supported pilot behavior

Music playback, pause/resume/stop, seek, Next/Previous, selecting queued tracks, volume, repeat/shuffle and queue refresh are implemented. Media is served as original files through expiring NaviMuse grants, with Range requests supported. Large queues use bounded windows of up to 1000 songs, refreshed near their edges. Unsupported file formats return an explicit error. Sweet Fades and Plex transcoding are not implemented. Existing WiiM group/gapless behavior needs physical validation with Plex content. Generic Plex clients that require timeline subscriptions are not part of this polling-based Plexamp pilot.

To disable, remove NAVIMUSE_PLEX_RECEIVERS_FILE and the receiver port mapping and restart NaviMuse. Revoke the receiver under Plex's Authorized Devices when retiring it. Configuration changes require a restart; relinking the account changes its playback authorization scope and invalidates old media grants.

## Companion authentication

Plexamp sends a temporary PMS delegation token with `playMedia`. This token cannot be authenticated through the plex.tv account endpoint. NaviMuse validates owner delegation against the configured PMS: the linked account must own that server, its identity must match, and the token must pass the admin-only `/security/resources` endpoint. A random invalid token must be rejected by that endpoint too; LAN authentication exemptions fail closed. Shared-user library access is insufficient. Ordinary account tokens still require the linked account identity. Successful proofs are cached for 60 seconds; subsequent tokenless commands use a scoped LAN peer/controller/receiver binding. Authenticated controller grants persist for 30 days; relinking the receiver invalidates their scope.

References: [Plex Companion API](https://github.com/plexinc/plex-media-player/wiki/Remote-control-API), [PMS API: transient tokens and source connection information](https://developer.plex.tv/pms/).

Receiver diagnostics include command route, stage, status and safe failure reason. They exclude tokens, request URLs and music metadata; successful timeline polling is omitted to limit noise.

A named room receiver follows its existing WiiM group: if that room is a follower, NaviMuse resolves the single available leader whose reported members include it, then uses the normal coordinator ownership checks. It does not split or create groups. Missing or ambiguous leaders fail closed. Playback will be audible throughout the existing group.

## Automatic speaker targets

After linking the first receiver, enable automatic registration:

```sh
node scripts/plex-receiver-link.mjs discover --config /private/navimuse/plex-receivers.json --enabled true
```

Restart NaviMuse once after changing the setting. Thereafter, the existing LAN host discovers WiiM renderers every 20 seconds, and the Plex receiver reconciles and registers available outputs every 60 seconds. Each gets a `NaviMuse <speaker name>` target using the linked account; no separate PIN is needed per room. The initial linked receiver keeps its name and identity. Other IDs derive from the linked receiver and speaker UUID, so DHCP changes, renames and server restarts do not create new targets. Up to 16 receivers are supported. Renames update generated target labels.

The shared receiver port returns all available targets from `/resources`; control requests must identify their target when there is more than one. An unavailable speaker is omitted from discovery responses without invalidating an existing playback session. Plex may retain cached entries until it refreshes; reconnecting speakers reuse their identities. Disabling discovery stops advertising generated targets after restart; remove retired entries from Plex Authorized Devices if needed.

This works on the local network of each NaviMuse installation, using that installation's LAN host bridge, Plex server, account and advertised address. Docker Desktop requires the host discovery bridge because multicast does not reach its VM reliably. Networks must permit SSDP multicast and direct LAN connections. This does not scan networks remote from the NaviMuse server. The current adapter supports WiiM renderers, not every generic UPnP brand; Google Cast-only devices are not UPnP targets. Existing grouped rooms route to their current leader and preserve the group.

Automatic targets receive separate Plex device tokens through the linked owner’s PIN approval. These credentials are stored in `plex-discovery-credentials.json` under the private NaviMuse data directory (mode 0600); preserve that volume across upgrades. Targets remain hidden until ownership is verified and credentials are saved. Relinking the owner invalidates the saved discovery links. Tokens are never shared between receiver identities.

For direct Plexamp discovery on the LAN, set `NAVIMUSE_PLEX_DISCOVERY_PORT=18099` on the existing `scripts/wiim-host.mjs` process (use your receiver port). The host responds to Plex GDM searches on UDP 32412 with one identity per available linked receiver. It reads only the configured local receiver `/resources` endpoint; it holds no Plex credentials. Allow local UDP discovery and TCP receiver access. Docker Desktop needs this host process because container networking does not carry LAN broadcasts. The listener shares UDP 32412 with existing Plex services, limits replies per source, and drops stale or unavailable targets. Cloud registration remains enabled, but cloud discovery can differ from the device registry; verify the actual Players list.

Plex handoff state: the receiver reports its current queue occurrence and position to the configured PMS `/:/timeline` endpoint after controls and during polling, with a five-second background check while playback is active. This keeps the PMS queue selection current when Plexamp pulls playback back to the phone. Repeated unchanged reports are throttled, stale revisions cannot overwrite newer selections, and reporting errors do not fail speaker controls.

Large Plex station queues (including Random Album Radio) load a bounded window instead of the full library-sized queue. Before the loaded window runs out, the receiver requests a window centered on the current occurrence and updates the existing coordinator queue without reloading audio. Background checks run every five seconds; manual Next/Previous also check window boundaries. The previous window remains playable if a refresh fails.

## Recovery and second-device control

Session state, automatic receiver credentials, and controller grants use private, fsynced atomic files with a previous validated generation. Invalid main files recover from backup; damaged files are quarantined with a `.corrupt-` suffix. If both generations are invalid, the store starts empty and reports recovery degradation. This preserves evidence but cannot reconstruct lost queues or credentials. Back up the private configuration and the entire data volume while the service is stopped; treat backups as secrets.

Automatic receiver identities are restored before session authorization. A missing speaker/registry is retried, without discarding an active session. Restart recovery observes the speaker's existing media URI; it does not replay a stored Play command. A speaker that has stopped or switched to another source is not automatically restarted or taken over.

Plexamp can omit account credentials when selecting a receiver on a second device. In that case, while on home Wi-Fi:

1. Select the NaviMuse receiver in Plexamp, with **Move Playback With Selection** off.
2. On that same device, open the configured receiver address plus `/pair` in a browser (for example `http://192.168.1.20:18099/pair`).
3. Select the detected receiver/controller, approve the displayed code at `https://plex.tv/link` using the linked owner's account, NaviMuse checks the approval automatically; you can return directly to Plexamp.
4. Return to Plexamp and reselect the receiver. Pairing changes authorization only; it does not start, skip, seek or replace music.

Pairing grants access to currently available receivers linked to that owner. It expires after 30 days, a device network-address change, or receiver relinking. Controllers sending a valid Plex token authenticate automatically. This is an explicit compatibility pairing step for tokenless clients, not automatic account discovery. Same-LAN presence or knowledge of a client identifier alone is never sufficient to establish a grant. Android/iPhone physical acceptance remains required.

The LAN-only `/health` endpoint reports receiver readiness, pinned PMS connectivity, registration, playback reporting, discovery and recovery status, with no credentials or music metadata. `ready` does not prove audible audio. Companion logs include a hashed controller fingerprint so simultaneous clients can be distinguished without logging raw identifiers, addresses or tokens.

Release procedure: run the Plex, discovery, recovery and WiiM coordinator regression tests and production build; deploy an immutable server image and the host bridge from the same source revision; preserve the private mounts and data volume. Record the previous image and host LaunchAgent path for rollback. Verify `/health`, receiver discovery and session preservation after a controlled restart. Do not reset session files as a routine recovery step. Complete a physical multi-device and long-listening test before labeling the release stable.
