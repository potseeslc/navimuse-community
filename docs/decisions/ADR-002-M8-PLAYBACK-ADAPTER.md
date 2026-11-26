# ADR-002: Retain the WebView adapter for M8 with bounded claims

- Status: accepted for M8
- Date: 2026-08-31
- Decision owners: NaviMuse M8 release

## Context

M8 requires an evidence-backed decision between the existing WebView audio adapter
and a native macOS adapter. BlackHole loopback measurements found a repeatable
420–445 ms physical gap at the standard two-`HTMLMediaElement` handoff. Warming the
Web Audio graph did not remove it. The smart-blend path remained continuous and did
not clip. A minimal `AVAudioEngine` control queued the same two PCM buffers without a
detected gap through the same capture chain.

The native control proves that a sample-scheduled native path can improve this
boundary. It does not prove the rest of a production adapter: authenticated HTTP
streaming, seek/resume, queue mutation, all supported codecs, remote controls,
failure recovery, packaging, or rollback.

## Decision

Retain the existing WebView adapter for the M8 release. Keep smart blend available
with its measured continuous/no-clipping result. Keep standard authored gapless
explicitly marked unverified and make no codec-wide gapless claim.

Do not replace the release engine with the comparator. A native adapter becomes a
post-M8 candidate only after it implements the full adapter contract and passes the
same production, packaging, long-session, codec, and rollback gates.

## Consequences

- M8 ships the already integrated and rollback-tested WebView adapter.
- The product and release notes must not describe standard playback as gapless.
- Smart blend may be described only within the audited fixture boundary.
- The isolated evidence harness never shares the production app identity and cannot
  be activated in an ordinary build.
- Native playback work must begin behind an adapter boundary and preserve the
  existing WebView implementation as rollback until its evidence gate passes.

## Evidence

See `docs/evidence/m8/playback-engine/README.md`, the frozen fixture generator,
capture analyzer, and native comparator committed with this ADR.
