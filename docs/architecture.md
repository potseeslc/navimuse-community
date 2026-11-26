# Architecture

## Overview

NaviMuse is currently a React PWA and is moving toward a macOS-first Tauri v2
application targeting Apple Silicon. The PWA remains operational during the native
migration. Both clients talk to a backend-for-frontend proxy instead of exposing
long-lived Navidrome or AudioMuse credentials.

The current platform and delivery authority is
[`plans/NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md`](plans/NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md).
The accepted native-platform decision is
[`decisions/ADR-001-MACOS-FIRST-TAURI.md`](decisions/ADR-001-MACOS-FIRST-TAURI.md).

## Frontend

- React + Vite.
- Custom CSS tokens and components.
- PWA manifest and service worker.
- Planned Tauri v2 shell for Apple Silicon macOS.
- App-shell caching only in v1.
- Media Session API for lock-screen metadata and controls where supported.
- Adaptive color extraction from album art with contrast-safe generated palettes.

## Backend Proxy

Responsibilities:

- Store Navidrome and AudioMuse credentials server-side.
- Normalize Navidrome/OpenSubsonic responses for the PWA.
- Proxy waveform and AudioMuse discovery endpoints.
- Generate short-lived stream URLs or proxy streams.
- Provide health/status endpoints for Navidrome and AudioMuse.

MVP endpoints:

- `GET /api/health`: confirms Navidrome and AudioMuse reachability.
- `GET /api/config`: returns non-secret public service hints.
- `GET /api/navidrome/bootstrap`: returns music folders, newest albums, and random albums.
- `GET /api/navidrome/search?q=<query>`: returns Navidrome search results.
- `GET /api/navidrome/albums/:id`: returns album details and tracks.
- `GET /api/navidrome/cover/:id`: proxies Navidrome cover art.
- `GET /api/navidrome/stream/:id`: proxies Navidrome audio streams.
- `GET /api/audiomuse/dashboard`: proxies AudioMuse dashboard summary.
- `GET /api/audiomuse/clap/stats`: proxies AudioMuse CLAP stats.

Initial local services:

- Navidrome: `http://192.168.1.242:4533`
- AudioMuse: `http://192.168.1.242:8000`

## Data Flow

- Library/search/playlists: PWA -> proxy -> Navidrome.
- Stream/playback: PWA -> proxy/Navidrome stream endpoint.
- Waveform: PWA -> proxy -> AudioMuse `/api/waveform?item_id=<song-id>`.
- Sonic search/radio: PWA -> proxy -> AudioMuse CLAP, lyrics, alchemy, and radio endpoints.
- Player lyrics: PWA -> authenticated proxy -> Navidrome `getLyricsBySongId`; synchronized timing is preserved. AudioMuse acquires lyrics from the same configured library for semantic analysis but retains embeddings rather than displayable lyric text.
- Scrobbling/play tracking: PWA reports playback through Navidrome-compatible APIs first.

## Access Model

V1 is LAN/VPN-first. The architecture should also support a later public deployment behind a hardened reverse proxy.

Remote-safe requirements for later:

- HTTPS only.
- Strong proxy auth.
- No browser-stored server API tokens.
- CORS limited to the deployed app origin.
- Separate public/private config.
