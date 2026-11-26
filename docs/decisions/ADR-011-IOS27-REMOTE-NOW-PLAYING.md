# ADR-011: iOS 27 remote Now Playing adapter

Accepted implementation direction: owner request on September 13, 2026 to begin iOS 27 speaker Lock Screen support, followed by explicit instruction to start the build and plan iOS 27 features for morning deployment. Owner renewed the request September 26, 2026. Build 60 is a signed-candidate target; production enablement and physical acceptance are tracked separately.

This amends ADR-004 and ADR-005 only for presentation of an existing direct-speaker session. Use iOS 27 NowPlaying RemoteMediaSession in the host and a RemoteMediaSessionExtension for metadata and commands while suspended. Keep the existing BFF coordinator as the only queue and remote transport authority. Host local audio remains on the accepted AVPlayer path until supported legacy/new framework ownership transitions are proven.

The extension uses a narrowly scoped revocable BFF grant in shared native Keychain storage, never a browser cookie jar or service credential. It performs commands through the existing ownership/revision/idempotency contract and receives server-driven APNs presentation updates. No secret belongs in attributes or push payloads. Grant expiry removes control authority without stopping the speaker's audio.

A production build must include actual extension signing, native authorization, background command/update evidence and older-OS fallback verification before feature enablement. Merely compiling the SDK model is not acceptance. The implementation sequence, grant decisions, deferred scope and release checklist are in docs/plans/IOS27_FEATURE_ROADMAP.md.
