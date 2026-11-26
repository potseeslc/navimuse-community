# NaviMuse — community source release

A self-hosted music player and discovery frontend for **Navidrome** and optional
**AudioMuse AI**, with a React web app, Tauri/native Apple client experiments,
and WiiM/UPnP speaker playback.

**Retired by the original maintainer on November 26, 2026.** Published under the
MIT license so anyone can study, fork, modify, redistribute, or build on it.
There is no hosted service, active maintenance commitment, or supported binary
release. This is experimental software, not a finished consumer product.

## What's included

- Library browsing, albums, search, playlists, queues, radio, and artwork.
- AudioMuse discovery, personalized mixes, and journey experiments.
- ListenBrainz discovery mixes and account integration.
- Native iPhone playback, downloads, offline-cache, CarPlay, and remote-player experiments.
- WiiM/UPnP coordination and a Plexamp-compatible receiver bridge.
- The Node backend, React frontend, native sources, and regression tests.

Some integrations were developed for one household. Playback recovery, native
configuration, and cross-device behavior have known rough edges. The original
maintainer now uses Music Assistant at home and Plexamp remotely.

## Try the web app locally

You need Docker Compose and an existing Navidrome server reachable from Docker.
AudioMuse is optional. NaviMuse does not bundle your music or either upstream service.

```sh
cp .env.community.example .env
# Edit .env: set your Navidrome URL and optional AudioMuse URL.
docker compose -f compose.yaml up -d --build
```

Open **http://localhost:8099**. Retrieve the first-run setup token locally:

```sh
docker compose -f compose.yaml exec navimuse cat /data/setup-token
```

Use it to finish the administrator setup, then configure your Navidrome
credentials in Settings. The token is sensitive; do not post it in an issue.
The `navimuse_data` volume stores settings, encryption keys, and account data;
back it up as private data. `docker compose -f compose.yaml down` stops the
service; do not add `--volumes` if you want to retain settings.

The example binds only to localhost. Remote use requires your own HTTPS reverse
proxy and authentication configuration. See [deployment notes](docs/deployment.md)
for advanced OIDC and provisioning options. The historical `deploy/` examples
require adaptation; `compose.yaml` is the standalone starting point.

## Development

Use Node.js 22.23.2 or newer (see `package.json`).

```sh
npm ci
npm run build
NAVIMUSE_DATA_DIR="$PWD/.local-data" npm start
```

`npm run dev` starts the Vite frontend development server. For regression tests,
use an isolated data directory:

```sh
NAVIMUSE_DATA_DIR="$(mktemp -d)" npm test
```

Native and browser harnesses require additional tooling. The native simulator
scripts require Xcode and a booted simulator; they do not automatically skip
missing setup. Historical QA evidence is not included.
See [release notes](docs/COMMUNITY_RELEASE.md) for the validation actually performed.

## Native clients and speaker bridge

The native code is a starting point for developers, not a signed app download.
Server origins and Apple identifiers have been changed to examples. Before building,
replace `navimuse.example.com`, related `id.example.com` origins, `com.developer.navimuse`,
and `ABCDE12345` consistently with your own values. Keep the origin checks strict;
do not remove them to get a build working. Configure your own signing, entitlements,
and any required Apple capabilities. No signing keys or provisioning profiles are included.

[The Plex receiver guide](docs/PLEX_RECEIVER.md) describes the experimental
Plexamp-to-UPnP bridge. It requires separate Plex account linking, LAN speaker
discovery, and deployment configuration; it is not enabled by the basic Compose file.
This is not an official Plex, WiiM, Navidrome, or AudioMuse product.

## Project history and contributing

This is a clean source snapshot of the last integrated private development tree,
not an export of private Git history. Household QA logs, credentials, personal
screenshots, and production deployment files are excluded. Remaining historical
design documents describe past decisions, not current maintenance promises.

Forks are welcome. Issues and pull requests may be used for community discussion,
but responses, fixes, and merges are not guaranteed. Please do not submit tokens,
passwords, personal playback logs, or music files.

## License

NaviMuse's original code is [MIT licensed](LICENSE). Bundled third-party components
retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Music, album artwork, upstream services, and third-party trademarks are not granted
by this license.
