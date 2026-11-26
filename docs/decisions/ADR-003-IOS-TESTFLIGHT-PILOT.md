# ADR-003: Early iOS TestFlight comparison pilot

Status: accepted for a bounded pilot by the owner on 2026-09-08.

The owner requested Tauri iOS and TestFlight using the current live application,
and confirmed Apple Developer membership. This supersedes ADR-001 and the master
plan only for starting an iOS comparison pilot before M8 completion. It does not
mark M8 complete or promise the full M9 feature set.

Use live source ec15ba6 as the shell baseline, the existing authenticated HTTPS
BFF at https://navimuse.example.com, and the shared queue. The shell navigates to
the live first-party application; its UI can therefore change with server deploys.
Record the server asset revision during each device test. No service credentials
are bundled and no Rust IPC permissions are granted to the remote application.

First build retains HTML audio to measure installed WKWebView behavior. It does
not claim native AVPlayer, background audio, receiver artwork, or media-command
fixes. Native audio integration requires a subsequent bounded implementation with
one queue authority if this comparison shows it is needed.

Validate build/signing, login, library, start/pause/resume, screen lock, switching
apps, next/previous, album advance, Bluetooth and AirPlay. Record physical-device
results separately from simulator/build checks. TestFlight distribution requires
App Store Connect registration, iOS signing, processing and any applicable review.
Keep the existing web deployment operational.

Build 2, authorized by the owner after build 1 device feedback, adds native
safe-area constraints and a restricted MediaPlayer Previous/Next bridge into
the same web queue. No general remote Rust IPC, second queue, native audio
engine, or background execution guarantee is added. The bridge is restricted
to the main frame at the production HTTPS origin. Physical device acceptance
is required before claiming the system-control issue resolved.

## September 12: packaged online startup

The owner's five-step reliability work authorizes removing the remote document
from the cold-start critical path. Superseding the initial live-document startup,
the next TestFlight binary packages the same React interface for online startup
and loads it with the production HTTPS base URL. The offline document stays
separate and retains its network-denying CSP. Online CSP allows only first-party
API/media/artwork requests. No API response, credentials or authenticated state
is bundled. Existing BFF session checks still precede account/library access.

The restricted bridge remains main-frame and production-origin only. The existing
native AVPlayer, queue, stream cache and offline entitlement checks are unchanged.
Downloaded music is reachable while online configuration is pending; entering it
still goes through the native offline authorization/ownership boundary.

Packaged interface changes now require a TestFlight binary. Browser/PWA releases
remain independently deployable, and authentication navigation can still visit the
live first-party site. Record both the binary and BFF revision during acceptance.
A native WebKit probe verified the HTTPS origin and real Pocket ID sign-in gate;
with all fetches stalled, the mounted loading UI and downloads action appeared
in 0.89 seconds. This is a macOS WebKit mechanics result, not iPhone field timing.
The iOS Objective-C compile and 24 focused frontend/native-boundary tests passed.
Signed iOS package and house-to-car device checks remain release acceptance work.
