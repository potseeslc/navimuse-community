# Build 51 — rolling safety cache

Version 0.2.0, build 51. Release base: safety-cache PR #486, merge 4a8c6c3.

Adds a playback-prioritized safety cache (roughly 30 minutes; up to ten upcoming songs plus current; 512 MiB ceiling), sequential 96 kbps MP3 fallback downloads, position-preserving cached recovery, measured connection recovery at track boundaries, and honest queue/player status. Existing TestFlight clients retain their cache protocol.

Validation: 42 targeted tests passed. The feature's production native downloader, playback-start and recovery simulator suites passed with Xcode 27; see docs/evidence/m8/safety-cache/README.md. Signed export and Apple distribution outcomes are recorded in the release PR/artifact record after upload.

Phone QA: start music, wait for Ready offline, weaken/disconnect the network, confirm the current track continues at its saved position and reports Playing cached audio. Test pause/skip during recovery, network restoration and quality on the next track, background/lock-screen behavior, and unchanged speaker ownership. A cache cannot cover songs not fully downloaded. Cache-only cold-offline account bootstrap remains outside this release.

Downloads redesign PR #485 is not included.
