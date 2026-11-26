# Product Spec

## Current Direction

NaviMuse is currently delivered as a PWA and is becoming a macOS-first Tauri
application. The daily-player product must remain complete without AudioMuse, while
Sonic Atlas becomes the flagship discovery and Journey surface after its lab gates
authorize production integration. The authoritative staged plan is
[`plans/NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md`](plans/NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md).

## V1 Product

NaviMuse v1 is a complete music client for Navidrome with an AudioMuse discovery
layer. It is currently delivered as a PWA, with Apple Silicon macOS through Tauri v2
as the first native target. Every release should feel complete for daily listening,
even while advanced discovery continues to mature.

## Screens

- Home: adaptive shelves, recent plays, sonic mixes, recently added, waveform picks, mini-player.
- Player: waveform-hero now playing, queue entry point, ratings/favorites, sonic recommendations.
- Library: albums, artists, songs, playlists, radios, Music Library and Live Music Archive filters.
- Search: Navidrome library search plus AudioMuse discovery search.
- Discovery: CLAP text search, lyrics search, AudioMuse radios, analysis status.
- Settings: server connection, theme, playback quality, library filter, and future remote-access notes.

## Navidrome Features

V1 must include:

- Playback and queue management.
- Library browsing.
- Search.
- Playlist read/edit.
- Favorite and rating controls.
- Playback reporting compatible with Navidrome scrobbling.
- Multi-library filtering for Music Library and Live Music Archive.
- Quality/transcoding preference UI, even if the first implementation relies on Navidrome/OpenSubsonic defaults.

Future:

- Full offline downloads.
- Multi-server switching.
- CarPlay/native iOS features.
- Advanced ReplayGain controls.

## AudioMuse Features

V1 must include:

- Waveform display using `/api/waveform`.
- Similar tracks or instant mix entry points near the player.
- Mood/energy/key chips when available.
- Discovery page for CLAP text search and lyrics search.
- Analysis progress/status so incomplete scans are understandable.

Behavior while scanning:

- Use analyzed tracks only for AudioMuse recommendations.
- Show clear unavailable states for unanalyzed tracks.
- Never block normal Navidrome playback on AudioMuse availability.

## Design Acceptance

The app is not acceptable if it looks like a default React dashboard. The player and home screen must visibly follow the waveform-hero direction, adaptive color rules, rounded-square artwork, and compact native music-client density.
