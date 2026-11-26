# ADR-009: Optional adaptive HLS pilot

Date: 2026-09-17. Accepted for implementation as a disabled, opt-in experiment
following the owner's request to proceed with rollout stages 2 and 3. This is not
acceptance of the stability-benefit gate or authorization to make HLS the default.

The experiment in PR #495 demonstrated adaptive rendition selection, but did not
establish fewer stalls than fixed 96 kbps playback. Continue measuring that claim.

Use an optional internal Node/FFmpeg worker behind the existing Node BFF. The
worker accepts bounded audio bytes, not upstream credentials or arbitrary URLs.
The BFF authorizes each session and media request against the current account and
Navidrome library. An account allowlist and a native-device toggle are both
required. No BFF rewrite, second playback engine or new queue authority is added.

The first implementation packages complete VOD renditions at AAC 64/128/256 kbps,
48 kHz stereo, with aligned four-second fMP4 segments. Raw source is fetched from
Navidrome over its existing authenticated interface; shared filesystem mounts are
not required. A cold track starts with ordinary streaming while preparation runs
server-side. A later play can select ready HLS. Never wait for an entire encode
before letting ordinary playback start. Client negotiation is capped at 900 ms.

This deliberately narrows the proposed growing-playlist design. Complete manifests
make every published position seekable without promising unencoded segments.
Incremental generation, seek-ahead and lower cold-start overhead require further
measurements before introduction.

Preserve the progressive song URL in the native recovery controller and listening
ledger. A supplied HLS URL is accepted only at the trusted first-party origin with
the exact account scope. Completed device downloads take precedence. A failed HLS
item can enter the existing bounded cached/progressive recovery path without
creating a new queue occurrence. HTTP authorization rejection must still stop.

The rollout remains native-iPhone only. Existing web/macOS, radio and UPnP paths
are unchanged. New HLS loads are excluded while AirPlay is selected. Switching to
AirPlay mid-track remains a physical-device acceptance case, not a tested promise.

The worker has a dedicated disposable volume, limited concurrency/CPU/memory,
bounded uploads/output, hard job timeout and LRU expiry. Recent/actively served
files are protected from eviction. Paused sessions may lose cache residency and
fall back on resume. No cross-account cache sharing or public caching is allowed.

Initial limits: tracks up to 30 minutes, two worker jobs, four BFF preparation
requests, 128 MiB input and output each, 2 GiB aggregate cache, two-hour media
sessions and six-hour idle cache expiry. The original streaming path remains
available when limits, codec support, worker capacity or authorization prevent HLS.

Broader release requires real authenticated AVPlayer segment-cookie tests, the
production recovery/cache A/B benchmark, physical iOS 27 tests, locked playback,
account/logout tests, queue/listening-history continuity, and documented server
capacity. This ADR does not claim gapless audio, lossless quality or a solved
weak-cellular problem.
