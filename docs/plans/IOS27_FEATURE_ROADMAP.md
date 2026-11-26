> Historical September 13 design record. Current implementation, candidate and release status: [September 26 runbook](IOS27_DEPLOYMENT_RUNBOOK.md). Old build numbers, flag state and morning dates below are superseded.

# iOS 27 delivery plan

Owner instruction: September 13, 2026, start implementation now and deploy in the morning. Do not upload or deploy tonight. Morning release is a manual readiness decision, not a scheduled job or a promised deadline.

## Confirmed baseline

Build 42, source 90b6357719d9750caffe9b86c117669caace2a7d, merged as 499a47547e606e41c3cc3db8db792df27e1b2a54. Owner confirmed launch on iOS 27, radio playback, and station changes retaining the chosen WiiM speakers. Preserve the scene-lifecycle fixes. Lock/unlock recovery, sleep timer, and remaining ListenBrainz interactions are still QA items.

Implementation branch: codex/ios27-remote-now-playing. Next candidate number is 43, to be assigned only when packaging a candidate. Build 42 stays the pilot baseline until the next candidate passes acceptance.

## Feature order

| Priority | User-visible feature | Implementation and acceptance |
| --- | --- | --- |
| 1 | WiiM/UPnP playback represented on Lock Screen and Control Center | Native iOS 27 NowPlaying remote session plus app extension. One card per existing BFF session; track and station changes update it without speaker re-pairing. Radio is live content with station artwork and no seek/skip controls. |
| 1 | Controls work while NaviMuse is suspended | Extension sends authenticated play/pause/next/previous/seek commands directly to the existing coordinator. No JavaScript wake-up dependency. Queue revision and command IDs prevent stale skips or duplicate commands. |
| 1 | Accurate artwork and playback state across tracks, stations and timer expiry | BFF-driven APNs updates, authenticated artwork, observation timestamps, and stale-update rejection. Test several natural track changes and sleep-timer pause while locked. No once-per-second push loop. |
| 1 | Clean handoff between phone and speakers | Request system priority only for an explicit foreground transfer. Preserve the card through brief loading/reconnection; end it on confirmed release, logout, revoked ownership, or external takeover. Never start phone audio during recovery. Verify Apple's local/legacy media API coexistence rules before enabling host publication. |
| 2 | Expanded layout for the planned iPhone Duo | Available-size and container-based layouts, player/queue side by side where space permits. Resizing preserves the same queue, speaker session, player position, navigation, and focus. Existing phones stay usable. Treat physical Duo acceptance as future work; no speculative hinge dimensions. |
| 2 | System accessibility and motion polish | Validate VoiceOver labels for output and transport, larger text, reduced motion and safe areas in both layouts. These are app requirements, not claimed new iOS 27 APIs. |

Widgets, additional Live Activities, Siri/App Intents, system-local-player migration, group editing, and AI-generated discovery are outside the first candidate. ListenBrainz remains separate from AudioMuse. Do not fold unrelated features into a playback recovery release.

## Engineering decisions

1. **Authority:** existing WiiM BFF coordinator owns playback, queue and speaker state. NowPlaying is a presentation and command adapter. No silent audio loop, second AVPlayer, alternate queue or extension-to-speaker direct transport.
2. **Targets:** host remains iOS 17 minimum, with availability-gated iOS 27 host publisher. New extension has iOS 27 minimum, uses ExtensionFoundation and NowPlaying, and declares `EXExtensionPointIdentifier=com.apple.nowplaying.remote-media`. Preserve the Build 42 single-window scene manifest. Prove embedding the newer extension in the older host with archive validation and fallback launch before release.
3. **Authorization:** add an opaque revocable grant for this feature, issued only through the authenticated BFF account binding and confirmed speaker-session ownership. Store only its hash server-side; scope to principal, music binding, speaker session and native installation. Native shared Keychain stores the grant with a host/extension-only access group and AfterFirstUnlockThisDeviceOnly accessibility. Never copy a broad login cookie, Navidrome credentials, media grant or secret into attributes/APNs. Proposed maximum grant lifetime: 12 hours, renewable in the foreground after fresh authorization; expired access requires reopening the app. Playback itself must not stop because the display grant expires.
4. **BFF routes:** feature-gated grant issue/revoke and push-token registration; grant-authenticated snapshot, artwork and allowlisted command routes. Every read/command checks current account/binding/session ownership, not just token validity. Commands delegate to the existing command path. On ambiguous network outcomes, reconcile; never automatically retry next/previous with a new command ID.
5. **Updates:** native host starts/updates/ends during foreground use. Extension registers its per-session push token with the BFF. APNs uses `nowplaying` and the documented bundle topic. First release starts sessions only from explicit app transfers; defer push-to-start registration to avoid unexpectedly restoring user-dismissed controls. Push update/end events are session-scoped, coalesced, ordered, bounded and contain presentation data only. Recheck revocation before deferred delivery; prune invalid/rotated tokens.
6. **Art:** use existing canonical station/song cover IDs through the scoped BFF artwork route. Restrict size/content type, cache per binding and artwork ID, discard stale completions, and clear on logout. Never accept arbitrary upstream artwork URLs from a push.
7. **Enablement:** default off until authenticated extension commands and background updates work. Availability detection must come from the native bridge. Older iOS and browser paths continue existing behavior.

## Implementation slices and current state

- **Implemented:** BFF scoped grants and native-command/artwork routes; shared Keychain client and first-party bootstrap; native foreground bridge; ExtensionFoundation entry point and ExtensionKit target; APNs token registration and server update/end delivery. Host Swift 6 and extension code compile together into an unsigned development archive. The native and server feature flags remain off.
- **Verified:** focused projection, authorization, expiry/revocation, command boundary, push coalescing/backoff and bridge tests; 94 playback/coordinator/client/radio tests, 115 existing server tests and 61 player integration tests. Native timestamp checks and unsigned host/extension archive layout checks pass. See IOS27_DEPLOYMENT_RUNBOOK.md.
- **Required before candidate:** owner's APNs key/configuration, signed host/extension provisioning and actual shared Keychain access, live push delivery, physical iOS 27 and older-OS fallback QA. No signed/distributed build or enabled deployment is claimed.

## Morning release checklist

- Owner is actively QA testing Build 42 and will add TestFlight feedback tonight. Pull the latest screenshot feedback **and crash submissions** immediately before preparing the morning candidate. Triage by build/OS/date; fix relevant regressions and include their checks before choosing the final release scope. Do not rely on the previous count of 136 submissions.

- Exported host and extension have correct identifiers, supported platform versions, keychain groups, APNs entitlement/provisioning, and no secrets in bundle or attributes.
- Actual iOS 27 phone: speaker transfer → lock → natural track change → pause/resume → skip → reopen; station switch preserves output and updates art; sleep timer pauses; return to phone removes remote card and uses local controls.
- Confirm the extension executes commands and updates while the WebView is suspended, not only immediately after locking.
- Test stale/duplicate commands, late account responses, logout, grant expiration/revocation, network loss/recovery, another controller taking over, and another media app gaining priority.
- Check iOS 26 fallback launch/local playback and Build 42 radio continuity. Run focused coordinator/account/native tests; record versions and actual device evidence.
- Code review and packaging pass. Only then choose the final build number, upload once, verify VALID and pilot membership, and record release notes. Otherwise retain Build 42 and report the specific failed gate.

Apple owns system presentation priority; user dismissal and other media apps remain supported. This feature cannot promise an undismissable player.

## Sources checked against Xcode 27.0 (27A266a)

- https://developer.apple.com/documentation/nowplaying/publishing-remote-media-sessions
- https://developer.apple.com/documentation/nowplaying/remotemediasession
- Installed iPhoneOS27.0 SDK NowPlaying.swiftinterface (host APIs and extension availability)
- docs/plans/IPHONE_DUO_ADAPTIVE_LAYOUT.md (owner direction and reference-kit limits)
