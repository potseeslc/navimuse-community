# Optional HLS pilot — not enabled in production

NaviMuse's normal installation does not require this service. The pilot prepares
completed AAC HLS tracks for later plays; it does not make uncached cold tracks
adaptive immediately. See ADR-009 and issue #494 for the remaining rollout gates.

## Isolated installation

Use the checked-out source as `NAVIMUSE_BUILD_CONTEXT` (an absolute path). Combine
`deploy/docker-compose.yml` and `deploy/docker-compose.hls.yml`. The latter is an
optional overlay. It adds a private internal network and publishes no worker port.
Do not replace a live site's custom compose configuration wholesale.

Create a random secret outside Git:

```sh
umask 077
openssl rand -hex 32 > /absolute/private/path/navimuse_hls_worker_token
```

Set these values in deployment environment/configuration, not in Git:

- `NAVIMUSE_BUILD_CONTEXT`: absolute checkout path.
- `NAVIMUSE_HLS_WORKER_TOKEN_HOST_FILE`: absolute secret file path.
- `NAVIMUSE_HLS_ENABLED=true`: defaults to false when omitted.
- `NAVIMUSE_HLS_ALLOW_SCOPES`: JSON array of explicit pilot queue scopes. Obtain
  the current opaque scope from the authenticated account session response. This
  is an administrator task; users do not enter server URLs or credentials.
- Optional `HLS_MAX_JOBS` (default 2) and `HLS_CACHE_BYTES` (default 2147483648).

```sh
docker compose -f deploy/docker-compose.yml \
  -f deploy/docker-compose.hls.yml --profile hls up -d --build
```

Both BFF and worker read the shared Docker secret. The worker receives bounded raw
media through authenticated internal POST requests; it has no Navidrome password
and cannot fetch Internet URLs. The internal network prevents external egress.
The base compose's existing Navidrome, AudioMuse and OIDC configuration still
needs to match the installation.

Install an iPhone build advertising the HLS capability, sign in with an allowlisted
account, and enable **Settings → Playback → Streaming on this device → Adaptive
streaming pilot**. The device preference defaults off. It overrides ordinary
streaming quality only for ready HLS tracks; AAC is lossy. Downloaded files still
win. A cold first play uses ordinary streaming. Once packaging finishes, play the
track again to exercise HLS. Unsupported/long tracks continue normally.

## Resources and privacy

Worker defaults: 2 CPUs, 768 MiB RAM, 128 process limit, read-only root filesystem,
2 GiB disposable media volume, two concurrent jobs, 120-second upload/encode limit,
128 MiB maximum source and output each. The logical cache limit includes job
reservations. A 250 ms disk monitor can transiently overshoot by in-flight writes;
use a host volume quota for a hard filesystem ceiling. Load beyond capacity falls
back to ordinary streaming; there is no unbounded work queue.

HLS cache data is private music. Backups do not need this disposable volume. The
worker clears its own hashed job directories at startup; never point it at a
music library, BFF data directory or general-purpose volume. No cross-user cache
sharing occurs. Cached media requests recheck Navidrome access. Every manifest
reference carries the account scope and still requires valid first-party cookies.
No bearer media grants or upstream credentials are put in client URLs.

Base Node image is digest-pinned. Alpine's FFmpeg package is installed at build
time; capture its exact version/image digest with each candidate. A fully pinned
FFmpeg artifact, license inventory, ARM64/AMD64 image validation and clean-host
installation evidence remain requirements before community release.

## Rollback and limitations

Turning the phone toggle off changes the next load and lets an active item finish.
Disabling the server environment flag and restarting prevents new sessions; the
restart loses in-memory sessions, so active HLS items may use the existing
position-preserving fallback. Do not promise interruption-free server rollback.
Stopping only the worker also leaves ordinary Navidrome streaming available.

Session lifetime is two hours. The six-hour idle worker cache can evict unused
tracks earlier under storage pressure, except recent/active reads. A long pause
may therefore require ordinary-stream fallback. Both BFF and worker restart
invalidate the pilot's media availability. Source authorization changes are checked
again for media requests, even when a cached package exists.

The current safety cache remains in use. Its buffer/stall priority rules remain
unchanged; coordinated HLS-specific download budgeting and avoidance of redundant
current-track downloads require the next cache-integration stage. Do not enable
this pilot broadly until that comparison is done. This is not an offline HLS
implementation and buffered HLS segments are never labeled Ready offline.
