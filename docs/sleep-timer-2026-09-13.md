# Sleep timer

Implemented from production main `49ee070` on `codex/sleep-timer`.

The player’s three-dot menu opens a Sleep timer submenu with 15, 30, 45,
60, and 90-minute presets. An active timer shows its countdown and can be
replaced or cancelled. Expiry pauses playback and preserves the queue and
position for manual continuation. The existing Pause after current action
remains separate. Manual pause does not extend the deadline.

## Ownership and lifecycle

- Browser/macOS web playback uses an absolute deadline and the existing local
  pause path, including cancellation of pending playback/transition intents.
  Focus and visibility changes catch up delayed browser callbacks. Browser
  suspension can delay expiry; this is not a browser background scheduling guarantee.
- iOS advertises a native sleep-timer capability. Its native timer pauses both
  AVPlayer decks and cancels recovery/interruption resume. Playback time observers
  and play requests also check the deadline. The UI reads acknowledged native state;
  older native shells ask the user to update instead of silently relying on a browser timer.
- Home speakers store their deadline in the existing account-scoped remote session.
  The coordinator checks expiry through its normal serialized polling path, including
  after restart, before natural queue advancement. It verifies stream/group ownership
  before pausing. A failed pause retains the deadline for retry after reconciliation.
  Hardware or server outages can delay expiry.
- Timers belong to the current output. Transferring away from local playback cancels
  its timer; a new speaker session needs its own timer. Releasing a speaker clears
  its timer. Local timers clear on account teardown or document/native reset.

## Validation

182 selected tests pass: timer deadlines, hook/native acknowledgement, menu behavior,
WiiM coordinator/client/HTTP/Journey behavior, native audio/recovery/media policy,
and player integration/state. Tests include replacement, cancellation, delayed
callbacks, output transfer, expiry at a natural boundary, external-source takeover,
server restart, failed speaker pause, and manual continuation.

`npm run build` passes for web plus the bundled online/offline iOS screens.
The Objective-C implementation passes an iPhoneOS arm64 syntax/compile check with
SDK 26.5 and iOS 17 deployment target. Host: macOS 26.6.2 (25G83), Node 26.7.0.

The fixture menu was visually checked in the in-app browser at 1280×720 and 393×852.
All duration choices and cancellation fit the submenu/drawer. This was fixture UI
verification, not live playback or native accessibility acceptance.

Remaining release validation: signed iOS build and physical-device locked-screen
expiry (streamed/downloaded audio and AirPlay), real speaker expiry, and VoiceOver.
Build 24 packages this feature for the owner-authorized active QA release.
Deployment and TestFlight acceptance are recorded in the release handoff after verification.
