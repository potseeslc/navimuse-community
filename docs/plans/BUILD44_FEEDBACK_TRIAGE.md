# Build 44 feedback candidate

Based on main cfb3759 (Build 43), September 14, 2026. Latest ASC pull: 153 screenshot submissions, including two new Build 43 reports. Only crash submission remains Build 40; no Build 42/43 crash submissions returned.

## New reports

- ACJ4NqJWfW1cJ_etxQgiE84 (12:43 UTC): space above Back to albums and center the cover. Added spacing and centered the 280px artwork. At 402px viewport, cover bounds are left 61/right 341; no horizontal overflow.
- AF1klauLyoNxdc1-m85Oc0E (12:39 UTC): Pocket ID passkey not offered; email recovery required. Build 43's signed IPA lacks webcredentials:id.example.com even though both the generated project and profile allow it. The no-sign archive/export path lost the entitlement. New export script carries requested entitlements into App Store export, then requires an Apple distribution signature and the associated domain in the actual IPA. Export trial passed; physical sign-in still requires iPhone QA.

## Earlier feedback included

- Search sheet from Discover/Library; Listening statistics replace Search in primary navigation. Existing Search deep links remain valid. Search restores focus and closes before opening a result/player.
- Integrations, Services, and Diagnostics consolidated under Connections & status. Account/security controls remain in Account; owner-only controls retain their checks.
- Queue download action with progress and failure feedback, no automatic Downloads navigation. Download settings include Unlimited with existing per-file and physical free-space limits retained.
- Downloads grouped by album and saved playlist association. Album order uses disc/track; playlist order persists with the association. Existing downloaded songs can gain a playlist association without redownloading. Individual retry/remove controls remain reachable.
- Touch queue drag handles, keyboard and arrow controls, existing reorder motion and reduced-motion support. Reordering preserves current/played items and cannot cross the generated-continuation boundary; remote queue edits still use the coordinator.
- Playlist coverArt surfaced in lists/details. Scoped genres use artwork from the representative album already returned by the membership query; otherwise upstream coverArt or an icon fallback is used. No invented genre artwork identifiers.
- Optional album notes through Navidrome getAlbumInfo2, rendered as plain text using the biography expansion. Metadata failures do not block tracks. Reference: https://opensubsonic.netlify.app/docs/endpoints/getalbuminfo2/
- ListenBrainz statistics show matching library artwork; missing artwork leaves readable data. Mix cards play only matched library tracks. Discover includes a distinct ListenBrainz listening section and latest mix. Profile and cached results remain account/revision scoped.
- Phone mini-player uses rounded translucent styling; reduced transparency uses an opaque background.

## Verification

43 focused JS checks passed before final packaging, including queue boundaries/accessibility, download grouping/controller, account switching in ListenBrainz, album detail, scoped genre pagination, settings drafts, and playlist layout. Production Vite and embedded iOS shell builds passed. Native simulator store and download harnesses passed, including real AVPlayer readiness, revocation, cancellation, persisted Unlimited preference and playlist associations. Simulator: iPhone 17 Pro, iOS 26.5; Xcode 27. No physical playback retest performed.

Browser fixture verified 402px centered cover, Search input focus/Escape restoration, pointer drag from position 2 to 4, and keyboard move with reduced motion enabled. Browser emulation was reset afterward. Fixtures are not authenticated production acceptance.

## Separate iOS 27 work

PR 456 remains separate. Remote Lock Screen code exists, but extension provisioning, APNs pilot deployment, signed host/extension validation, and physical background/lock-screen acceptance remain before enabling it. APNs key was supplied after its original runbook was written; the key must stay outside source control. Build 44 does not enable or ship that extension.

## Device QA for this candidate

Pocket ID passkey prompt; Search result playback and return navigation; grouped playlist downloads and offline restart; Unlimited selection; download progress without navigation; touch reorder while playing locally and on WiiM; ListenBrainz artwork/mixes under the current account; mini-player readability. Existing radio/speaker continuity remains a regression check.

## Additional September 14 feedback (13:13–13:15 UTC)

- ACkAEmY05zvA2rpUozcmwVY: remove unsolicited WiiM branding from Play on. The speaker footer and AirPlay handoff now use generic speaker terminology; actual device names remain intact.
- AIHb_pq5nI5jLn7N1mPPli8: screenshot shows Nutshell at 4:19 / -0:00 and an outside-playback stop warning. Screenshot does not establish the underlying cause. Regression tests reproduced a missed-completion case when the last playing poll is five seconds before the end and the next poll observes the terminal position. Completion now accepts a final position corroborated by elapsed time and fresh playing evidence for the same owned URI. Mid-track stops, stale observations, source changes, and restart without prior playing evidence remain suspended. Unknown stops no longer assert another controller caused them.

62 speaker contract/coordinator/radio tests pass, including delayed terminal observation advancing exactly once on the same speaker and a mid-track stop remaining suspended. Physical reproduction of the Nutshell report is still needed. The end-of-track correction is in the server coordinator and therefore requires deployment of this candidate's server as well as the app update for the wording changes.
