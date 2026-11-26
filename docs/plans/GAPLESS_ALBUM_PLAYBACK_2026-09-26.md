# Gapless albums: speakers, web, and iPhone

Status: speaker pilot deployed and owner listening test passed. Desktop web and
native iPhone preview implemented on `codex/local-gapless`, not deployed/uploaded.
Local-player base: `ce29821ad55a1aca3dcdc5a4272b73d59b2940e6` (merged speaker pilot).
Previous speaker implementation base: `0542eb13bf2d2fda913fba1f237ff5b2dfcdb189`.

## Product behavior

Natural advancement between consecutive tracks on the same album/disc preserves
all authored samples, including intentional silence. No crossfade, silence trimming,
or per-track loudness jumps. Manual skips remain immediate. Shuffle, repeat-one,
pause-after-current, disabled queue continuation, live radio, and a sleep timer do
not schedule an automatic album handoff in this first pilot.

One queue remains authoritative. A prepared next item is an output reservation,
identified by current generation and both queue occurrence IDs. On an observed
engine handoff, commit the existing queue advancement once, publish the new song,
and never reload or seek the incoming item to zero. Prepared media belongs to the
same authenticated account and is revoked on cancellation or ownership loss.

Gapless is an audio-output claim. Preloading, continuous PLAYING state, and quick
JavaScript `play()` calls alone do not prove it. Output capture against a continuous
PCM reference is the acceptance gate for each engine and source format.

## 1. Speaker pilot — implemented, not enabled by default

`NAVIMUSE_WIIM_GAPLESS=true` opts into the prototype. Both the BFF and host bridge
must contain the change before it is enabled. Rollback disables new reservations;
existing persisted reservations still reconcile safely if their track starts.

- Reuse `transitionDecisionFor` album metadata checks.
- Set `SetNextAVTransportURI` after the initial Play has settled, not immediately
  after Play. Keep normal advancement when the renderer rejects preparation.
- Persist next audio/art grants before giving URLs to the renderer. Next artwork
  and codec telemetry belong to the incoming occurrence, not the current track.
- Adopt the observed next URI without SetAVTransportURI/Play. Handle restart,
  transport acknowledgement loss, and device-led group changes conservatively.
- Clear pending next media before edits, skips, seeking, output release or timer
  changes. Re-observe after clearing to catch a hardware boundary racing a command.
- Preserve the existing remote Lock Screen projection and report new current song.

Remaining speaker gate: run the **candidate coordinator and candidate host bridge**
end to end with a real lossless album, capture the output around a known continuous
boundary, compare to the reference, and verify next-item metadata, listening reports,
queue edits, group changes, sleep timer and output transfer. The isolated SOAP probe
below is not that full integration test. Do not label all renderers/formats gapless
because one WAV probe worked.

## 2. Web player — opt-in preview implemented

The current two HTML audio elements hand off through JavaScript after `ended`.
Keep `authoredGapless:false` until the replacement path is measured.

Build a bounded decoded-PCM album adapter using the existing AudioContext and
master gain. Schedule the incoming AudioBufferSourceNode at the exact outgoing
sample boundary on the audio clock, without a fade. Source completion only updates
queue/UI; it must not be responsible for starting the audio. Use one current and one
next buffer with a strict decoded memory budget (256 MiB combined), an abortable
prefetch, and no unbounded full-album decoding. Prove supported codec priming/padding
and resampling behavior. If readiness or memory budget fails, use ordinary playback
and report the actual mode, without mislabelling it gapless.

Integrate with queue revision, seeking, pause/resume, volume, backgrounding, media
session, listening receipts, account changes and remote-output transfers. Do not
route iPhone Safari through this adapter until background/lock behavior is verified.
For long streaming assets, evaluate a bounded AudioWorklet decoder/ring buffer if
full-file decode cannot meet the memory/network limits; that is a separate gate.

## 3. Native iPhone — opt-in preview implemented

Prototype a single AVQueuePlayer with a prepared next AVPlayerItem first, reusing
native cookies, download authorization and media-source selection. Verify actual
FLAC/AAC/MP3/Opus results independently; AVQueuePlayer is not a blanket guarantee
for every codec. Keep progressive/offline playback supported. Do not force the HLS
pilot back on as a prerequisite.

The native engine must advance while JavaScript is suspended and maintain an
occurrence-bound handoff ledger. On resume, reconcile that event into the existing
queue exactly once. Metadata, Lock Screen/CarPlay controls, listening ledger,
checkpoint recovery, seek state and the safety cache must follow the promoted item.
Do not swap between the current two AVPlayers at an `ended` callback and call it
true gapless. If queued assets fail the sample-boundary test for supported library
formats, evaluate bounded AVAudioEngine PCM scheduling before choosing that larger
engine change.

Keep the web bridge contract explicit: prepare, invalidate, observe promotion,
acknowledge occurrence. A stale JS load cannot restart an already-promoted native
item. Test app backgrounded, locked, killed/restored, output transfers, pause/resume,
manual Next at the seam, and Wi-Fi/LTE loss while the next file is preparing.

## Evidence on 2026-09-26

User authorized the Master bedroom speaker. Read-only checks found it STOPPED,
with no grouped slaves (WiiM Pro Receiver, firmware `Linkplay.4.8.827634`), and advertising SetNextAVTransportURI in
`/upnp/rendertransportSCPD.xml`. Only this speaker was used.

An isolated 20-second test served two 10-second PCM WAV halves of one quiet chord
from the Mac mini, left receiver volume unchanged, and cleared/stopped its own
transport afterward. This bypassed the production coordinator and did not deploy
or replace production services. Probe source is in `docs/evidence/gapless-albums/`.

- First file request: +0.349 s; second file prefetched: +1.751 s.
- GetMediaInfo confirmed the queued next URI.
- First track last observed at 9 s: test +10.656 s, PLAYING.
- Second track first observed at 0 s: test +11.677 s, PLAYING.
- Only one SetAVTransportURI and one Play were sent.
- Second track naturally stopped at 10 s; next slot cleared, Stop sent.
- No PCM output recording: **audible/sample-accurate gap remains unmeasured**.

These integer-second timestamps must not be interpreted as a measured one-second
pause. They are device position observations, not output sample timestamps.

## Automated verification

- 142 focused tests passed: WiiM transport/coordinator/bridge, remote Now Playing,
  and shared transition policy.
- Production web build and generated iOS web shell passed. Existing bundle-size
  warning remains. No native engine code changed or new iOS binary built.
- Regression cases include lost prepare/clear responses, restart before adoption,
  cancellation racing promotion, external takeover, timer and queue policy,
  per-occurrence artwork/codec grants, and optional preload lookup failure.

## References reviewed

- Feishin DLNA, pinned `6c5173f1cf3c2b946c6cf7997428a873e2bf3d7a`:
  https://github.com/jeffvli/feishin/blob/6c5173f1cf3c2b946c6cf7997428a873e2bf3d7a/src/main/features/core/dlna/index.ts
  SetNext sequencing and adoption without a duplicate load informed this pilot.
- Music Assistant DLNA and continuous flow, pinned
  `a3c140d248458eca1885cd9f0ed9f822f21c8bc1`:
  https://github.com/music-assistant/server/tree/a3c140d248458eca1885cd9f0ed9f822f21c8bc1/music_assistant
  Server PCM flow is an alternative for unsupported renderers and later crossfade,
  not part of the current implementation.
- Apple queued playback: https://developer.apple.com/documentation/avfoundation/avqueueplayer
- Apple HLS continuity requirements: https://developer.apple.com/videos/play/wwdc2021/10142/
- Web Audio sample scheduling: https://www.w3.org/TR/webaudio/

Crossfading Journeys/mixed queues is deferred until album gaplessness is accepted.

## Local-player implementation and acceptance

Settings → Playback adds **Gapless albums (preview)**, off by default. It applies
to consecutive same-album/disc tracks with known track numbers. Shuffle, repeat,
pause-after-current, disabled continuation and active sleep timers disable
reservations. Mixed queues keep existing behavior. No silence trimming or
crossfade is introduced.

Desktop `WebAlbumAudio` schedules current/next decoded buffers on the existing
AudioContext gain graph. The old media element remains the ordinary fallback.
Encoded files are capped at 48 MiB; metadata estimates and decoded buffers enforce
a combined 256 MiB PCM budget. Decode jobs serialize because the browser codec
operation cannot be aborted. Current fetch preparation times out after 12 seconds;
next preparation after 20. Long/high-resolution files can use ordinary playback.
A slow whole-file download can delay startup, so this remains a preview. iPhone
Safari is excluded; background behavior there is not proven.

Native AVQueuePlayer reserves up to 31 upcoming authorized progressive/downloaded
items, without starting them through JavaScript. Promotions update recovery,
listening identity, metadata, artwork and checkpoint state natively. One receipt
can reconcile multiple background transitions into the existing queue. HLS keeps
the existing ordinary path. Sleep timer changes invalidate future native items.

Preferences use capability header version 3. Older database records default the
new setting off; older clients receive their exact original field set and cannot
accidentally clear an enabled preference when saving unrelated settings.

Measured results and remaining QA: [local player evidence](../evidence/gapless-albums/local-players-2026-09-26.md).

Speaker acceptance: image `navimuse:gapless-ce29821`, coordinator and host bridge
both deployed. The owner heard “Any Colour You Like” → “Brain Damage” on Living
Room and reported “Seamless—no gap or restart.” This does not establish support on
every renderer or codec. No speaker commands were issued during local-player work.
