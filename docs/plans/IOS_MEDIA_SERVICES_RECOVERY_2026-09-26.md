# iOS media-services recovery — Build 62

Base: NaviMuse `54f01e3` (Build 61). The supplied iPhone/iOS 27 export contains repeated AVFoundation `-11819` startup failures at 0:00 with no buffered audio, including events before Build 61 was uploaded. This identifies media services being unavailable/reset; it does not establish what caused that system failure, nor explain the separate mid-song audio-repeat report.

Apple requires recreating audio objects and resetting session configuration after media-services reset, with playback waiting for explicit user action:
https://developer.apple.com/documentation/avfaudio/avaudiosession/mediaserviceswereresetnotification

The previous implementation replaced player items but retained its AVQueuePlayers and MPNowPlayingSession. This change handles reset notifications and direct/wrapped AVFoundation reset errors, cancels old play/seek/recovery work, detaches observers and remote commands, and constructs fresh players and a fresh session outside KVO callbacks. It preserves song position and queue control settings, rejects stale authenticated loads, and waits for Play. The interface identifies an audio-system restart instead of suggesting a network/login failure. Diagnostic events record service loss/reset and reconstruction without saving URLs or error descriptions.

Verification: Xcode 27 SDK native compilation; iPhone 17 Pro simulator on iOS 26.5 (A35D7234-4F2C-4275-B1C1-11ACACF20EE3). Production-controller regression covers wrapped-error classification, cancellation, duplicate reset coalescing, replacement of player/session, retained position/output controls, no autoplay, actual WAV preparation and a second reset. Existing native startup, stream recovery and real AVQueuePlayer handoff fixtures passed. JavaScript native transport tests and playback-log privacy checks passed; production web bundle builds.

Physical iOS 27 acceptance remains required: return from UPnP speakers to This device, start a song, lock/unlock and use remote Play, pause/seek/Next, and collect a new log if startup still fails. Simulator reconstruction is not proof that the original device fault is eliminated. Gapless remains an opt-in preview.
